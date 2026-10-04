import json
import subprocess
import sys
import types
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import cortes, direcao, main, midia, motores, pipeline, projeto, referencias, transcricao


@pytest.fixture
def enfileirados(tmp_path, monkeypatch):
    monkeypatch.setattr(projeto, 'RAIZ', tmp_path / 'projetos')
    monkeypatch.setattr(referencias, 'RAIZ', tmp_path / 'referencias')
    monkeypatch.setattr(direcao, 'enfileirar', lambda id: chamadas.append(('referencia', id)))
    # isolamento total: nenhum teste lê o .env de verdade nem chama serviço pago (ElevenLabs, OpenRouter)
    monkeypatch.setattr(pipeline, 'load_dotenv', lambda *a, **k: None)
    monkeypatch.setattr(main, 'load_dotenv', lambda *a, **k: None)
    for chave in ('ELEVENLABS_API_KEY', 'OPENROUTER_API_KEY'):
        monkeypatch.delenv(chave, raising=False)
    projeto.salvar_config({'motor_padrao': 'whisper-stable'})  # o padrão de fábrica é o ElevenLabs; os testes partem do Whisper
    chamadas = []
    monkeypatch.setattr(pipeline, 'enfileirar', lambda id, passos=pipeline.PASSOS: chamadas.append((id, passos)))
    # motores extras: nos testes nunca rodam de verdade (são modelos pesados); só registramos que foram pedidos
    monkeypatch.setattr(pipeline, '_fila_motores', types.SimpleNamespace(submit=lambda f, *a: chamadas.append(('motores', *a))))
    return chamadas


@pytest.fixture
def cliente(enfileirados):
    return TestClient(main.app)


@pytest.fixture(scope='session')
def video(tmp_path_factory):
    """Vídeo vertical de 3 s: 1 s de tom, 1 s de silêncio, 1 s de tom."""
    arq = tmp_path_factory.mktemp('midia') / 'teste.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=30:duration=3',
                    '-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,2),0,sin(2*PI*440*t))':d=3",
                    '-shortest', '-pix_fmt', 'yuv420p', str(arq)], check=True)
    return arq


def _criar(cliente, video, nome='E'):
    with video.open('rb') as b:
        return cliente.post('/api/projetos', data={'nome': nome}, files={'bruto': ('x.mp4', b, 'video/mp4')}).json()


def test_criar_listar_abrir_e_enfileirar(cliente, video, enfileirados):
    with video.open('rb') as b, video.open('rb') as a:
        r = cliente.post('/api/projetos', data={'nome': 'Melhor IA de Design', 'briefing_texto': 'foco no processo'},
                         files=[('bruto', ('meu bruto.mp4', b, 'video/mp4')), ('apoios', ('site.mp4', a, 'video/mp4'))])
    assert r.status_code == 200, r.text
    p = r.json()
    assert p['id'] == 'melhor-ia-de-design'
    bruto, apoio = p['fontes']
    assert (bruto['papel'], bruto['largura'], bruto['altura'], bruto['tem_audio']) == ('bruto', 360, 640, True)
    assert apoio['papel'] == 'apoio' and apoio['nome_original'] == 'site.mp4'
    assert enfileirados == [('melhor-ia-de-design', pipeline.PASSOS)]
    assert [x['id'] for x in cliente.get('/api/projetos').json()] == ['melhor-ia-de-design']
    assert cliente.get(f"/api/projetos/{p['id']}/arquivos/{bruto['arquivo']}").status_code == 200


def test_nome_repetido_ganha_sufixo(cliente, video):
    _criar(cliente, video, 'Teste')
    assert _criar(cliente, video, 'Teste')['id'] == 'teste-2'


def test_renomear_muda_so_o_nome(cliente, video):
    id = _criar(cliente, video, 'Antigo')['id']
    r = cliente.put(f'/api/projetos/{id}/nome', json={'nome': '  Novo nome  '})
    assert r.status_code == 200 and r.json()['nome'] == 'Novo nome' and r.json()['id'] == id
    assert cliente.get('/api/projetos').json()[0]['nome'] == 'Novo nome'
    assert cliente.put(f'/api/projetos/{id}/nome', json={'nome': '   '}).status_code == 422
    assert cliente.put('/api/projetos/nao-existe/nome', json={'nome': 'X'}).status_code == 404


def test_arquivo_invalido_nao_deixa_lixo(cliente, enfileirados):
    r = cliente.post('/api/projetos', data={'nome': 'Ruim'}, files={'bruto': ('x.mp4', b'nao e video', 'video/mp4')})
    assert r.status_code == 422
    assert cliente.get('/api/projetos').json() == [] and enfileirados == []


def test_nao_sai_da_pasta_do_projeto(cliente, video):
    _criar(cliente, video, 'A')
    assert cliente.get('/api/projetos/a/arquivos/../../etc/passwd').status_code == 404
    assert cliente.get('/api/projetos/..%2F..').status_code == 404


def test_chat_guarda_historico_por_etapa(cliente, video):
    _criar(cliente, video)
    r = cliente.post('/api/projetos/e/chat/cortes', json={'texto': 'volta a primeira tentativa'})
    assert [m['autor'] for m in r.json()] == ['rodrigo', 'agente']
    p = cliente.get('/api/projetos/e').json()
    assert len(p['chats']['cortes']) == 2 and p['chats']['inserts'] == []
    assert cliente.post('/api/projetos/e/chat/xpto', json={'texto': 'oi'}).status_code == 404


def test_miniatura(cliente, video):
    _criar(cliente, video)
    r = cliente.get('/api/projetos/e/miniatura')
    assert r.status_code == 200 and r.headers['content-type'] == 'image/jpeg'


def test_editor_antes_de_processar_vem_vazio(cliente, video):
    _criar(cliente, video)
    assert cliente.get('/api/projetos/e/editor').json()['palavras'] == []
    assert cliente.post('/api/projetos/e/cortes/refazer').status_code == 409


# ---------------------------------------------------------------- cortes

def _palavras(*tempos):
    return [{'id': f'w{i:05d}', 'texto': f'p{i}', 'inicio': a, 'fim': b} for i, (a, b) in enumerate(tempos)]


def test_clipes_puxam_bordas_para_silencios_e_juntam_trechos():
    palavras = _palavras((1.0, 1.4), (1.5, 2.0), (3.0, 3.5), (3.6, 4.0))
    silencios = [{'inicio': 0.0, 'fim': 0.95, 'dur': 0.95}, {'inicio': 2.1, 'fim': 2.9, 'dur': 0.8}]
    clipes = cortes.montar_clipes(palavras, [True, False, True, True], silencios, 5.0)
    # a palavra 1 sai: dois clipes; bordas encostadas nos silêncios, com 0,1 s de folga
    assert [(c['inicio'], c['fim'], c['palavra_ini'], c['palavra_fim']) for c in clipes] == [
        (0.85, 1.5, 'w00000', 'w00000'), (2.8, 4.1, 'w00002', 'w00003')]


def test_borda_do_clipe_nunca_invade_a_palavra_removida_vizinha():
    # a palavra mantida termina em 0,5; logo depois vem uma palavra removida (0,5–0,9) e só então a pausa (1,0–2,0)
    palavras = _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5))
    silencios = [{'inicio': 0.0, 'fim': 0.05, 'dur': 0.05}, {'inicio': 1.0, 'fim': 2.0, 'dur': 1.0}]
    c = cortes.montar_clipes(palavras, [True, False, True], silencios, 3.0)
    assert c[0]['fim'] <= 0.5 and c[1]['inicio'] >= 1.9  # a borda de saída para na palavra removida; a de entrada vem da pausa
    # e o inverso: a palavra removida vem ANTES da mantida
    palavras = _palavras((0.1, 0.5), (0.6, 1.0))
    silencios = [{'inicio': 0.5, 'fim': 0.55, 'dur': 0.05}, {'inicio': 1.2, 'fim': 1.5, 'dur': 0.3}]
    c = cortes.montar_clipes(palavras, [False, True], silencios, 3.0)
    assert c[0]['inicio'] >= 0.5


def test_margens_antes_e_depois_do_corte_sao_independentes():
    # trecho mantido: 1,0–1,4; antes dele há uma pausa de 0,5–0,95 e depois, uma de 1,5–2,5
    palavras = _palavras((1.0, 1.4))
    silencios = [{'inicio': 0.5, 'fim': 0.95, 'dur': 0.45}, {'inicio': 1.45, 'fim': 2.5, 'dur': 1.05}]
    padrao = cortes.montar_clipes(palavras, [True], silencios, 3.0)
    assert (padrao[0]['inicio'], padrao[0]['fim']) == (0.85, 1.55)  # 100 ms de ar de cada lado

    largas = cortes.montar_clipes(palavras, [True], silencios, 3.0, folga_inicio=0.3, folga_fim=0.5)
    assert (largas[0]['inicio'], largas[0]['fim']) == (0.65, 1.95)  # 300 ms antes da palavra, 500 ms depois

    curtas = cortes.montar_clipes(palavras, [True], silencios, 3.0, folga_inicio=0.0, folga_fim=0.02)
    assert (curtas[0]['inicio'], curtas[0]['fim']) == (0.95, 1.47)  # sem ar antes: começa onde a pausa termina

    enorme = cortes.montar_clipes(palavras, [True], silencios, 3.0, folga_inicio=2.0, folga_fim=2.0)
    assert (enorme[0]['inicio'], enorme[0]['fim']) == (0.5, 2.5)  # nunca passa da pausa que a contém


def test_margens_vem_da_configuracao_em_ms():
    assert cortes.parametros({})['folga_inicio'] == 0.1 and cortes.parametros({})['folga_fim'] == 0.1
    ps = cortes.parametros({'antes_do_corte_ms': 250, 'depois_do_corte_ms': 40})
    assert ps['folga_fim'] == 0.25 and ps['folga_inicio'] == 0.04  # "antes do corte" = depois da última palavra


def test_pausa_dentro_do_trecho_so_e_cortada_se_for_muito_longa():
    palavras = _palavras((0.0, 0.5), (3.0, 3.5))
    longa = [{'inicio': 0.6, 'fim': 2.9, 'dur': 2.3}]
    clipes = cortes.montar_clipes(palavras, [True, True], longa, 4.0)
    assert [(c['inicio'], c['fim']) for c in clipes] == [(0.0, 1.0), (2.5, 3.6)]  # sobra 0,4 s de cada lado
    curta = [{'inicio': 0.6, 'fim': 1.9, 'dur': 1.3}]  # 1,3 s: respiro que Rodrigo quer manter
    assert len(cortes.montar_clipes([*palavras[:1], {'id': 'w00001', 'texto': 'p1', 'inicio': 2.0, 'fim': 2.5}], [True, True], curta, 4.0)) == 1


def test_validar_recusa_ids_inventados_e_fora_de_ordem():
    palavras = _palavras((0, 1), (1, 2), (2, 3))
    T = cortes.Trecho
    assert cortes.validar(cortes.Selecao(manter=[T(ini='w00000', fim='w00000'), T(ini='w00002', fim='w00002')], duvidas=[]), palavras) \
        == [['w00000', 'w00000'], ['w00002', 'w00002']]
    for manter in ([T(ini='w00009', fim='w00009')], [T(ini='w00002', fim='w00001')],
                   [T(ini='w00001', fim='w00002'), T(ini='w00000', fim='w00000')], []):
        with pytest.raises(ValueError):
            cortes.validar(cortes.Selecao(manter=manter, duvidas=[]), palavras)


def test_transcricao_por_pedacos_entre_pausas_longas():
    silencios = [{'inicio': 0.0, 'fim': 4.0, 'dur': 4.0},   # começo mudo: pulado
                 {'inicio': 5.0, 'fim': 7.0, 'dur': 2.0},   # pausa entre tentativas: divide no meio
                 {'inicio': 8.0, 'fim': 8.4, 'dur': 0.4}]   # pausa curta: não divide
    assert transcricao.pedacos(silencios, 10.0) == [(2.0, 6.0), (6.0, 10.0)]


def _wav(caminho, trechos, taxa=16000):
    """trechos: [(segundos, amplitude 0–1)]: tom de 440 Hz com essa amplitude (0 = silêncio)."""
    x = np.concatenate([a * np.sin(2 * np.pi * 440 * np.arange(int(s * taxa)) / taxa) for s, a in trechos])
    with wave.open(str(caminho), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(taxa)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def test_picos_acompanham_a_amplitude_real(tmp_path):
    _wav(tmp_path / 'a.wav', [(1.0, 0.8), (1.0, 0.0), (1.0, 0.1)])
    p = midia.picos(tmp_path / 'a.wav')
    assert len(p) == 3 * midia.PICOS_POR_SEGUNDO
    alto, mudo, baixo = p[100], p[300], p[500]
    assert mudo == 0 and alto > baixo > 20  # a raiz deixa a fala baixa visível


def _stable_falso(monkeypatch, palavras_devolvidas):
    seg = types.SimpleNamespace(words=[types.SimpleNamespace(word=w, start=a, end=b) for w, a, b in palavras_devolvidas])
    modelo = types.SimpleNamespace(align=lambda audio, texto, language: types.SimpleNamespace(segments=[seg]))
    monkeypatch.setitem(sys.modules, 'stable_whisper', types.SimpleNamespace(load_mlx_whisper=lambda m: modelo))


def test_refinar_troca_so_os_tempos_e_guarda_os_do_whisper(monkeypatch, tmp_path):
    originais = _palavras((0.0, 1.0), (1.0, 1.5))
    _stable_falso(monkeypatch, [('p0', 0.3, 0.6), ('p1', 1.1, 1.4)])
    novas, aviso = transcricao.refinar(tmp_path / 'x.wav', originais)
    assert aviso is None
    assert [(w['texto'], w['inicio'], w['fim'], w['inicio_whisper'], w['fim_whisper']) for w in novas] == [
        ('p0', 0.3, 0.6, 0.0, 1.0), ('p1', 1.1, 1.4, 1.0, 1.5)]


def test_refinar_mantem_tudo_se_o_alinhamento_nao_bate(monkeypatch, tmp_path):
    originais = _palavras((0.0, 1.0), (1.0, 1.5))
    _stable_falso(monkeypatch, [('p0', 0.3, 0.6)])
    novas, aviso = transcricao.refinar(tmp_path / 'x.wav', originais)
    assert novas == originais and '1 palavras para 2' in aviso


def test_refinar_ignora_palavra_com_duracao_invalida(monkeypatch, tmp_path):
    originais = _palavras((0.0, 1.0), (1.0, 1.5))
    _stable_falso(monkeypatch, [('p0', 0.3, 0.3), ('p1', 1.1, 1.4)])
    novas, _ = transcricao.refinar(tmp_path / 'x.wav', originais)
    assert (novas[0]['inicio'], novas[0]['fim']) == (0.0, 1.0) and novas[1]['inicio'] == 1.1


def _cena_de_ajuste():
    """4 palavras em sequência; as duas do meio saem. Clipes: [0–1] e [3–4]."""
    palavras = _palavras((0.0, 0.5), (0.5, 1.0), (1.5, 2.0), (3.0, 3.5), (3.5, 4.0))
    fica = [True, True, False, True, True]
    clipes = [{'id': 'c1', 'fonte': 'f1', 'inicio': 0.0, 'fim': 1.1, 'palavra_ini': 'w00000', 'palavra_fim': 'w00001'},
              {'id': 'c2', 'fonte': 'f1', 'inicio': 2.9, 'fim': 4.0, 'palavra_ini': 'w00003', 'palavra_fim': 'w00004'}]
    return palavras, fica, clipes


def test_arrastar_a_borda_para_dentro_de_uma_palavra_removida_a_mantem():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.ajustar_borda(clipes, palavras, fica, 'c1', 'fim', 1.9, 4.0)  # estica o clipe 1 sobre a palavra 2
    assert nova == [True, True, True, True, True]
    assert (clipes[0]['fim'], clipes[0]['palavra_fim']) == (1.9, 'w00002') and clipes[0]['auto'] == {'inicio': 0.0, 'fim': 1.1}
    assert cortes.faixas_de(palavras, nova) == [['w00000', 'w00004']]


def test_encolher_o_trecho_remove_a_palavra_que_ficou_de_fora():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.ajustar_borda(clipes, palavras, fica, 'c2', 'inicio', 3.6, 4.0)  # a palavra 3 fica 20% dentro
    assert nova == [True, True, False, False, True] and clipes[1]['palavra_ini'] == 'w00004'


def test_ajuste_respeita_vizinhos_tamanho_minimo_e_limites():
    palavras, fica, clipes = _cena_de_ajuste()
    for lado, t, cid in [('fim', 3.0, 'c1'), ('inicio', 1.0, 'c2'), ('fim', 0.01, 'c1'), ('inicio', -1.0, 'c1'), ('fim', 9.0, 'c2')]:
        with pytest.raises(ValueError):
            cortes.ajustar_borda(clipes, palavras, fica, cid, lado, t, 4.0)
    assert (clipes[0]['inicio'], clipes[0]['fim'], clipes[1]['inicio'], clipes[1]['fim']) == (0.0, 1.1, 2.9, 4.0)
    assert 'auto' not in clipes[0] and 'auto' not in clipes[1]  # recusado não deixa rastro


def test_ajuste_que_esvazia_o_trecho_e_recusado():
    palavras, fica, clipes = _cena_de_ajuste()
    with pytest.raises(ValueError, match='sem nenhuma palavra'):
        cortes.ajustar_borda(clipes, palavras, fica, 'c1', 'fim', 0.06, 4.0)
    assert clipes[0]['fim'] == 1.1


def test_restaurar_devolve_bordas_e_palavras_ao_que_a_ia_decidiu():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.ajustar_borda(clipes, palavras, fica, 'c1', 'fim', 1.9, 4.0)
    volta = cortes.restaurar_clipe(clipes, palavras, nova, fica, 'c1')
    assert volta == fica and (clipes[0]['fim'], clipes[0]['palavra_fim']) == (1.1, 'w00001') and 'auto' not in clipes[0]
    with pytest.raises(ValueError):
        cortes.restaurar_clipe(clipes, palavras, volta, fica, 'c1')


def test_ajuste_pela_api_persiste_e_aparece_no_editor(cliente, video, monkeypatch):
    _criar(cliente, video)
    falsas = _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5), (2.5, 2.9))
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: falsas)
    monkeypatch.setattr(transcricao, 'refinar', lambda audio, palavras: (palavras, None))
    monkeypatch.setattr(cortes, 'selecionar', lambda palavras, silencios, briefing: {
        'mantidas': [['w00000', 'w00000'], ['w00002', 'w00003']], 'duvidas': [], 'modelo': 'falso'})
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)
    v1 = cliente.get('/api/projetos/e').json()['timeline']['V1']
    c1 = v1[0]

    r = cliente.post(f"/api/projetos/e/clipes/{c1['id']}/ajustar", json={'lado': 'fim', 't': 0.95})
    assert r.status_code == 200, r.text
    e = cliente.get('/api/projetos/e/editor').json()
    assert e['timeline']['V1'][0]['fim'] == 0.95 and e['timeline']['V1'][0]['auto']['fim'] == c1['fim']
    assert [w['mantida'] for w in e['palavras']] == [True, True, True, True]  # a palavra 1 foi incorporada

    assert cliente.post(f"/api/projetos/e/clipes/{c1['id']}/ajustar", json={'lado': 'fim', 't': 2.5}).status_code == 422
    assert cliente.post('/api/projetos/e/clipes/xx/ajustar', json={'lado': 'fim', 't': 1.0}).status_code == 422

    assert cliente.post(f"/api/projetos/e/clipes/{c1['id']}/restaurar").status_code == 200
    e = cliente.get('/api/projetos/e/editor').json()
    assert e['timeline']['V1'][0]['fim'] == c1['fim'] and 'auto' not in e['timeline']['V1'][0]
    assert [w['mantida'] for w in e['palavras']] == [True, False, True, True]


# ---------------------------------------------------------------- vários motores de transcrição

def _processado(cliente, video, monkeypatch):
    """Projeto 'e' com o pipeline principal feito (Whisper falso) e cortes prontos."""
    _criar(cliente, video)
    falsas = _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5), (2.5, 2.9))
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: falsas)
    monkeypatch.setattr(transcricao, 'refinar', lambda audio, palavras: ([{**w, 'inicio': w['inicio'] + 0.01} for w in palavras], None))
    monkeypatch.setattr(cortes, 'selecionar', lambda palavras, silencios, briefing: {
        'mantidas': [['w00000', 'w00000'], ['w00002', 'w00003']], 'duvidas': [], 'modelo': 'falso'})
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)
    return falsas


def test_projeto_antigo_vira_conjunto_de_variantes(cliente, video, tmp_path):
    _criar(cliente, video)
    base = projeto.pasta('e')
    p = json.loads((base / 'projeto.json').read_text())
    for k in ('transcricoes', 'transcricao_ativa'):
        p.pop(k)
    p['cortes'] = {'mantidas': [['w00000', 'w00000']]}
    (base / 'projeto.json').write_text(json.dumps(p))
    (base / 'transcricao.json').write_text(json.dumps({'palavras': [
        {'id': 'w00000', 'texto': 'oi', 'inicio': 0.3, 'fim': 0.6, 'inicio_whisper': 0.1, 'fim_whisper': 0.7}]}))

    p = projeto.ler('e')
    assert p['transcricao_ativa'] == 'whisper-stable'
    assert p['transcricoes']['whisper-stable']['status'] == 'pronto' and p['transcricoes']['parakeet']['status'] == 'pendente'
    assert projeto.ler_palavras('e', 'whisper-stable')[0]['inicio'] == 0.3
    pura = projeto.ler_palavras('e', 'whisper')[0]  # o Whisper puro sai dos tempos originais guardados
    assert (pura['inicio'], pura['fim']) == (0.1, 0.7) and 'inicio_whisper' not in pura
    assert not (base / 'transcricao.json').exists() and p['pipeline']['passos']['variantes']['status'] == 'pendente'


def test_trocar_dentro_da_familia_nao_mexe_nos_cortes(cliente, video, monkeypatch):
    _processado(cliente, video, monkeypatch)
    projeto.atualizar('e', lambda p: p['transcricoes']['whisper'].update(status='pronto'))
    antes = projeto.ler('e')
    assert projeto.atualizar('e', lambda p: projeto.ativar_variante(p, 'whisper')) is not None
    depois = projeto.ler('e')
    assert depois['transcricao_ativa'] == 'whisper' and depois['timeline']['V1'] == antes['timeline']['V1'] and depois['cortes'] == antes['cortes']


def test_trocar_de_familia_guarda_e_devolve_os_cortes(cliente, video, monkeypatch, enfileirados):
    _processado(cliente, video, monkeypatch)
    cliente.post('/api/projetos/e/transcricoes/parakeet/ativar')
    assert cliente.post('/api/projetos/e/transcricoes/parakeet/ativar').status_code == 422  # ainda não está pronta

    projeto.escrever_palavras(projeto.pasta('e'), 'parakeet', _palavras((0.1, 0.5)))
    projeto.atualizar('e', lambda p: p['transcricoes']['parakeet'].update(status='pronto'))
    antes = projeto.ler('e')
    r = cliente.post('/api/projetos/e/transcricoes/parakeet/ativar')
    assert r.status_code == 200 and ('e', ['cortes']) in enfileirados  # texto novo: a IA precisa fazer os cortes
    p = projeto.ler('e')
    assert p['transcricao_ativa'] == 'parakeet' and p['timeline']['V1'] == [] and 'cortes' not in p
    assert cliente.get('/api/projetos/e/editor').json()['palavras'] == []  # a tela mostra o processamento

    cliente.post('/api/projetos/e/transcricoes/whisper-stable/ativar')  # volta: os cortes antigos voltam intactos
    volta = projeto.ler('e')
    assert volta['cortes'] == antes['cortes'] and volta['timeline']['V1'] == antes['timeline']['V1'] and volta['etapas']['cortes'] == 'pronta'


def test_transcricao_de_outro_motor_so_quando_pronta(cliente, video, monkeypatch):
    _processado(cliente, video, monkeypatch)
    assert cliente.get('/api/projetos/e/transcricoes/parakeet').status_code == 404
    r = cliente.get('/api/projetos/e/transcricoes/whisper-stable').json()
    assert r['familia'] == 'whisper' and len(r['palavras']) == 4


def test_motores_extras_gravam_o_resultado_e_isolam_falhas(cliente, video, monkeypatch):
    _processado(cliente, video, monkeypatch)
    monkeypatch.delenv('ELEVENLABS_API_KEY', raising=False)
    monkeypatch.setattr(pipeline, 'load_dotenv', lambda *a, **k: None)

    def falso(vid, audio, whisper, silencios):
        if vid == 'whisper-ctc':
            raise RuntimeError('modelo indisponível')
        return [{**w, 'inicio': w['inicio'] + 0.05} for w in (whisper or _palavras((0.1, 0.5), (0.5, 0.9)))]
    monkeypatch.setattr(motores, 'rodar', falso)

    pipeline._rodar_motores('e', None)
    t = projeto.ler('e')['transcricoes']
    assert t['whisper-qwen']['status'] == 'pronto' and t['whisper-qwen']['palavras'] == 4
    assert projeto.ler_palavras('e', 'whisper-qwen')[0]['inicio'] == pytest.approx(0.15)
    assert t['whisper-ctc']['status'] == 'erro' and 'indisponível' in t['whisper-ctc']['erro']
    assert t['parakeet']['status'] == 'pronto'  # o motor seguinte rodou apesar da falha
    assert t['elevenlabs']['status'] == 'sem_chave' and 'ELEVENLABS_API_KEY' in t['elevenlabs']['erro']
    assert projeto.ler('e')['pipeline']['passos']['variantes']['status'] == 'pronto'

    monkeypatch.setenv('ELEVENLABS_API_KEY', 'x')
    pipeline._rodar_motores('e', ['elevenlabs'])  # depois de pôr a chave, roda de novo só esse
    assert projeto.ler('e')['transcricoes']['elevenlabs']['status'] == 'pronto'


def test_qwen_asr_transcreve_por_pedaco_e_alinha_cada_um(monkeypatch, tmp_path):
    _wav(tmp_path / 'a.wav', [(1.0, 0.5), (1.0, 0.0), (1.0, 0.5)])
    silencios = [{'inicio': 1.0, 'fim': 2.0, 'dur': 1.0}]  # divide o áudio em dois pedaços: 0–1,5 e 1,5–3

    class Asr:
        def generate(self, arq, language):
            return types.SimpleNamespace(text='Olá, mundo!')

    class Alinhador:
        def generate(self, arq, text, language):
            assert text == 'Olá, mundo!' and language == 'Portuguese'
            return [types.SimpleNamespace(text='Olá', start_time=0.1, end_time=0.4), types.SimpleNamespace(text='mundo', start_time=0.5, end_time=0.9)]
    monkeypatch.setattr(motores, '_modelo_mlx', lambda nome: Asr() if 'ASR' in nome else Alinhador())

    out = motores.transcrever_qwen_asr(tmp_path / 'a.wav', silencios)
    assert [(w['id'], w['texto'], w['inicio']) for w in out] == [
        ('w00000', 'Olá,', 0.1), ('w00001', 'mundo!', 0.5), ('w00002', 'Olá,', 1.6), ('w00003', 'mundo!', 2.0)]  # o 2º pedaço começa em 1,5 s


def test_projeto_criado_antes_de_um_motor_novo_ganha_o_motor(cliente, video):
    _criar(cliente, video)
    base = projeto.pasta('e')
    p = json.loads((base / 'projeto.json').read_text())
    del p['transcricoes']['qwen-asr']
    (base / 'projeto.json').write_text(json.dumps(p))
    assert projeto.ler('e')['transcricoes']['qwen-asr']['status'] == 'pendente'
    assert 'qwen-asr' in json.loads((base / 'projeto.json').read_text())['transcricoes']


def test_mapear_por_nucleo_ignora_pontuacao_e_interpola_simbolos():
    base = [{'id': 'w0', 'texto': 'Astra,', 'inicio': 0, 'fim': 0}, {'id': 'w1', 'texto': '%', 'inicio': 0, 'fim': 0},
            {'id': 'w2', 'texto': 'GPT.', 'inicio': 0, 'fim': 0}]
    out = motores.mapear_por_nucleo(base, [('Astra', 1.0, 1.4), ('GPT', 1.6, 2.0)])
    assert [(w['inicio'], w['fim']) for w in out] == [(1.0, 1.4), (1.4, 1.6), (1.6, 2.0)]
    with pytest.raises(RuntimeError, match='leu'):
        motores.mapear_por_nucleo(base, [('Astra', 1.0, 1.4), ('GPS', 1.6, 2.0)])
    with pytest.raises(RuntimeError, match='1 palavras para 2'):
        motores.mapear_por_nucleo(base, [('Astra', 1.0, 1.4)])


def test_contiguo_fecha_vaos_curtos_e_preserva_pausas():
    ps = [{'inicio': 0.0, 'fim': 0.1}, {'inicio': 0.3, 'fim': 0.4}, {'inicio': 1.5, 'fim': 1.6}]
    out = motores.contiguo(ps)
    assert (out[0]['fim'], out[1]['fim']) == (0.3, 0.4)  # vão de 0,2 s fechado; pausa de 1,1 s preservada


def test_elevenlabs_usa_so_palavras_e_exige_resposta_valida(monkeypatch, tmp_path):
    import httpx
    _wav(tmp_path / 'a.wav', [(0.5, 0.5)])
    resposta = {'words': [{'text': 'Olá', 'start': 0.1, 'end': 0.4, 'type': 'word'}, {'text': ' ', 'start': 0.4, 'end': 0.45, 'type': 'spacing'},
                          {'text': 'mundo', 'start': 0.45, 'end': 0.9, 'type': 'word'}, {'text': '(risos)', 'start': 1, 'end': 2, 'type': 'audio_event'}]}
    chamada = {}

    def post(url, **kw):
        chamada.update(url=url, **kw)
        return types.SimpleNamespace(status_code=200, json=lambda: resposta, text='')
    monkeypatch.setattr(httpx, 'post', post)
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'segredo')
    out = motores.transcrever_elevenlabs(tmp_path / 'a.wav')
    assert [(w['id'], w['texto'], w['inicio']) for w in out] == [('w00000', 'Olá', 0.1), ('w00001', 'mundo', 0.45)]
    assert chamada['headers'] == {'xi-api-key': 'segredo'} and chamada['data']['language_code'] == 'por'

    monkeypatch.setattr(httpx, 'post', lambda url, **kw: types.SimpleNamespace(status_code=401, json=lambda: {}, text='chave inválida'))
    with pytest.raises(RuntimeError, match='401'):
        motores.transcrever_elevenlabs(tmp_path / 'a.wav')


# ---------------------------------------------------------------- motor padrão e configuração

def test_config_tem_padrao_de_fabrica_e_so_aceita_motor_conhecido(cliente, tmp_path):
    (projeto.RAIZ / '_config.json').unlink()
    c = cliente.get('/api/config').json()
    assert c['motor_padrao'] == 'elevenlabs' and c['motores']['elevenlabs']['chave'] is False and c['motores']['parakeet']['chave'] is None

    assert cliente.put('/api/config', json={'motor_padrao': 'parakeet'}).json()['motor_padrao'] == 'parakeet'
    assert cliente.get('/api/config').json()['motor_padrao'] == 'parakeet'  # ficou salvo
    assert cliente.put('/api/config', json={'motor_padrao': 'xpto'}).status_code == 422


def test_chave_de_api_aparece_na_config_sem_expor_o_valor(cliente, monkeypatch):
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'segredo-qualquer')
    c = cliente.get('/api/config')
    assert c.json()['motores']['elevenlabs']['chave'] is True and 'segredo' not in c.text


def test_projeto_novo_usa_o_padrao_da_config_ou_o_motor_escolhido_ao_criar(cliente, video):
    cliente.put('/api/config', json={'motor_padrao': 'elevenlabs'})
    assert _criar(cliente, video, 'A')['transcricao_ativa'] == 'elevenlabs'
    cliente.put('/api/config', json={'motor_padrao': 'parakeet'})  # mudar depois não mexe no que já existe
    assert projeto.ler('a')['motor_inicial'] == 'elevenlabs'
    with video.open('rb') as b:
        r = cliente.post('/api/projetos', data={'nome': 'B', 'motor': 'qwen-asr'}, files={'bruto': ('x.mp4', b, 'video/mp4')}).json()
    assert r['transcricao_ativa'] == 'qwen-asr'
    with video.open('rb') as b:
        assert cliente.post('/api/projetos', data={'nome': 'C', 'motor': 'xpto'}, files={'bruto': ('x.mp4', b, 'video/mp4')}).status_code == 422


def _fakes_do_padrao(monkeypatch):
    def rodar(vid, audio, whisper, silencios):
        assert vid == 'elevenlabs' and whisper is None  # o padrão não depende do Whisper
        return _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5), (2.5, 2.9))
    monkeypatch.setattr(motores, 'rodar', rodar)
    monkeypatch.setattr(transcricao, 'transcrever', lambda *a, **k: pytest.fail('o Whisper não devia rodar no passo principal'))
    monkeypatch.setattr(cortes, 'selecionar', lambda palavras, silencios, briefing: {
        'mantidas': [['w00000', 'w00000'], ['w00002', 'w00003']], 'duvidas': [], 'modelo': 'falso'})


def test_pipeline_com_elevenlabs_como_padrao_faz_os_cortes_nele(cliente, video, monkeypatch):
    cliente.put('/api/config', json={'motor_padrao': 'elevenlabs'})
    _criar(cliente, video)
    monkeypatch.setenv('ELEVENLABS_API_KEY', 'x')
    _fakes_do_padrao(monkeypatch)
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)

    p = projeto.ler('e')
    assert p['pipeline']['erro'] is None and p['transcricao_ativa'] == 'elevenlabs'
    assert p['transcricoes']['elevenlabs']['status'] == 'pronto' and p['pipeline']['passos']['alinhamento'].get('pulado')
    assert p['transcricoes']['whisper']['status'] == 'pendente'  # o Whisper vem depois, em segundo plano
    assert p['etapas']['cortes'] == 'pronta' and len(p['timeline']['V1']) == 2


def test_sem_chave_o_padrao_cai_para_o_whisper_e_diz_por_que(cliente, video, monkeypatch):
    cliente.put('/api/config', json={'motor_padrao': 'elevenlabs'})
    _criar(cliente, video)  # sem ELEVENLABS_API_KEY (a fixture a removeu)
    falsas = _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5), (2.5, 2.9))
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: falsas)
    monkeypatch.setattr(transcricao, 'refinar', lambda audio, palavras: (palavras, None))
    monkeypatch.setattr(cortes, 'selecionar', lambda palavras, silencios, briefing: {
        'mantidas': [['w00000', 'w00000'], ['w00002', 'w00003']], 'duvidas': [], 'modelo': 'falso'})
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)

    p = projeto.ler('e')
    assert p['pipeline']['erro'] is None and p['transcricao_ativa'] == 'whisper-stable'
    assert p['transcricoes']['elevenlabs']['status'] == 'sem_chave'
    assert 'ELEVENLABS_API_KEY' in p['pipeline']['passos']['transcricao']['aviso'] and 'Whisper + stable-ts' in p['pipeline']['passos']['transcricao']['aviso']
    assert p['etapas']['cortes'] == 'pronta'


def test_config_das_margens_valida_e_atualiza_so_o_que_veio(cliente):
    c = cliente.get('/api/config').json()
    assert (c['antes_do_corte_ms'], c['depois_do_corte_ms']) == (100, 100)
    c = cliente.put('/api/config', json={'antes_do_corte_ms': 250}).json()
    assert (c['antes_do_corte_ms'], c['depois_do_corte_ms'], c['motor_padrao']) == (250, 100, 'whisper-stable')  # o resto não muda
    assert cliente.put('/api/config', json={'depois_do_corte_ms': -5}).status_code == 422
    assert cliente.put('/api/config', json={'depois_do_corte_ms': 5000}).status_code == 422
    assert cliente.get('/api/config').json()['antes_do_corte_ms'] == 250


def test_pausas_longas_vem_da_configuracao_e_zero_desliga(cliente):
    ps = cortes.parametros({})
    assert (ps['pausa_max'], ps['respiro']) == (2.0, 0.8)
    ps = cortes.parametros({'pausa_max_ms': 1200, 'respiro_ms': 500})
    assert (ps['pausa_max'], ps['respiro']) == (1.2, 0.5)
    assert cortes.parametros({'pausa_max_ms': 0})['pausa_max'] == float('inf')  # 0 = nunca encurtar

    c = cliente.put('/api/config', json={'pausa_max_ms': 1200, 'respiro_ms': 500}).json()
    assert (c['pausa_max_ms'], c['respiro_ms']) == (1200, 500)
    assert cliente.put('/api/config', json={'respiro_ms': 3000}).status_code == 422  # sobra mais do que a pausa
    assert cliente.put('/api/config', json={'pausa_max_ms': 0, 'respiro_ms': 3000}).status_code == 200  # desligado: sem conflito
    assert cliente.put('/api/config', json={'pausa_max_ms': 99999}).status_code == 422


def test_pausa_de_1_4_s_so_e_cortada_se_o_limite_for_menor_que_ela():
    palavras = _palavras((0.0, 0.5), (2.0, 2.5))
    silencios = [{'inicio': 0.6, 'fim': 2.0, 'dur': 1.4}]
    assert len(cortes.montar_clipes(palavras, [True, True], silencios, 3.0, **cortes.parametros({'pausa_max_ms': 2000}))) == 1
    cortado = cortes.montar_clipes(palavras, [True, True], silencios, 3.0, **cortes.parametros({'pausa_max_ms': 1000, 'respiro_ms': 400}))
    assert len(cortado) == 2 and cortado[1]['inicio'] - cortado[0]['fim'] == pytest.approx(1.4 - 0.4)  # a parte cortada é a pausa menos o respiro
    assert len(cortes.montar_clipes(palavras, [True, True], silencios, 3.0, **cortes.parametros({'pausa_max_ms': 0}))) == 1


def test_recalcular_aplica_as_margens_novas_sem_chamar_a_ia_e_descarta_ajustes(cliente, video, monkeypatch):
    _processado(cliente, video, monkeypatch)
    monkeypatch.setattr(cortes, 'selecionar', lambda *a, **k: pytest.fail('recalcular não pode chamar a IA'))
    antes = projeto.ler('e')
    c1 = antes['timeline']['V1'][0]
    cliente.post(f"/api/projetos/e/clipes/{c1['id']}/ajustar", json={'lado': 'fim', 't': c1['fim'] - 0.01})
    assert 'auto' in projeto.ler('e')['timeline']['V1'][0]

    cliente.put('/api/config', json={'antes_do_corte_ms': 0, 'depois_do_corte_ms': 0})
    r = cliente.post('/api/projetos/e/cortes/recalcular')
    assert r.status_code == 200
    novo = projeto.ler('e')
    assert all('auto' not in c for c in novo['timeline']['V1']) and 'mantidas_auto' not in novo['cortes']
    assert novo['cortes']['mantidas'] == antes['cortes']['mantidas']  # quais palavras ficam não muda
    assert novo['cortes']['parametros']['folga_inicio'] == 0 and novo['cortes']['parametros']['folga_fim'] == 0
    assert cliente.post('/api/projetos/e/cortes/recalcular').status_code == 200
    _criar(cliente, video, 'F')
    assert cliente.post('/api/projetos/f/cortes/recalcular').status_code == 409  # sem cortes ainda


def test_cortar_uma_pausa_no_meio_de_um_trecho_divide_o_clipe_em_dois():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.alterar_faixa(clipes, palavras, fica, 3.45, 3.55, False, 4.0)  # entre w3 e w4, dentro do clipe c2
    assert nova == fica  # nenhuma palavra saiu: era só pausa
    assert [(c['id'], c['inicio'], c['fim'], c['palavra_ini'], c['palavra_fim']) for c in clipes] == [
        ('c1', 0.0, 1.1, 'w00000', 'w00001'), ('c2', 2.9, 3.45, 'w00003', 'w00003'), ('c3', 3.55, 4.0, 'w00004', 'w00004')]


def test_cortar_por_cima_de_palavras_as_remove_e_reancora():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.alterar_faixa(clipes, palavras, fica, 2.95, 3.55, False, 4.0)  # engole w3 inteira
    assert nova == [True, True, False, False, True]
    assert [(c['id'], c['palavra_ini']) for c in clipes] == [('c1', 'w00000'), ('c3', 'w00004')]  # o pedaço de 50 ms sem palavras some


def test_cortar_um_clipe_inteiro_ou_atravessar_dois_clipes():
    palavras, fica, clipes = _cena_de_ajuste()
    cortes.alterar_faixa(clipes, palavras, fica, 0.0, 1.1, False, 4.0)
    assert [c['id'] for c in clipes] == ['c2']
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.alterar_faixa(clipes, palavras, fica, 0.9, 3.2, False, 4.0)  # pega o fim de c1 e o começo de c2
    assert [(c['id'], c['inicio'], c['fim']) for c in clipes] == [('c1', 0.0, 0.9), ('c2', 3.2, 4.0)]
    assert nova[1] is True and nova[3] is True  # w1 sobrou 80% e w3 60%: continuam mantidas (a regra é metade ou mais)
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.alterar_faixa(clipes, palavras, fica, 0.7, 3.4, False, 4.0)
    assert nova[1] is False and nova[3] is False  # w1 sobrou 40% e w3 20%: saem


def test_corte_novo_recusa_trecho_curto_demais_e_limita_ao_bruto():
    palavras, fica, clipes = _cena_de_ajuste()
    with pytest.raises(ValueError, match='curto'):
        cortes.alterar_faixa(clipes, palavras, fica, 3.1, 3.11, False, 4.0)
    cortes.alterar_faixa(clipes, palavras, fica, 3.9, 9.0, False, 4.0)  # passa do fim: vale até o fim do bruto
    assert clipes[-1]['fim'] == 3.9


def test_devolver_uma_faixa_une_os_clipes_e_traz_a_palavra_de_volta():
    palavras, fica, clipes = _cena_de_ajuste()
    nova = cortes.alterar_faixa(clipes, palavras, fica, 1.1, 2.9, True, 4.0)
    assert nova == [True] * 5
    assert [(c['id'], c['inicio'], c['fim'], c['palavra_ini'], c['palavra_fim']) for c in clipes] == [('c1', 0.0, 4.0, 'w00000', 'w00004')]
    palavras, fica, clipes = _cena_de_ajuste()
    with pytest.raises(ValueError, match='não há palavras'):
        cortes.alterar_faixa(clipes, palavras, fica, 1.2, 1.4, True, 4.0)  # só pausa, longe de qualquer trecho


def test_corte_na_mao_pela_api_persiste(cliente, video, monkeypatch):
    _processado(cliente, video, monkeypatch)
    antes = cliente.get('/api/projetos/e/editor').json()['timeline']['V1']
    assert len(antes) == 2
    r = cliente.post('/api/projetos/e/cortes/faixa', json={'inicio': 2.28, 'fim': 2.36})  # entre as duas últimas palavras
    assert r.status_code == 200, r.text
    depois = cliente.get('/api/projetos/e/editor').json()['timeline']['V1']
    assert len(depois) == 3 and depois[1]['fim'] == 2.28 and depois[2]['inicio'] == 2.36
    assert cliente.post('/api/projetos/e/cortes/faixa', json={'inicio': 1.0, 'fim': 1.001}).status_code == 422
    assert cliente.post('/api/projetos/e/cortes/faixa', json={'inicio': 2.28, 'fim': 2.36, 'manter': True}).status_code == 200
    assert len(cliente.get('/api/projetos/e/editor').json()['timeline']['V1']) == 2  # devolver desfaz o corte


def test_regras_editoriais_vem_do_spec():
    assert 'última tentativa válida' in cortes.regras()


def test_pipeline_completo_com_whisper_e_llm_falsos(cliente, video, monkeypatch):
    _criar(cliente, video)
    falsas = _palavras((0.1, 0.5), (0.5, 0.9), (2.1, 2.5), (2.5, 2.9))
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: falsas)
    monkeypatch.setattr(transcricao, 'refinar', lambda audio, palavras: (palavras, None))
    monkeypatch.setattr(cortes, 'selecionar', lambda palavras, silencios, briefing: {
        'mantidas': [['w00000', 'w00000'], ['w00002', 'w00003']], 'duvidas': [], 'modelo': 'falso'})
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))

    pipeline._rodar('e', pipeline.PASSOS)

    p = cliente.get('/api/projetos/e').json()
    assert p['pipeline']['erro'] is None
    assert {k: v['status'] for k, v in p['pipeline']['passos'].items() if k != 'variantes'} == dict.fromkeys(pipeline.PRINCIPAIS, 'pronto')
    assert p['transcricoes']['whisper']['status'] == p['transcricoes']['whisper-stable']['status'] == 'pronto'
    assert p['transcricao_ativa'] == 'whisper-stable' and p['transcricoes']['parakeet']['status'] == 'pendente'
    assert (projeto.pasta('e') / p['fontes'][0]['proxy']).exists()
    assert p['etapas']['cortes'] == 'pronta' and len(p['timeline']['V1']) == 2
    assert (projeto.pasta('e') / 'picos.json').exists()
    assert 'silencios' in cliente.get('/api/projetos/e/editor').json()
    e = cliente.get('/api/projetos/e/editor').json()
    assert [w['mantida'] for w in e['palavras']] == [True, False, True, True]
    mantidas = {w['id'] for w in e['palavras'] if w['mantida']}
    assert all(i['palavra_ini'] in mantidas for t in ('V2', 'V3', 'LEG') for i in e['timeline'][t])


def test_erro_num_passo_fica_registrado(cliente, video, monkeypatch):
    _criar(cliente, video)

    def quebra(audio, silencios):
        raise RuntimeError('modelo indisponível')
    monkeypatch.setattr(transcricao, 'transcrever', quebra)
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)
    p = projeto.ler('e')
    assert p['pipeline']['passos']['transcricao']['status'] == 'erro'
    assert p['pipeline']['passos']['cortes']['status'] == 'pendente'
    assert 'modelo indisponível' in p['pipeline']['erro']


@pytest.fixture(scope='session')
def video_horizontal(tmp_path_factory):
    arq = tmp_path_factory.mktemp('midia') / 'deitado.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=1',
                    '-pix_fmt', 'yuv420p', str(arq)], check=True)
    return arq


def test_referencias_sobem_varias_e_recusam_horizontal(cliente, video, video_horizontal):
    with video.open('rb') as a, video.open('rb') as b, video_horizontal.open('rb') as c:
        r = cliente.post('/api/referencias', files=[('videos', ('Reel bom.mp4', a, 'video/mp4')),
                                                    ('videos', ('Reel bom.mp4', b, 'video/mp4')),
                                                    ('videos', ('youtube.mp4', c, 'video/mp4'))])
    assert r.status_code == 200, r.text
    criadas, recusadas = r.json()['criadas'], r.json()['recusadas']
    assert [x['id'] for x in criadas] == ['reel-bom', 'reel-bom-2']
    assert criadas[0]['nome'] == 'Reel bom' and criadas[0]['status'] == 'na_fila' and criadas[0]['formato'] == 'vertical'
    assert recusadas == [{'nome': 'youtube.mp4', 'motivo': 'é 640×360; por enquanto só vídeos verticais'}]
    assert not (referencias.RAIZ / 'youtube').exists()
    assert len(cliente.get('/api/referencias').json()) == 2
    assert cliente.get('/api/referencias/reel-bom/arquivos/miniatura.jpg').status_code == 200
    assert cliente.get('/api/referencias/reel-bom/arquivos/referencia.json').status_code == 404
    assert cliente.get('/api/referencias/reel-bom/arquivos/../../x').status_code == 404
    assert cliente.delete('/api/referencias/reel-bom').status_code == 200
    assert [x['id'] for x in cliente.get('/api/referencias').json()] == ['reel-bom-2']
    assert cliente.get('/api/referencias/reel-bom').status_code == 404


def test_projeto_antigo_ganha_a_etapa_direcao(cliente, video):
    id = _criar(cliente, video)['id']
    arq = projeto.RAIZ / id / 'projeto.json'
    p = json.loads(arq.read_text())
    for chave in ('etapas', 'chats'):
        p[chave].pop('direcao')
    arq.write_text(json.dumps(p))
    p = cliente.get(f'/api/projetos/{id}').json()
    assert list(p['etapas']) == projeto.ETAPAS and p['etapas']['direcao'] == 'pendente' and p['chats']['direcao'] == []


def _trecho(a, b, planos, elementos=(), continua=False):
    return {'inicio': a, 'fim': b, 'continua_anterior': continua,
            'planos': [{'tipo': t, 'conteudo_em_cima': c, 'inicio': a, 'fim': b, 'descricao': d} for t, c, d in planos],
            'elementos': [{'tipo': t, 'inicio': i, 'fim': f, 'texto': x, 'descricao': 'd'} for t, i, f, x in elementos]}


def test_montar_junta_jump_cuts_e_continuacoes_mas_nao_inserts_novos():
    itens = direcao.montar([
        _trecho(0, 2, [('full_ator', None, 'Rodrigo')]),
        _trecho(2, 4, [('full_ator', None, 'Rodrigo de novo')]),  # jump cut: junta
        _trecho(4, 6, [('tela_dividida', 'insert', 'GitHub')]),
        _trecho(6, 7, [('tela_dividida', 'insert', 'GitHub com zoom')], continua=True),  # mesmo conteúdo: junta
        _trecho(7, 9, [('tela_dividida', 'insert', 'Claude')]),  # conteúdo novo: grupo novo
        _trecho(9, 10, [('insert_tela_cheia', None, 'Wikipedia')], [('lettering', 9.2, 9.9, 'Humano'), ('lettering', 8.0, 8.5, 'fora')]),
    ], 10.0)
    planos = [(i['tipo'], i['inicio'], i['fim'], i['descricao']) for i in itens if i['camada'] == 'plano']
    assert planos == [('full_ator', 0, 4, 'Rodrigo'), ('tela_dividida', 4, 7, 'GitHub Depois: GitHub com zoom'), ('tela_dividida', 7, 9, 'Claude'),
                      ('insert_tela_cheia', 9, 10.0, 'Wikipedia')]
    els = [i for i in itens if i['camada'] == 'elemento']
    assert [(e['id'], e['texto'], e['inicio'], e['fim']) for e in els] == [('e1', 'Humano', 9.2, 9.9)]  # o de fora do trecho sai
    assert [i['id'] for i in itens if i['camada'] == 'plano'] == ['p1', 'p2', 'p3', 'p4']


def test_montar_aceita_troca_de_plano_dentro_do_trecho():
    t = _trecho(0, 6, [('full_ator', None, 'a'), ('insert_tela_cheia', None, 'b')])
    t['planos'][0]['fim'], t['planos'][1]['inicio'] = 2.5, 2.5
    planos = [(i['tipo'], i['inicio'], i['fim']) for i in direcao.montar([t], 6)]
    assert planos == [('full_ator', 0, 2.5), ('insert_tela_cheia', 2.5, 6)]


def test_validar_edicao_exige_planos_contiguos_e_categorias_fixas():
    p = lambda id, a, b, tipo='full_ator': {'id': id, 'camada': 'plano', 'tipo': tipo, 'inicio': a, 'fim': b}  # noqa: E731
    ok = direcao.validar_edicao([p('p2', 3, 10, 'tela_dividida'), p('p1', 0, 3),
                                 {'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'inicio': 1, 'fim': 2, 'texto': ' Oi '}], 10)
    assert [(i['id'], i['inicio'], i['fim']) for i in ok] == [('p1', 0, 3), ('p2', 3, 10), ('e1', 1, 2)]
    assert ok[1]['conteudo'] == 'insert' and ok[2]['texto'] == 'Oi'
    for ruim, motivo in [([p('p1', 0, 3), p('p2', 4, 10)], 'Buraco'), ([p('p1', 0, 9)], 'cobrir'),
                         ([p('p1', 0, 10, 'zoom')], 'Categoria'), ([p('p1', 0, 5), p('p1', 5, 10)], 'repetido'),
                         ([{'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'inicio': 1, 'fim': 2}], 'plano-base')]:
        with pytest.raises(ValueError, match=motivo):
            direcao.validar_edicao(ruim, 10)


def test_revisao_salva_e_marca_revisada(cliente, video, monkeypatch):
    with video.open('rb') as a:
        id = cliente.post('/api/referencias', files=[('videos', ('r.mp4', a, 'video/mp4'))]).json()['criadas'][0]['id']
    base = referencias.RAIZ / id
    assert cliente.get(f'/api/referencias/{id}/revisao').status_code == 409
    (base / 'palavras.json').write_text(json.dumps({'palavras': [{'id': 'w0', 'texto': 'oi', 'inicio': 0.2, 'fim': 0.6}]}))
    (base / 'direcao.json').write_text(json.dumps({'itens': [], 'itens_ia': [], 'cortes': [1.5]}))
    referencias.atualizar(id, lambda r: r.update(status='a_revisar'))
    monkeypatch.setattr(direcao, '_miniatura', lambda base, i: i.update(miniatura=f"quadros/{i['id']}.jpg", miniatura_t=0))
    itens = [{'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'inicio': 0, 'fim': 3}]
    r = cliente.put(f'/api/referencias/{id}/direcao', json={'itens': itens})
    assert r.status_code == 200, r.text
    assert r.json()['itens'][0]['palavra_ini'] == 'w0'
    assert cliente.put(f'/api/referencias/{id}/direcao', json={'itens': [{**itens[0], 'fim': 2}]}).status_code == 422
    assert cliente.put(f'/api/referencias/{id}/status', json={'revisado': True}).json()['status'] == 'revisado'
    c = cliente.get('/api/referencias/clipes').json()
    assert [(x['ref'], x['id'], x['tipo'], x['fala'], x['revisado']) for x in c['clipes']] == [(id, 'p1', 'full_ator', 'oi', True)]
    assert 'comentario_insert_ator' in c['categorias']
    assert c['clipes'][0]['numero'] == 1 and c['clipes'][0]['entrada'] is None and c['origens'][id]['planos'][0]['id'] == 'p1'
    assert c['clipes'][0]['favorito'] is False
    assert cliente.put(f'/api/referencias/{id}/favorito', json={'inicio': 0, 'fim': 3, 'favorito': True}).status_code == 200
    assert cliente.get('/api/referencias/clipes').json()['clipes'][0]['favorito'] is True
    fav = referencias.ler_favoritos()
    assert [(f['ref'], f['tipo'], f['inicio']) for f in fav] == [(id, 'full_ator', 0)]
    assert cliente.put(f'/api/referencias/{id}/favorito', json={'inicio': 0, 'fim': 3, 'favorito': True}).status_code == 200
    assert len(referencias.ler_favoritos()) == 1  # marcar de novo não duplica
    assert cliente.put(f'/api/referencias/{id}/favorito', json={'inicio': 9, 'fim': 10, 'favorito': True}).status_code == 404
    cliente.put(f'/api/referencias/{id}/favorito', json={'inicio': 0, 'fim': 3, 'favorito': False})
    assert referencias.ler_favoritos() == []


def test_transcricao_ate_o_corte_marca_o_momento_e_esconde_o_futuro():
    w = lambda id, t, a, b: {'id': id, 'texto': t, 'inicio': a, 'fim': b}  # noqa: E731
    fala = [w('w0', 'Olha', 0.0, 0.4), w('w1', 'isso.', 0.45, 0.9), w('w2', 'Agora', 1.5, 1.9), w('w3', 'vai', 1.92, 2.2),
            w('w4', 'depois', 3.0, 3.4)]
    t = direcao.transcricao_ate(fala, 1.4, 2.5)
    assert t == ('[0.0 s] Olha isso.\n'
                 '<momento_analisado de="1.40 s" ate="2.50 s">\nAgora[1.50] vai[1.92]\n</momento_analisado>')
    assert 'depois' not in t
    assert direcao.transcricao_ate(fala, 0, 0.5).startswith('(começo do vídeo)')


def test_tempos_do_clipe_viram_tempos_do_video_inteiro():
    resp = lambda ini, fim: {'planos': [{'inicio': ini, 'fim': fim}], 'elementos': [{'inicio': ini + 0.5, 'fim': fim}]}  # noqa: E731
    assert direcao._no_video_inteiro(resp(0.0, 2.6), 16.25, 18.92)['planos'][0] == {'inicio': 16.25, 'fim': 18.85}
    assert direcao._no_video_inteiro(resp(16.25, 18.92), 16.25, 18.92)['planos'][0] == {'inicio': 16.25, 'fim': 18.92}
    assert direcao._no_video_inteiro(resp(0.0, 1.0), 0.0, 1.0)['planos'][0] == {'inicio': 0.0, 'fim': 1.0}


def test_planos_com_texto_guardam_o_texto_e_so_juntam_se_for_o_mesmo():
    def t(a, b, tipo, texto, continua=False):
        return {'inicio': a, 'fim': b, 'continua_anterior': continua, 'elementos': [],
                'planos': [{'tipo': tipo, 'conteudo_em_cima': None, 'texto': texto, 'inicio': a, 'fim': b, 'descricao': 'd'}]}
    itens = direcao.montar([t(0, 2, 'full_ator', 'ignorado'), t(2, 3, 'full_ator_lettering', 'Humano'),
                            t(3, 4, 'full_ator_lettering', 'Humano', True), t(4, 5, 'full_ator_lettering', 'Outro', True),
                            t(5, 8, 'comentario_insert_ator', 'Como saber se o app é seguro?')], 8)
    assert [(i['tipo'], i['inicio'], i['fim'], i['texto']) for i in itens] == [
        ('full_ator', 0, 2, None), ('full_ator_lettering', 2, 4, 'Humano'), ('full_ator_lettering', 4, 5, 'Outro'),
        ('comentario_insert_ator', 5, 8, 'Como saber se o app é seguro?')]


def test_clipes_trazem_posicao_entrada_vizinhos_e_elementos():
    w = lambda id, t, a, b: {'id': id, 'texto': t, 'inicio': a, 'fim': b}  # noqa: E731
    fala = [w('w0', 'Olha', 0.0, 0.4), w('w1', 'isso.', 0.45, 0.9), w('w2', 'Agora', 1.5, 1.9), w('w3', 'vai', 1.92, 2.2)]
    itens = [{'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'inicio': 0, 'fim': 1.4},
             {'id': 'p2', 'camada': 'plano', 'tipo': 'insert_tela_cheia', 'inicio': 1.4, 'fim': 4},
             {'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'inicio': 2, 'fim': 3, 'texto': 'Oi'}]
    ref = {'id': 'r', 'nome': 'R', 'status': 'revisado', 'video': {'duracao': 4.0}}
    lista, resumo = direcao.clipes(ref, itens, fala)
    p2 = lista[1]
    assert (p2['numero'], p2['total'], p2['posicao'], p2['palavras']) == (2, 2, 0.35, 2)
    assert p2['entrada'] == {'onde': 'na_pausa', 'frase': 'inicio', 'palavra': 'Agora', 'ms': -100}
    assert p2['anterior'] == {'tipo': 'full_ator', 'duracao': 1.4} and p2['seguinte'] is None
    assert p2['elementos'] == [{'tipo': 'lettering', 'texto': 'Oi', 'inicio': 2, 'fim': 3}]
    assert resumo['proporcao'] == {'full_ator': 0.35, 'insert_tela_cheia': 0.65}
