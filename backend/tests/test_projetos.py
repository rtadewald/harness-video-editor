import json
import subprocess
import sys
import types
import wave

import numpy as np
import pytest

from app import banco, calibragem, comum, cortes, direcao, direcao_projeto, inserts, midia, motores, pipeline, projeto, referencias, transcricao
from apoio import criar_projeto as _criar


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
    assert cliente.get('/api/projetos').json()[0]['duracao_final'] is None  # sem cortes ainda: o card mostra o bruto
    assert cliente.get(f"/api/projetos/{p['id']}/arquivos/{bruto['arquivo']}").status_code == 200


def test_criar_recusa_video_sem_audio_e_arquivo_que_nao_e_video_com_erro_legivel(cliente, tmp_path, enfileirados):
    """SPEC §4 ("erro legível"): sem a linha de comando do ffprobe na tela; um vídeo sem áudio não chega ao pipeline."""
    mudo = tmp_path / 'mudo.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1', '-an',
                    '-pix_fmt', 'yuv420p', str(mudo)], check=True)
    falso = tmp_path / 'falso.mp4'
    falso.write_text('não sou um vídeo')
    for arq, msg in ((mudo, 'não tem áudio'), (falso, 'Não consegui ler o vídeo')):
        with arq.open('rb') as b:
            r = cliente.post('/api/projetos', data={'nome': f'QA {arq.stem}'}, files={'bruto': (arq.name, b, 'video/mp4')})
        assert r.status_code == 422 and msg in r.json()['detail'] and 'ffprobe' not in r.json()['detail'], r.text
    assert not enfileirados and not [d for d in projeto.RAIZ.iterdir() if d.is_dir()]  # nada fica para trás
    erro = subprocess.CalledProcessError(234, ['ffmpeg', '-i', 'x.mp4', 'audio.wav'])
    assert midia.legivel(erro) == 'O ffmpeg falhou (código 234).'


def test_lista_deriva_o_estado_dos_inserts():
    """A barrinha dos Inserts na lista sai dos dados: prontos com mídia ou motion em todos, em andamento com alguma."""
    base = {'etapas': {'cortes': 'pronta', 'inserts': 'pendente'}, 'motions': {'p2': {}}}
    def estado(pedidos):
        return projeto.etapas_no_resumo({**base, 'inserts': {'pedidos': pedidos}})['inserts']
    assert estado([]) == 'pendente'
    assert estado([{'plano': 'p1', 'midias': []}, {'plano': 'p3', 'midias': []}]) == 'pendente'
    assert estado([{'plano': 'p1', 'midias': [{'id': 'm'}]}, {'plano': 'p3', 'midias': []}]) == 'andamento'
    assert estado([{'plano': 'p1', 'midias': [{'id': 'm'}]}, {'plano': 'p2', 'midias': []}]) == 'pronta'
    assert projeto.etapas_no_resumo(base)['cortes'] == 'pronta'


def test_criar_com_formato_so_reels_por_ora(cliente, video, enfileirados):
    """A criação (SPEC §6): nome, motor, formato e o vídeo. Reels é o padrão e o único ativo; Anúncio e Aula, em breve."""
    with video.open('rb') as b:
        p = cliente.post('/api/projetos', data={'nome': 'Novo', 'motor': 'parakeet', 'formato': 'reels'},
                         files={'bruto': ('b.mp4', b, 'video/mp4')}).json()
    assert (p['formato'], p['transcricao_ativa'], p['briefing']) == ('reels', 'parakeet', {'texto': '', 'audio': None})
    assert [f['papel'] for f in p['fontes']] == ['bruto'] and not (projeto.RAIZ / 'novo' / 'briefing').exists()
    assert _criar(cliente, video, 'Sem formato')['formato'] == 'reels'  # sem o campo, Reels
    for formato, msg in (('anuncio', 'em breve'), ('aula', 'em breve'), ('podcast', 'desconhecido')):
        with video.open('rb') as b:
            r = cliente.post('/api/projetos', data={'nome': f'X {formato}', 'formato': formato}, files={'bruto': ('b.mp4', b, 'video/mp4')})
        assert r.status_code == 422 and msg in r.json()['detail']
    assert {x['id'] for x in cliente.get('/api/projetos').json()} == {'novo', 'sem-formato'}  # o recusado não deixa pasta


def test_projeto_antigo_sem_formato_e_reels_e_ganha_a_etapa_transicoes(cliente, video):
    id = _criar(cliente, video)['id']
    arq = projeto.RAIZ / id / 'projeto.json'
    p = json.loads(arq.read_text())
    del p['formato'], p['etapas']['transicoes'], p['chats']['transicoes']
    arq.write_text(json.dumps(p))
    p = projeto.ler(id)
    assert p['formato'] == 'reels' and p['etapas']['transicoes'] == 'pendente' and p['chats']['transicoes'] == []
    assert list(p['etapas']) == projeto.ETAPAS


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


def test_historico_antigo_do_chat_e_migrado_e_o_chat_simulado_saiu(cliente, video):
    """O chat simulado saiu (F0); os históricos ficam no projeto para o agente (SPEC §11) e os antigos, com o nome de
    quem usava como autor, continuam sendo migrados para `criador`."""
    _criar(cliente, video)
    arq = projeto.RAIZ / 'e' / 'projeto.json'
    p = json.loads(arq.read_text())
    p['chats']['cortes'] = [{'autor': 'fulano', 'texto': 'volta a primeira tentativa', 'ferramentas': [], 'mock': False, 'criado_em': ''}]
    arq.write_text(json.dumps(p))
    assert projeto.ler('e')['chats']['cortes'][0]['autor'] == 'criador'
    p = cliente.get('/api/projetos/e').json()
    assert len(p['chats']['cortes']) == 1 and p['chats']['inserts'] == [] and set(p['chats']) == set(projeto.ETAPAS)
    assert cliente.post('/api/projetos/e/chat/cortes', json={'texto': 'oi'}).status_code in (404, 405)


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
    curta = [{'inicio': 0.6, 'fim': 1.9, 'dur': 1.3}]  # 1,3 s: respiro que o criador quer manter
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
    resumo = cliente.get('/api/projetos').json()[0]  # o card mostra o vídeo editado, não o bruto
    assert resumo['duracao_final'] == round(sum(c['fim'] - c['inicio'] for c in p['timeline']['V1']), 3) < resumo['duracao']
    assert 'silencios' in cliente.get('/api/projetos/e/editor').json()
    e = cliente.get('/api/projetos/e/editor').json()
    assert [w['mantida'] for w in e['palavras']] == [True, False, True, True]
    assert list(e['timeline']) == ['V1']  # as trilhas simuladas (V2, V3, LEG) saíram


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
    assert p['pipeline']['erro'].startswith('Não consegui transcrever o áudio')


def test_erro_de_biblioteca_no_alinhamento_vira_frase_do_passo_sem_o_caminho(cliente, video, monkeypatch):
    """SPEC §4: o stable-ts (motor de reserva) que falha não mostra o caminho do servidor; a tela diz qual passo parou."""
    _criar(cliente, video)
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: _palavras((0.1, 0.5)))

    def quebra(audio, palavras):
        raise RuntimeError(f'FFmpeg failed to read "{audio}".')
    monkeypatch.setattr(transcricao, 'refinar', quebra)
    selecionou = []
    monkeypatch.setattr(cortes, 'selecionar', lambda *a: selecionou.append(a))
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)
    p = projeto.ler('e')
    assert p['pipeline']['passos']['alinhamento']['status'] == 'erro' and not selecionou
    assert p['pipeline']['erro'] == 'Não consegui ajustar o tempo de cada palavra ao áudio (FFmpeg failed to read "audio.wav").'


def test_transcricao_sem_nenhuma_palavra_para_antes_da_ia_dos_cortes(cliente, video, monkeypatch):
    _criar(cliente, video)
    monkeypatch.setattr(transcricao, 'transcrever', lambda audio, silencios: [])
    refinou, selecionou = [], []
    monkeypatch.setattr(transcricao, 'refinar', lambda audio, palavras: refinou.append(1))
    monkeypatch.setattr(cortes, 'selecionar', lambda *a: selecionou.append(a))
    projeto.atualizar('e', lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._rodar('e', pipeline.PASSOS)
    p = projeto.ler('e')
    assert p['pipeline']['passos']['transcricao']['status'] == 'erro'
    assert p['pipeline']['passos']['alinhamento']['status'] == 'pendente' and not refinou and not selecionou
    assert p['pipeline']['erro'].startswith('Não encontrei fala neste vídeo')


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
    assert ok[1]['tipo'] == 'tela_dividida_insert' and ok[1]['conteudo'] is None and ok[2]['texto'] == 'Oi'  # o formato antigo vira o tipo novo
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


def test_etapa_inserts_reescreve_a_marcacao_e_tira_os_campos_antigos(tmp_path, monkeypatch):
    def t(a, b, tipo, conteudo):
        return {'inicio': a, 'fim': b, 'continua_anterior': False, 'elementos': [],
                'planos': [{'tipo': tipo, 'conteudo_em_cima': conteudo, 'texto': None, 'inicio': a, 'fim': b, 'descricao': 'd', 'como_gerar': 'x'}]}
    itens = direcao.montar([t(0, 1, 'full_ator', None), t(1, 2, 'insert_tela_cheia', None), t(2, 3, 'tela_dividida', 'insert')], 3)
    assert not any('como_gerar' in i for i in itens)
    ok = direcao.validar_edicao([{'id': 'p1', 'camada': 'plano', 'tipo': 'insert_tela_cheia', 'inicio': 0, 'fim': 3, 'como_gerar': 'x',
                                  'insert': {'narrativa': 'n'}, 'descricao': ' o site '}], 3)
    assert ok[0]['descricao'] == 'o site' and 'como_gerar' not in ok[0] and 'insert' not in ok[0]
    # a etapa assiste cada plano com insert e põe o que acontece nele na marcação; os campos antigos saem
    planos = [{'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'conteudo': None, 'inicio': 0, 'fim': 1, 'descricao': 'ator'},
              {'id': 'p2', 'camada': 'plano', 'tipo': 'tela_dividida_insert', 'conteudo': None, 'inicio': 1, 'fim': 3, 'descricao': 'tela dividida, autor embaixo',
               'como_gerar': 'gravar', 'captura': {}, 'insert': {'narrativa': 'n', 'midias': []}}]
    comum.salvar_json(tmp_path / 'direcao.json', {'itens': planos})
    monkeypatch.setattr(direcao, 'analisar_insert', lambda base, b, config: f"o GitHub entra e dá zoom ({b['id']})")
    assert direcao._inserts('ref', tmp_path) == {'blocos': 1}
    p1, p2 = comum.ler_json(tmp_path / 'direcao.json')['itens']
    assert p1['descricao'] == 'ator' and p2['descricao'] == 'o GitHub entra e dá zoom (p2)'
    assert not {'como_gerar', 'captura', 'insert'} & set(p2)
    assert calibragem.marcacao(p2, []) == '[Tela dividida · insert: o GitHub entra e dá zoom (p2)]'


def _w(id, t, a, b):
    return {'id': id, 'texto': t, 'inicio': a, 'fim': b}


def test_palavras_na_saida_seguem_a_v1():
    palavras = [_w('w0', 'a', 0.0, 0.5), _w('w1', 'b', 1.0, 1.4), _w('w2', 'c', 3.0, 3.5)]
    clipes = [{'inicio': 2.8, 'fim': 3.6}, {'inicio': 0.0, 'fim': 0.6}]  # fora de ordem de propósito
    s = direcao_projeto.palavras_na_saida(palavras, clipes)
    assert [(w['id'], w['saida_ini'], w['saida_fim']) for w in s] == [('w0', 0.0, 0.5), ('w2', 0.8, 1.3)]
    assert direcao_projeto.duracao_saida(clipes) == 1.4


def test_montar_direcao_cobre_tudo_e_poe_a_troca_na_pausa():
    saida = [{'id': f'w{k}', 'texto': str(k), 'saida_ini': ini, 'saida_fim': ini + 0.3} for k, ini in enumerate([0.1, 0.5, 1.5, 1.9, 2.3])]
    resp = {'planos': [  # o primeiro não começa na primeira palavra e há um ID que não existe: o código corrige
        {'tipo': 'tela_dividida_insert', 'palavra_ini': 'w1', 'palavra_fim': 'w1', 'texto': 'x', 'descricao': 'd'},
        {'tipo': 'full_ator', 'conteudo_em_cima': None, 'palavra_ini': 'w2', 'palavra_fim': 'w4', 'texto': None, 'descricao': 'f'},
        {'tipo': 'insert_tela_cheia', 'conteudo_em_cima': None, 'palavra_ini': 'w99', 'palavra_fim': 'w99', 'texto': None, 'descricao': 'z'}],
        'elementos': [{'tipo': 'lettering', 'palavra_ini': 'w3', 'palavra_fim': 'w2', 'texto': 'Oi', 'descricao': 'e'}]}
    itens = direcao_projeto.montar(resp, saida)
    p1, p2, e1 = itens
    assert (p1['palavra_ini'], p1['palavra_fim'], p1['off_ini'], p1['conteudo'], p1['texto']) == ('w0', 'w1', -0.1, None, None)
    assert (p2['palavra_ini'], p2['palavra_fim'], p2['off_ini']) == ('w2', 'w4', -0.08)  # pausa de 0,7 s: entra 80 ms antes
    assert (e1['palavra_ini'], e1['palavra_fim'], e1['off_ini'], e1['off_fim']) == ('w2', 'w3', -0.05, 0.05)


def test_validar_direcao_do_projeto():
    ok = direcao_projeto.validar([{'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator_lettering', 'palavra_ini': 'w0', 'palavra_fim': 'w1',
                                   'off_ini': -99, 'texto': ' Oi ', 'como_gerar': 'x'}], {'w0', 'w1'})
    assert (ok[0]['off_ini'], ok[0]['texto'], 'como_gerar' in ok[0]) == (-10.0, 'Oi', False)
    for ruim, motivo in [([{'id': 'p1', 'camada': 'plano', 'tipo': 'zoom', 'palavra_ini': 'w0', 'palavra_fim': 'w0'}], 'Categoria'),
                         ([{'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'palavra_ini': 'w9', 'palavra_fim': 'w0'}], 'não existe'),
                         ([{'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'palavra_ini': 'w0', 'palavra_fim': 'w0'}], 'plano-base')]:
        with pytest.raises(ValueError, match=motivo):
            direcao_projeto.validar(ruim, {'w0', 'w1'})


def test_rotas_da_direcao_do_projeto(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    assert cliente.post(f'/api/projetos/{id}/direcao/gerar').status_code == 409  # sem cortes
    pedidos = []
    monkeypatch.setattr(direcao_projeto, 'gerar', lambda i: pedidos.append(i))
    projeto.atualizar(id, lambda p: p.update(cortes={'mantidas': [], 'duvidas': []}) or p['timeline'].update(V1=[{'id': 'c1', 'inicio': 0, 'fim': 1}]))
    assert cliente.post(f'/api/projetos/{id}/direcao/gerar').status_code == 200 and pedidos == [id]
    assert cliente.put(f'/api/projetos/{id}/direcao', json={'itens': []}).status_code == 409  # ainda não gerada
    projeto.escrever_palavras(projeto.pasta(id), projeto.ler(id)['transcricao_ativa'], [_w('w0', 'oi', 0, 0.5)])
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': []}))
    item = {'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'palavra_ini': 'w0', 'palavra_fim': 'w0'}
    r = cliente.put(f'/api/projetos/{id}/direcao', json={'itens': [item]})
    assert r.status_code == 200, r.text
    assert projeto.ler(id)['direcao']['itens'][0]['tipo'] == 'full_ator'
    assert cliente.put(f'/api/projetos/{id}/direcao', json={'itens': [{**item, 'tipo': 'zoom'}]}).status_code == 422


def _plano(id, tipo, a, b, funcao=None, conteudo=None):
    return {'id': id, 'camada': 'plano', 'tipo': tipo, 'conteudo': conteudo, 'inicio': a, 'fim': b, 'funcao_fala': funcao}


def test_montar_so_junta_os_jump_cuts_do_ator():
    itens = direcao.montar([
        _trecho(0, 2, [('full_ator', None, 'Ator')]),
        _trecho(2, 4, [('full_ator', None, 'Ator de novo')]),  # jump cut: junta
        _trecho(4, 6, [('tela_dividida', 'insert', 'GitHub')]),
        _trecho(6, 7, [('tela_dividida', 'insert', 'GitHub com zoom')], continua=True),  # cada corte de cena é uma linha do roteiro
        _trecho(7, 10, [('insert_tela_cheia', None, 'Wikipedia')], [('lettering', 8.2, 8.9, 'Humano'), ('lettering', 5.0, 5.5, 'fora')]),
    ], 10.0)
    planos = [(i['tipo'], i['inicio'], i['fim'], i['descricao']) for i in itens if i['camada'] == 'plano']
    assert planos == [('full_ator', 0, 4, 'Ator'), ('tela_dividida_insert', 4, 6, 'GitHub'), ('tela_dividida_insert', 6, 7, 'GitHub com zoom'),
                      ('insert_tela_cheia', 7, 10.0, 'Wikipedia')]
    assert [(e['texto'], e['inicio']) for e in itens if e['camada'] == 'elemento'] == [('Humano', 8.2)]


def test_roteiro_dirigido_de_um_video():
    ref = {'id': 'r', 'nome': 'R', 'status': 'a_revisar', 'video': {'duracao': 6.0}}
    base = referencias.RAIZ / 'r'
    base.mkdir(parents=True)
    (base / 'referencia.json').write_text(json.dumps(ref))
    (base / 'palavras.json').write_text(json.dumps({'palavras': [_w('w0', 'Por', 0.1, 0.4), _w('w1', 'onde?', 0.5, 0.9), _w('w2', 'Cara,', 2.2, 2.6)]}))
    itens = [{**_plano('p1', 'comentario_insert_ator', 0, 2), 'descricao': 'pergunta do seguidor sobre um print do YouTube', 'texto': 'Por onde?'},
             {**_plano('p2', 'full_ator', 2, 6), 'descricao': 'ele olhando para a câmera'},
             {'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'inicio': 2.1, 'fim': 2.7, 'texto': 'CARA'}]
    linhas = calibragem.roteiro(ref, itens)
    assert [l['marcacao'] for l in linhas] == ['[Comentário + insert + ator: pergunta do seguidor sobre um print do YouTube «Por onde?»]',
                                               '[Full ator: ele olhando para a câmera]']  # o lettering vai na fala
    assert [l['fala'] for l in linhas] == ['Por onde?', '<lettering>Cara,</lettering>']
    texto = calibragem.roteiro_em_texto('R', linhas)
    assert texto.startswith('### R\n\n[Comentário + insert + ator:') and '\n“Por onde?”\n\n[Full ator' in texto


def test_heuristica_migra_e_fica_so_com_as_regras(cliente):
    projeto.salvar_config({**projeto.ler_config(), 'regras_direcao': '1. Não comece com o ator.\n- Comentário primeiro'})
    h = calibragem.ler_heuristica()
    assert calibragem.secao(h['regras'], calibragem.SECAO_CRIADOR) == '- Não comece com o ator.\n- Comentário primeiro'
    calibragem.salvar_heuristica({'markdown': '# H\n\n## Regras do criador\n- minha\n\n## Regras gerais sugeridas\n- da ia\n\n## Que fala pede que visual\n### Quando…'})
    h = calibragem.ler_heuristica()
    assert calibragem.secao(h['regras'], calibragem.SECAO_CRIADOR) == '- minha'
    assert calibragem.secao(h['regras'], calibragem.SECAO_IA) == '- da ia' and 'Que fala' not in h['regras']
    calibragem.salvar_heuristica({'regras': [{'texto': 'sua', 'origem': 'criador'}, {'texto': 'ia', 'origem': 'ia'}], 'padroes': []})
    assert calibragem.secao(calibragem.ler_heuristica()['regras'], calibragem.SECAO_IA) == '- ia'


def test_rotas_da_heuristica(cliente):
    h = cliente.get('/api/referencias/heuristica').json()
    assert h['regras'].startswith('## Regras do criador') and h['roteiros'] == []
    assert cliente.post('/api/referencias/heuristica/sugerir').status_code == 409  # sem referências
    assert cliente.post('/api/referencias/heuristica/voltar').status_code == 409
    h = cliente.put('/api/referencias/heuristica', json={'regras': '## Regras do criador\n- abrir com tela dividida\n'}).json()
    assert 'abrir com tela dividida' in h['regras']
    assert cliente.get('/api/referencias/nao-existe/roteiro').status_code == 404


def test_sugerir_regras_mantem_as_do_criador(cliente, monkeypatch):
    calibragem.salvar_heuristica({'regras': '## Regras do criador\n- minha regra\n\n## Regras sugeridas pela IA\n- velha\n'})
    monkeypatch.setattr(calibragem, 'roteiros', lambda *a: [{'ref': 'v', 'nome': 'V', 'revisado': False,
                                                            'linhas': [{'marcacao': '[Full ator: ele]', 'fala': 'oi'}]}])
    pedidos = []

    class Falso:
        def __init__(self, **k): pass
        def with_structured_output(self, *a, **k): return self
        def invoke(self, msgs):
            pedidos.append(msgs[1][1])
            return calibragem.Regras(regras=['Abra mostrando algo.', ' '], inserts=['Use imagem para tabelas.'])
    import langchain_openrouter
    monkeypatch.setattr(langchain_openrouter, 'ChatOpenRouter', Falso)
    h = cliente.post('/api/referencias/heuristica/sugerir').json()
    assert calibragem.secao(h['regras'], calibragem.SECAO_CRIADOR) == '- minha regra'
    assert calibragem.secao(h['regras'], calibragem.SECAO_IA) == '- Abra mostrando algo.\n\n### Inserts\n- Use imagem para tabelas.'
    assert 'minha regra' in pedidos[0] and '[Full ator: ele]' in pedidos[0]
    volta = cliente.post('/api/referencias/heuristica/voltar').json()
    assert '- velha' in volta['regras']
    doc = calibragem.documento(calibragem.ler_heuristica(), [{'ref': 'v', 'nome': 'V', 'linhas': [{'marcacao': '[Full ator: ele]', 'fala': 'oi'}]}])
    assert '## Roteiros de exemplo' in doc and '### V\n\n[Full ator: ele]\n“oi”' in doc


def test_registro_do_diretor(cliente, video):
    id = _criar(cliente, video)['id']
    assert cliente.get(f'/api/projetos/{id}/direcao/registro').status_code == 404
    direcao_projeto.registrar(id, {'modelo': 'm', 'tokens': 10, 'sistema': 'S', 'usuario': 'U', 'resposta': {'planos': []}})
    r = cliente.get(f'/api/projetos/{id}/direcao/registro').json()
    assert (r['sistema'], r['usuario'], r['resposta'], r['total']) == ('S', 'U', {'planos': []}, 1)
    md = (projeto.pasta(id) / r['arquivo']).read_text()
    assert '## Prompt de sistema\n\nS' in md and '## Resposta formatada' in md


def _saida(texto):
    return [{'id': f'w{k}', 'texto': t, 'saida_ini': k * 0.5, 'saida_fim': k * 0.5 + 0.4} for k, t in enumerate(texto.split())]


def test_ler_roteiro_da_diretora():
    texto = """Aqui vai o roteiro:
[Comentário + insert + ator: dúvida sobre IA «Por onde começo?»]
“Por onde começo?”

[Full ator: ele responde]
“Cara, eu não tentaria
aprender tudo.”
[Tela dividida (insert em cima): o YouTube abrindo]"""
    blocos = direcao_projeto.ler_roteiro(texto)
    assert [b['marcacao'] for b in blocos] == ['Comentário + insert + ator: dúvida sobre IA «Por onde começo?»', 'Full ator: ele responde',
                                               'Tela dividida (insert em cima): o YouTube abrindo']
    assert [b['fala'] for b in blocos] == ['Por onde começo?', 'Cara, eu não tentaria aprender tudo.', '']


def test_alinhar_casa_a_fala_com_as_palavras_reais():
    saida = _saida('Por onde começo? Cara, eu não tentaria aprender tudo ao mesmo tempo. Porque você abre o YouTube')
    blocos = [{'marcacao': 'a', 'fala': 'Por onde começo?'},
              {'marcacao': 'b', 'fala': 'Cara eu nao tentaria aprender tudo ao mesmo tempo'},  # sem acento nem pontuação: casa mesmo assim
              {'marcacao': 'c', 'fala': 'Porque você abre'},  # pulou "o YouTube": as palavras ficam com este bloco
              {'marcacao': 'd', 'fala': 'algo que não foi dito'}]  # nada casa: o bloco some
    assert direcao_projeto.alinhar(blocos, saida) == [(0, 2), (3, 11), (12, 16), (-1, -1)]


def test_transcricao_corrida_quebra_em_frases():
    saida = _saida('Oi. Tudo bem? sim')
    assert direcao_projeto.transcricao_corrida(saida) == 'Oi.\nTudo bem?\nsim'


def test_variacoes_antigas_da_diretora_viram_a_escolhida(cliente, video):
    id = _criar(cliente, video)['id']
    projeto.atualizar(id, lambda p: p.update(direcoes={'atual': {'itens': [1]}, 'a': {'itens': [2]}}, direcao_variante='atual', direcao={'itens': [1]}))
    p = projeto.ler(id)
    assert p['direcao']['itens'] == [2] and 'direcoes' not in p and 'direcao_variante' not in p
    assert [(v['n'], v['itens']) for v in p['direcao']['versoes']] == [(1, [2])] and p['direcao']['ativa'] == 1  # vira a v1
    c = cliente.get('/api/config').json()
    assert (c['modelo_diretora'], c['raciocinio_diretora']) == ('google/gemini-3.8-flash', 'medium')



def test_troca_de_plano_nao_atravessa_a_emenda():
    from app import direcao_projeto as d
    palavras = [{'id': 'w1', 'texto': 'a', 'inicio': 0.0, 'fim': 0.5}, {'id': 'w2', 'texto': 'b', 'inicio': 2.0, 'fim': 2.5}]
    saida = d.palavras_na_saida(palavras, [{'id': 'c1', 'inicio': 0.0, 'fim': 0.52}, {'id': 'c2', 'inicio': 1.98, 'fim': 3.0}])
    assert d._folga(saida, 1, True, 0.08) == 0.0  # a pausa de 40 ms na saída é de dois trechos: a troca fica na emenda


def test_lettering_na_fala_vira_elemento_preso_as_palavras():
    from app import direcao_projeto as d
    texto = ['Hoje', 'o', 'GPT', '3.7', 'Flash', 'custa', 'noventa', 'e', 'sete', 'reais.']
    saida = [{'id': f'w{k}', 'texto': t, 'saida_ini': k * 0.3, 'saida_fim': k * 0.3 + 0.25} for k, t in enumerate(texto)]
    roteiro = ('[Full ator: apresenta]\n“Hoje o <lettering>GPT 3.7 Flash</lettering>”\n\n'
               '[Tela dividida (insert em cima): página de preços]\n“custa <lettering texto=\"R$ 97\">noventa e sete reais.</lettering>”')
    blocos = d.ler_roteiro(roteiro)
    assert d.sem_tags(blocos[1]['fala']) == 'custa noventa e sete reais.'
    lets: list[dict] = []
    assert d.alinhar(blocos, saida, lets) == [(0, 4), (5, 9)]
    assert lets == [{'texto': None, 'falado': 'GPT 3.7 Flash', 'ini': 2, 'fim': 4},
                    {'texto': 'R$ 97', 'falado': 'noventa e sete reais.', 'ini': 6, 'fim': 9}]
    # tag aninhada ou sem par não quebra o alinhamento
    lets = []
    assert d.alinhar(d.ler_roteiro('[Full ator: x]\n“Hoje <lettering>o <lettering>GPT</lettering> 3.7</lettering> Flash custa noventa e sete reais.”'), saida, lets) == [(0, 9)]
    assert [(l['ini'], l['fim']) for l in lets] == [(1, 2)]


def test_roteiro_da_calibragem_marca_lettering_na_fala():
    from app import calibragem
    palavras = [{'texto': t, 'inicio': k * 1.0, 'fim': k * 1.0 + 0.8} for k, t in enumerate(['custa', 'noventa', 'e', 'sete', 'reais', 'hoje'])]
    lets = [{'inicio': 0.9, 'fim': 4.9, 'texto': 'R$ 97'}, {'inicio': 5.0, 'fim': 6.0, 'texto': 'HOJE'}]
    assert calibragem._fala(palavras, 0, 6, lets) == 'custa <lettering texto="R$ 97">noventa e sete reais</lettering> <lettering>hoje</lettering>'


def test_versoes_e_comentarios_da_direcao(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(projeto, 'ler_palavras', lambda i: [{'id': 'w0', 'texto': 'oi', 'inicio': 0, 'fim': 0.5}, {'id': 'w1', 'texto': 'tudo', 'inicio': 0.6, 'fim': 1}])
    palavras = ['w0', 'w1']
    plano = {'id': 'p1', 'camada': 'plano', 'tipo': 'full_ator', 'conteudo': None, 'palavra_ini': palavras[0], 'palavra_fim': palavras[-1],
             'off_ini': 0, 'off_fim': 0, 'texto': None, 'descricao': 'ator', 'como_gerar': None}
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [plano], 'itens_ia': [plano], 'gerado_em': 'x'}))
    pedidos = []
    monkeypatch.setattr(direcao_projeto._fila, 'submit', lambda f, i: pedidos.append(i))
    url = f'/api/projetos/{id}/direcao'
    # sem comentário não há o que corrigir
    assert cliente.post(f'{url}/corrigir', json={}).status_code == 422
    d = cliente.post(f'{url}/comentarios', json={'palavra': palavras[0], 'off': 0.1, 'texto': 'aqui um insert'}).json()
    cid = d['comentarios'][0]['id']
    d = cliente.put(f'{url}/comentarios/{cid}', json={'texto': 'aqui um insert do site'}).json()
    assert d['comentarios'][0]['texto'] == 'aqui um insert do site' and d['versoes'][0]['comentarios'] == d['comentarios']
    assert cliente.post(f'{url}/comentarios', json={'palavra': 'nao-existe', 'off': 0, 'texto': 'x'}).status_code == 422
    # pedir a v2: guarda o comentário geral na v1 e enfileira
    p = cliente.post(f'{url}/corrigir', json={'geral': 'menos tela cheia'}).json()
    assert p['direcao']['status'] == 'rodando' and p['direcao']['pedido'] == {'tipo': 'corrigir', 'de': 1} and pedidos == [id]
    assert p['direcao']['versoes'][0]['geral'] == 'menos tela cheia'
    # a corretora devolve a v2 (simulada)
    monkeypatch.setattr(direcao_projeto, 'corrigir', lambda i, de: {'n': 2, 'origem': de, 'itens': [{**plano, 'descricao': 'novo'}], 'itens_ia': [], 'registro': None})
    projeto.atualizar(id, lambda p: p.update(transicoes={'p1': {'id': 'seco', 'par': 'full_ator>full_ator'}}))
    direcao_projeto._rodar(id)
    d = projeto.ler(id)['direcao']
    assert [(v['n'], v['origem']) for v in d['versoes']] == [(1, None), (2, 1)] and d['ativa'] == 2
    assert projeto.ler(id)['transicoes'] == {'p1': {'id': 'seco', 'par': 'full_ator>full_ator'}}  # corrigir mantém as transições
    assert d['itens'][0]['descricao'] == 'novo' and d['comentarios'] == [] and d['status'] == 'pronto'
    # ajustes vão para a versão aberta; voltar à v1 mostra a v1 com os comentários dela
    cliente.put(url, json={'itens': [{**plano, 'descricao': 'ajustado'}]})
    d = cliente.put(f'{url}/versao', json={'n': 1}).json()
    assert d['itens'][0]['descricao'] == 'ator' and len(d['comentarios']) == 1
    assert next(v for v in d['versoes'] if v['n'] == 2)['itens'][0]['descricao'] == 'ajustado'
    assert cliente.put(f'{url}/versao', json={'n': 9}).status_code == 404
    d = cliente.delete(f'{url}/comentarios/{cid}').json()
    assert d['comentarios'] == []
    # gerar do zero: os planos são outros, as transições trocadas à mão (presas ao id do plano) saem
    projeto.atualizar(id, lambda p: p['direcao'].update(pedido={'tipo': 'gerar'}))
    monkeypatch.setattr(direcao_projeto, 'propor', lambda i: {'itens': [plano], 'itens_ia': [plano], 'registro': None})
    direcao_projeto._rodar(id)
    assert projeto.ler(id)['direcao']['ativa'] == 1 and 'transicoes' not in projeto.ler(id)


def test_roteiro_da_versao_com_lettering_e_comentarios():
    texto = ['Hoje', 'o', 'GPT', 'saiu.', 'Veja', 'o', 'site']
    saida = [{'id': f'w{k}', 'texto': t, 'saida_ini': k * 0.4, 'saida_fim': k * 0.4 + 0.3} for k, t in enumerate(texto)]
    def item(id, camada, tipo, a, b, **kw):
        return {'id': id, 'camada': camada, 'tipo': tipo, 'conteudo': kw.get('conteudo'), 'palavra_ini': f'w{a}', 'palavra_fim': f'w{b}',
                'texto': kw.get('texto'), 'descricao': kw.get('descricao', ''), 'como_gerar': None}
    itens = [item('p1', 'plano', 'full_ator', 0, 3, descricao='apresenta'),
             item('p2', 'plano', 'tela_dividida', 4, 6, conteudo='insert', descricao='o site'),
             item('e1', 'elemento', 'lettering', 2, 2, texto='GPT'),
             item('e2', 'elemento', 'palavra_manychat', 5, 5, texto='SITE')]
    com = [{'palavra': 'w3', 'texto': 'troque aqui'}, {'palavra': 'w2', 'texto': 'maior'}]
    r = direcao_projeto.roteiro_da_versao(itens, saida, com)
    assert r == ('[Full ator: apresenta]\n“Hoje o <lettering>GPT</lettering> {💬 maior} saiu. {💬 troque aqui}”\n\n'
                 '[Tela dividida · insert: o site + palavra manychat «SITE»]\n“Veja o site”')
    # os comentários não voltam para a fala ao ler de novo, e o alinhamento casa tudo
    lets = []
    assert direcao_projeto.alinhar(direcao_projeto.ler_roteiro(r), saida, lets) == [(0, 3), (4, 6)] and [(l['ini'], l['fim']) for l in lets] == [(2, 2)]


def test_versoes_numeradas_de_zero_viram_de_um(cliente, video):
    id = _criar(cliente, video)['id']
    vs = [{'n': 0, 'origem': None, 'itens': [1]}, {'n': 1, 'origem': 0, 'itens': [2]}]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'versoes': vs, 'ativa': 1, 'itens': [2]}))
    d = projeto.ler(id)['direcao']
    assert [(v['n'], v['origem']) for v in d['versoes']] == [(1, None), (2, 1)] and d['ativa'] == 2 and d['itens'] == [2]



# ---------------------------------------------------------------- inserts

def _saida_inserts():
    texto = ['Qual', 'a', 'melhor', 'IA?', 'Cara,', 'olha', 'esses', 'sites', 'lindos', 'aqui.']
    return [{'id': f'w{k}', 'texto': t, 'saida_ini': k * 0.5, 'saida_fim': k * 0.5 + 0.4} for k, t in enumerate(texto)]


def _plano_ins(id, tipo, a, b, conteudo=None, descricao='x'):
    return {'id': id, 'camada': 'plano', 'tipo': tipo, 'conteudo': conteudo, 'palavra_ini': f'w{a}', 'palavra_fim': f'w{b}',
            'off_ini': 0, 'off_fim': 0, 'texto': None, 'descricao': descricao, 'como_gerar': 'grave'}


def test_pedidos_de_insert_saem_dos_planos_com_insert():
    itens = [_plano_ins('p1', 'comentario_insert_ator', 0, 3), _plano_ins('p2', 'full_ator', 4, 5),
             _plano_ins('p3', 'insert_tela_cheia', 6, 9), {'id': 'e1', 'camada': 'elemento', 'tipo': 'lettering', 'palavra_ini': 'w7', 'palavra_fim': 'w7'}]
    ps = inserts.pedidos_da_direcao(itens, _saida_inserts())
    assert [(x['plano'], x['formato'], x['inicio'], x['duracao']) for x in ps] == [('p1', 'dividida', 0.0, 2.0), ('p3', 'vertical', 3.0, 1.9)]
    assert ps[1]['fala'] == 'esses sites lindos aqui.'


def _imagem_teste(destino, w=320, h=180):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=blue:s={w}x{h}', '-frames:v', '1', str(destino)], check=True)
    return destino


def test_banco_sobe_descreve_busca_edita_e_apaga(cliente, tmp_path, monkeypatch):
    chamadas = []
    monkeypatch.setattr(banco, '_descricoes', types.SimpleNamespace(submit=lambda f, bid: chamadas.append(bid)))
    img = _imagem_teste(tmp_path / 'print do github.png')
    with img.open('rb') as f:
        r = cliente.post('/api/banco', files=[('arquivos', ('print do github.png', f, 'image/png'))])
    assert r.status_code == 200
    item = r.json()[0]
    assert (item['tipo'], item['nome'], item['formato'], item['largura'], item['ia']['status']) == ('imagem', 'print do github', '16:9', 320, 'fila')
    assert chamadas == [item['id']]  # a descrição por IA vai para a fila
    assert cliente.get(f"/api/banco/{item['id']}/miniatura").status_code == 200
    assert cliente.get(f"/api/banco/{item['id']}/arquivo").status_code == 200
    with img.open('rb') as f:
        assert cliente.post('/api/banco', files=[('arquivos', ('x.gif', f, 'image/gif'))]).status_code == 422
    # a IA descreve (simulada): a descrição entra se o criador não escreveu nada; as palavras se somam
    cliente.put(f"/api/banco/{item['id']}", json={'palavras': ['GitHub ', 'github', 'repo']})

    class Falso:
        def __init__(self, **k): pass
        def with_structured_output(self, *a, **k): return self
        def invoke(self, msgs): return banco.DescricaoMidia(descricao='Página do GitHub do Graphify.', palavras=['Graphify', 'repo'])
    import langchain_openrouter
    monkeypatch.setattr(langchain_openrouter, 'ChatOpenRouter', Falso)
    banco.descrever(item['id'])
    i = cliente.get(f"/api/banco/{item['id']}").json()
    assert (i['descricao'], i['palavras'], i['ia']['status'], i['usos']) == ('Página do GitHub do Graphify.', ['github', 'repo', 'graphify'], 'pronto', [])
    assert [x['id'] for x in cliente.get('/api/banco?busca=graphify').json()] == [item['id']]
    assert cliente.get('/api/banco?busca=graphify&tipo=video').json() == []
    assert cliente.get('/api/banco?busca=sora').json() == []
    # a busca não diferencia acentos, nos dois sentidos: "pagina" acha "Página", "grâphify" acha "Graphify"
    for q in ('pagina', 'PÁGINA', 'grâphify'):
        assert [x['id'] for x in cliente.get('/api/banco', params={'busca': q}).json()] == [item['id']], q
    assert cliente.delete(f"/api/banco/{item['id']}").json() == {'ok': True}
    assert cliente.get(f"/api/banco/{item['id']}").status_code == 404


def test_inserts_ligam_midias_do_banco_e_sobrevivem_a_versoes(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    itens = [_plano_ins('p1', 'tela_dividida_insert', 0, 5), _plano_ins('p2', 'insert_tela_cheia', 6, 9)]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    ins = cliente.get(f'/api/projetos/{id}/inserts').json()
    p1, p2 = ins['pedidos']
    assert p1['midias'] == [] and p2['midias'] == [] and p1['formato'] == 'dividida'
    banco.salvar_item({'id': 'b1', 'nome': 'site A', 'tipo': 'video', 'arquivo': 'original.mp4', 'proxy': 'proxy.mp4', 'largura': 1600, 'altura': 900})
    banco.salvar_item({'id': 'b2', 'nome': 'print', 'tipo': 'imagem', 'arquivo': 'original.png', 'largura': 900, 'altura': 900})
    r = cliente.put(f"/api/projetos/{id}/inserts/{p1['id']}/midias", json={'midias': [{'banco': 'b1', 'inicio': 3.5}, {'banco': 'b2'}]}).json()
    assert [(m['banco'], 'inicio' in m) for m in r['pedidos'][0]['midias']] == [('b1', False), ('b2', False)]
    assert cliente.put(f"/api/projetos/{id}/inserts/{p1['id']}/midias", json={'midias': [{'banco': 'zz'}]}).status_code == 404
    assert [u['pedido'] for u in cliente.get('/api/banco/b1').json()['usos']] == [p1['id']]
    assert banco.ler_item('b2')['formato'] == '1:1'
    # versão nova da direção: o insert que não mudou mantém as mídias
    projeto.atualizar(id, lambda p: p['direcao'].update(itens=[{**itens[0]}, {**itens[1], 'descricao': 'outra'}]))
    ins = cliente.get(f'/api/projetos/{id}/inserts').json()
    assert ins['pedidos'][0]['id'] == p1['id'] and len(ins['pedidos'][0]['midias']) == 2 and ins['pedidos'][1]['midias'] == []
    # apagar a mídia do banco a tira do insert
    cliente.delete('/api/banco/b1')
    assert [m['banco'] for m in cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['midias']] == ['b2']


def test_insert_volta_inteiro_quando_o_plano_volta_a_ter_insert(cliente, video, monkeypatch):
    """O plano vira uma categoria sem insert (Full ator) e volta: as mídias, o enriquecimento e o card voltam com ele."""
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    itens = [_plano_ins('p1', 'tela_dividida_insert', 0, 5), _plano_ins('p2', 'insert_tela_cheia', 6, 9)]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    p1 = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]
    banco.salvar_item({'id': 'b1', 'nome': 'site A', 'tipo': 'video', 'arquivo': 'original.mp4', 'proxy': 'proxy.mp4', 'largura': 1600, 'altura': 900})
    cliente.put(f"/api/projetos/{id}/inserts/{p1['id']}/midias", json={'midias': [{'banco': 'b1'}]})
    cliente.put(f"/api/projetos/{id}/inserts/{p1['id']}/enriquecimento", json={'campos': {'divisao': 'atras', 'ator': {'modo': 'canto'}}})
    projeto.atualizar(id, lambda p: p['direcao'].update(itens=[{**itens[0], 'tipo': 'full_ator'}, itens[1]]))
    assert [x['plano'] for x in cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos']] == ['p2']
    projeto.atualizar(id, lambda p: p['direcao'].update(itens=itens))
    x = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]
    assert x['id'] == p1['id'] and [m['banco'] for m in x['midias']] == ['b1']
    assert x['enriquecimento'] == {'divisao': 'atras', 'ator': {'modo': 'canto'}}
    assert projeto.ler(id)['inserts']['guardados'] == []  # voltou: não fica mais guardado


def test_pedido_do_agente_antigo_vira_midias(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'insert_tela_cheia', 0, 9)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    banco.salvar_item({'id': 'cap1', 'midia': 'video', 'arquivo': 'captura.mp4', 'resumo': 'site', 'origem': {'titulo': 'Site A'}, 'largura': 2880, 'altura': 1800})

    def antigo(p):
        x = p['inserts']['pedidos'][0]
        x.pop('midias')
        x['takes'] = [{'id': 't1', 'escolhido': 'c1', 'candidatos': [{'id': 'c1', 'banco': 'cap1', 'inicio': 2.5}, {'id': 'c2', 'banco': 'cap1', 'inicio': 9}]},
                      {'id': 't2', 'escolhido': None, 'candidatos': []}]
    projeto.atualizar(id, antigo)
    x = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]
    assert x['id'] == pid and [m['banco'] for m in x['midias']] == ['cap1']
    item = banco.ler_item('cap1')  # captura antiga vira item comum do banco
    assert (item['tipo'], item['nome'], item['formato'], item['origem']['tipo']) == ('video', 'Site A', '16:10', 'captura automática')



def test_trechos_do_banco_e_corte_do_original(cliente, video, tmp_path, monkeypatch):
    monkeypatch.setattr(banco, '_descricoes', types.SimpleNamespace(submit=lambda f, bid: None))
    monkeypatch.setattr(banco, '_cortes', types.SimpleNamespace(submit=lambda f, *a: f(*a)))  # corta na hora
    with video.open('rb') as f:
        orig = cliente.post('/api/banco', files=[('arquivos', ('gravacao.mp4', f, 'video/mp4'))]).json()[0]
    banco.atualizar_item(orig['id'], {'descricao': 'tela do app', 'palavras': ['app']})
    a = cliente.post(f"/api/banco/{orig['id']}/trechos", json={'inicio': 0.5, 'fim': 1.5}).json()
    b = cliente.post(f"/api/banco/{orig['id']}/trechos", json={'inicio': 2.0, 'fim': 2.9, 'nome': 'final'}).json()
    assert (a['pai'], a['duracao'], a['nome'], a['descricao'], a['palavras']) == (orig['id'], 1.0, 'gravacao · trecho 1', 'tela do app', ['app'])
    assert cliente.post(f"/api/banco/{orig['id']}/trechos", json={'inicio': 1, 'fim': 1.1}).status_code == 422  # curto demais
    assert cliente.post(f"/api/banco/{a['id']}/trechos", json={'inicio': 0, 'fim': 0.5}).status_code == 422  # trecho de trecho
    # o banco lista só os originais, cada um com os trechos; o trecho toca o arquivo do original
    lista = cliente.get('/api/banco').json()
    assert [i['id'] for i in lista] == [orig['id']] and [t['nome'] for t in lista[0]['trechos']] == ['gravacao · trecho 1', 'final']
    assert cliente.get('/api/banco?busca=final').json()[0]['id'] == orig['id']
    assert cliente.get(f"/api/banco/{a['id']}/arquivo").status_code == 200 and cliente.get(f"/api/banco/{a['id']}/miniatura").status_code == 200
    assert cliente.get(f"/api/banco/{orig['id']}/tira").status_code == 200
    assert cliente.put(f"/api/banco/{a['id']}", json={'inicio': 0.4, 'fim': 1.6}).json()['duracao'] == 1.2
    # cortar as pontas do original: os trechos acompanham o novo começo; o que cai fora some
    r = cliente.post(f"/api/banco/{orig['id']}/cortar", json={'inicio': 0.3, 'fim': 1.9}).json()
    det = cliente.get(f"/api/banco/{orig['id']}").json()
    assert det['edicao']['status'] == 'pronto' and det['duracao'] == pytest.approx(1.6, abs=0.1) and r['id'] == orig['id']
    assert [(t['id'], t['inicio'], t['fim']) for t in det['trechos']] == [(a['id'], 0.1, pytest.approx(1.3, abs=0.01))]
    assert cliente.get(f"/api/banco/{b['id']}").status_code == 404
    # apagar o original apaga os trechos
    cliente.delete(f"/api/banco/{orig['id']}")
    assert cliente.get(f"/api/banco/{a['id']}").status_code == 404


def test_enriquecimento_guarda_so_o_que_difere_do_estilo(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    itens = [_plano_ins('p1', 'insert_tela_cheia', 0, 5), _plano_ins('p2', 'insert_tela_cheia', 6, 9)]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    p1, p2 = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos']
    url = f"/api/projetos/{id}/inserts/{p1['id']}/enriquecimento"
    r = cliente.put(url, json={'campos': {'layout': 'inclinado', 'entrada': 'surgir'}}).json()  # surgir já é o estilo
    assert r['pedidos'][0]['enriquecimento'] == {'layout': 'inclinado'}
    assert cliente.put(url, json={'campos': {'layout': 'metade'}}).status_code == 422  # metade é de tela dividida
    assert cliente.put(url, json={'campos': {'cor': 'azul'}}).status_code == 422
    r = cliente.post(f'{url}/tipo').json()
    assert r['pedidos'][1]['enriquecimento'] == {'layout': 'inclinado'}
    r = cliente.put(url, json={'campos': {'layout': None}}).json()  # volta ao estilo
    assert r['pedidos'][0]['enriquecimento'] == {}
    # versão nova da direção: o insert que não mudou mantém o enriquecimento
    projeto.atualizar(id, lambda p: p['direcao'].update(itens=[{**itens[0]}, {**itens[1]}]))
    assert cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][1]['enriquecimento'] == {'layout': 'inclinado'}
    assert cliente.get('/api/inserts/enriquecimento').json()['estilo']['vertical']['layout'] == 'card'


def test_ajuste_do_ator_passa_pela_rota(cliente, video, monkeypatch):
    """O ator da P5 (docs/rosto.md) leva números (centro, escala, deslocamento, zoom): a rota aceita e guarda no insert."""
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'comentario_insert_ator', 0, 5)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    url = f'/api/projetos/{id}/inserts/{pid}/enriquecimento'
    r = cliente.put(url, json={'campos': {'ator': {'modo': 'canto', 'x': 0.5, 'y': 0.7, 'escala': 0.3}}})
    assert r.status_code == 200 and r.json()['pedidos'][0]['enriquecimento']['ator'] == {'modo': 'canto', 'x': 0.5, 'y': 0.7, 'escala': 0.3}
    r = cliente.put(url, json={'campos': {'ator': {'dx': 0.1, 'dy': -0.05, 'zoom': 1.2}}})
    assert r.status_code == 200 and r.json()['pedidos'][0]['enriquecimento']['ator'] == {'dx': 0.1, 'dy': -0.05, 'zoom': 1.2}
    assert cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['enriquecimento']['ator']['zoom'] == 1.2
    assert cliente.put(url, json={'campos': {'ator': {'x': 'meio'}}}).status_code == 422
    assert cliente.put(url, json={'campos': {'ajustes': {'cor': 1}}}).status_code == 422  # os ajustes do preset seguem só texto
    assert 'ator' not in cliente.put(url, json={'campos': {'ator': None}}).json()['pedidos'][0]['enriquecimento']


def test_card_de_comentario_guarda_so_o_que_difere(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    itens = [{**_plano_ins('p1', 'comentario_insert_ator', 0, 5), 'texto': 'Qual a melhor IA?'}, _plano_ins('p2', 'insert_tela_cheia', 6, 9)]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    p1, p2 = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos']
    url = f"/api/projetos/{id}/inserts/{p1['id']}/comentario"
    r = cliente.put(url, json={'campos': {'avatar': 3, 'y': 200, 'tempo': '4 sem', 'texto': ' Outra pergunta '}}).json()
    assert r['pedidos'][0]['comentario'] == {'avatar': 3, 'y': 95.0, 'texto': 'Outra pergunta'}  # 4 sem é o padrão; y limitado
    assert cliente.put(url, json={'campos': {'cor': 'azul'}}).status_code == 422
    assert cliente.put(f"/api/projetos/{id}/inserts/{p2['id']}/comentario", json={'campos': {'avatar': 1}}).status_code == 422
    assert cliente.put(url, json={'campos': {'texto': None}}).json()['pedidos'][0]['comentario'] == {'avatar': 3, 'y': 95.0}
    projeto.atualizar(id, lambda p: p['direcao'].update(itens=[{**itens[0]}, {**itens[1]}]))
    assert cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['comentario']['avatar'] == 3


def test_renomear_referencia(cliente, monkeypatch):
    monkeypatch.setattr(referencias, 'ler', lambda id: {'id': id, 'nome': 'velho'})
    feito = {}
    monkeypatch.setattr(referencias, 'atualizar', lambda id, f: (f(feito), feito)[1])
    assert cliente.put('/api/referencias/r1/nome', json={'nome': '  Novo nome '}).json()['nome'] == 'Novo nome'
    assert cliente.put('/api/referencias/r1/nome', json={'nome': '   '}).status_code == 422


def test_fundo_vale_para_o_projeto_e_sobrevive_a_sincronizar(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'insert_tela_cheia', 0, 5)]}))
    cliente.get(f'/api/projetos/{id}/inserts')
    assert cliente.put(f'/api/projetos/{id}/inserts/fundo', json={'fundo': 'chuva'}).json()['fundo'] == 'chuva'
    assert cliente.put(f'/api/projetos/{id}/inserts/fundo', json={'fundo': 'roxo'}).status_code == 422
    assert cliente.get(f'/api/projetos/{id}/inserts').json()['fundo'] == 'chuva'


def test_enriquecimento_antigo_com_fundo_por_insert_nao_quebra(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'tela_dividida_insert', 0, 5)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    projeto.atualizar(id, lambda p: p['inserts']['pedidos'][0].update(enriquecimento={'fundo': 'chuva', 'entrada': 'voo_3d'}))
    r = cliente.put(f'/api/projetos/{id}/inserts/{pid}/enriquecimento', json={'campos': {'layout': 'card_metade'}})
    assert r.status_code == 200 and r.json()['pedidos'][0]['enriquecimento'] == {'entrada': 'voo_3d', 'layout': 'card_metade'}


def test_enriquecimento_de_2_midias(cliente, video, monkeypatch):
    """Com 2 mídias: como convivem (`entre`), a entrada e a saída da 2ª (`_2`) e onde ela começa (`corte`, fração)."""
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'insert_tela_cheia', 0, 5)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    projeto.atualizar(id, lambda p: p['inserts']['pedidos'][0].update(enriquecimento={'entre': 'sequencia_transicao'}))  # opção antiga
    url = f'/api/projetos/{id}/inserts/{pid}/enriquecimento'
    r = cliente.put(url, json={'campos': {'entre': 'empilhadas', 'entrada_2': 'voo_3d', 'saida_2': 'sumir', 'corte': 0.99}})
    assert r.json()['pedidos'][0]['enriquecimento'] == {'entre': 'empilhadas', 'entrada_2': 'voo_3d', 'saida_2': 'sumir', 'corte': 0.95}
    r = cliente.put(url, json={'campos': {'entre': 'sequencia', 'entrada_2': 'surgir', 'saida_2': 'corte', 'corte': None}})  # o estilo: não guarda
    assert r.json()['pedidos'][0]['enriquecimento'] == {}
    assert cliente.put(url, json={'campos': {'entre': 'cascata'}}).status_code == 422
    assert cliente.put(url, json={'campos': {'corte': 'meio'}}).status_code == 422
    assert cliente.put(url, json={'campos': {'corte': -1}}).json()['pedidos'][0]['enriquecimento']['corte'] == 0.0  # junto com a 1ª


def test_entrada_e_saida_globais(cliente):
    """A configuração de cada entrada e saída é global (vale para todos os inserts): curva, duração e os detalhes."""
    from app import entradas
    t = cliente.get('/api/entradas').json()
    assert t['entrada']['subir'] == entradas.PADRAO['entrada']['subir'] and t['saida']['deslizar']['direcao'] == 'baixo'
    r = cliente.put('/api/entradas/entrada/subir', json={'campos': {'direcao': 'esquerda', 'distancia': 999, 'duracao': 1.1, 'fade': False}}).json()
    assert {k: r['entrada']['subir'][k] for k in ('direcao', 'distancia', 'duracao', 'fade')} == {'direcao': 'esquerda', 'distancia': 150, 'duracao': 1.0, 'fade': False}
    assert cliente.get('/api/entradas').json()['entrada']['subir']['direcao'] == 'esquerda'  # fica salvo
    r = cliente.put('/api/entradas/entrada/subir', json={'campos': {'direcao': None}}).json()
    assert r['entrada']['subir']['direcao'] == 'cima'  # None volta ao padrão de fábrica
    assert cliente.put('/api/entradas/entrada/subir', json={'campos': {'direcao': 'diagonal'}}).status_code == 422
    assert cliente.put('/api/entradas/saida/girar', json={'campos': {}}).status_code == 422
    assert cliente.put('/api/entradas/saida/sumir', json={'campos': {'escala': 120}}).status_code == 422  # campo que o sumir não tem
    assert 'entrada' not in cliente.get('/api/transicoes').json()  # o nome ficou para as transições entre planos (SPEC §8.8)


def test_entradas_leem_a_configuracao_antiga_e_passam_a_gravar_na_nova(cliente):
    """Até out/2026 a configuração ficava em `transicoes` nas Configurações: continua valendo e, na primeira mudança,
    passa para `entradas` (o nome `transicoes` fica livre para as transições entre planos)."""
    projeto.salvar_config({**projeto.ler_config(), 'transicoes': {'entrada': {'surgir': {'escala': 80}}, 'saida': {'sumir': {'duracao': 1.5}}}})
    t = cliente.get('/api/entradas').json()
    assert t['entrada']['surgir']['escala'] == 80 and t['saida']['sumir']['duracao'] == 1.5
    cliente.put('/api/entradas/entrada/subir', json={'campos': {'distancia': 60}})
    config = projeto.ler_config()
    assert 'transicoes' not in config
    assert config['entradas'] == {'entrada': {'surgir': {'escala': 80}, 'subir': {'distancia': 60.0}}, 'saida': {'sumir': {'duracao': 1.5}}}
    t = cliente.get('/api/entradas').json()
    assert (t['entrada']['surgir']['escala'], t['entrada']['subir']['distancia'], t['saida']['sumir']['duracao']) == (80, 60, 1.5)
    # outra coisa com o nome `transicoes` (a P2) não é confundida com a configuração antiga
    projeto.salvar_config({'motor_padrao': 'whisper-stable', 'transicoes': {'favoritas': {'a>b': ['x']}}})
    assert cliente.get('/api/entradas').json()['entrada']['surgir']['escala'] == 94


def test_entradas_migram_quando_o_servidor_sobe(cliente):
    """A chave antiga passa para `entradas` já no boot, sem esperar a primeira mudança: assim, quando a P2 gravar em
    `transicoes`, as curvas salvas do criador já não estão lá."""
    from fastapi.testclient import TestClient

    from app import entradas, main
    antiga = {'entrada': {'subir': {'curva': [0.0, 0.7, 0.3, 0.9]}}, 'saida': {'deslizar': {'direcao': 'cima'}}}
    projeto.salvar_config({**projeto.ler_config(), 'transicoes': antiga})
    with TestClient(main.app):  # o ciclo de vida (lifespan) roda ao abrir
        pass
    config = projeto.ler_config()
    assert config['entradas'] == antiga and 'transicoes' not in config
    assert entradas.migrar() is False  # só uma vez
    # a P2 grava o que for dela em `transicoes`: as entradas do criador continuam
    config['transicoes'] = {'favoritas': {'a>b': ['x']}}
    projeto.salvar_config(config)
    t = cliente.get('/api/entradas').json()
    assert t['entrada']['subir']['curva'] == [0.0, 0.7, 0.3, 0.9] and t['saida']['deslizar']['direcao'] == 'cima'
    assert entradas.migrar() is False and projeto.ler_config()['transicoes'] == {'favoritas': {'a>b': ['x']}}


def test_entradas_que_sairam_voltam_ao_estilo(cliente, video, monkeypatch):
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'insert_tela_cheia', 0, 5)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    url = f'/api/projetos/{id}/inserts/{pid}/enriquecimento'
    assert cliente.put(url, json={'campos': {'entrada': 'mola'}}).status_code == 422
    projeto.atualizar(id, lambda p: p['inserts']['pedidos'][0].update(enriquecimento={'entrada': 'girar'}))
    assert cliente.put(url, json={'campos': {'layout': 'inclinado'}}).json()['pedidos'][0]['enriquecimento'] == {'layout': 'inclinado'}


def test_transicao_do_video(cliente, video):
    id = _criar(cliente, video)['id']
    assert cliente.put(f'/api/projetos/{id}/inserts/transicao', json={'transicao': 'zoom'}).json()['transicao'] == 'zoom'
    assert cliente.put(f'/api/projetos/{id}/inserts/transicao', json={'transicao': 'girar'}).status_code == 422


# --- exportação (SPEC §13) ---

def test_exportacao_ator_mantem_cortes_e_sincronia_e_camada_no_instante_certo(video, tmp_path):
    """Dois clipes viram um vídeo só, na duração somada, com áudio do mesmo tamanho; um clipe da camada (ProRes 4444, 3
    quadros vermelhos opacos) entra exatamente nos quadros 10 a 12, sem perder nenhum quadro."""
    from app import exportacao
    clipes = [{'inicio': 0.2, 'fim': 0.8}, {'inicio': 2.1, 'fim': 2.9}]
    w, h, fps, dur = 180, 320, 24, 1.4
    camada = tmp_path / 'camada.mov'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-framerate', str(fps), '-i', '-',
                    '-c:v', 'prores_videotoolbox', '-profile:v', '4444', str(camada)], input=bytes([255, 0, 0, 255]) * (w * h * 3), check=True)
    saida = tmp_path / 'final.mp4'
    subprocess.run(exportacao.comando_final(video, clipes, False, 0.5, w, h, fps, [(0, 0.6, {'modo': 'metade', 'f': 0.5})], [(camada, 10 / fps)], 'h264', dur, saida),
                   check=True, capture_output=True)
    n = round(dur * fps)
    info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,width,height,nb_read_frames,duration',
                                      '-of', 'json', str(saida)], capture_output=True, text=True).stdout)['streams']
    v = next(s for s in info if s['codec_type'] == 'video')
    a = next(s for s in info if s['codec_type'] == 'audio')
    assert (v['width'], v['height'], int(v['nb_read_frames'])) == (w, h, n)
    assert abs(float(a['duration']) - dur) < 0.05
    cor = lambda k: subprocess.run(['ffmpeg', '-v', 'error', '-i', str(saida), '-vf', f'select=eq(n\\,{k}),scale=1:1', '-frames:v', '1',
                                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    vermelho = lambda k: cor(k)[0] > 200 and cor(k)[1] < 60 and cor(k)[2] < 60
    assert [vermelho(k) for k in (9, 10, 11, 12, 13)] == [False, True, True, True, False]


def test_exportacao_com_divisoes_e_pessoa_recortada(video, tmp_path):
    """Com a máscara da pessoa: um trecho 56/44 (a cabeça sai por cima) e um "insert atrás" (o ator numa janela) montam e
    o vídeo sai inteiro."""
    from app import exportacao
    clipes = [{'inicio': 0.2, 'fim': 0.8}, {'inicio': 2.1, 'fim': 2.9}]
    w, h, fps, dur = 180, 320, 24, 1.4
    mascara = tmp_path / 'mascara.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=white:s=360x640:r=30:d=3', '-pix_fmt', 'yuv420p', str(mascara)], check=True)
    saida = tmp_path / 'final.mp4'
    divisoes = [(0, 0.6, {'modo': 'metade', 'f': 0.5625}), (0.7, 1.3, {'modo': 'atras'})]
    r = subprocess.run(exportacao.comando_final(video, clipes, False, 0.5, w, h, fps, divisoes, [], 'h264', dur, saida, mascara),
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    n = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-select_streams', 'v',
                                   '-of', 'json', str(saida)], capture_output=True, text=True).stdout)['streams'][0]['nb_read_frames']
    assert int(n) == round(dur * fps)


def test_exportacao_divide_os_inserts_em_pedacos():
    from app import exportacao
    trechos = [{'ini': 0.0, 'fim': 1.828}, {'ini': 10.751, 'fim': 14.341}]
    g = exportacao.pedacos(trechos, 24, 6)
    quadros = [[q for x in grupo for q in x] for grupo in g]
    assert quadros == [list(range(0, 44)), list(range(259, 345))]  # quadro q no insert se ini <= q/fps < fim
    assert all(12 <= len(x) <= 48 for grupo in g for x in grupo[:-1])  # só o último pedaço de cada insert é menor
    assert exportacao.pedacos([], 24, 6) == []


def test_exportar_valida_e_roda_uma_por_projeto(cliente, video, monkeypatch):
    from app import exportacao
    rodou = []
    monkeypatch.setattr(exportacao, '_fila', types.SimpleNamespace(submit=lambda f, *a: rodou.append(a)))
    monkeypatch.setattr(exportacao, '_andamento', {})
    id = _criar(cliente, video)['id']
    url = f'/api/projetos/{id}/exportacao'
    assert cliente.post(url, json={'resolucao': '8k'}).status_code == 422
    assert cliente.post(url, json={'navegadores': 9}).status_code == 422
    assert cliente.post(url, json={}).status_code == 409  # ainda sem cortes
    projeto.atualizar(id, lambda p: p['timeline'].update(V1=[{'id': 'c1', 'fonte': 'f1', 'inicio': 0.0, 'fim': 1.0}]))
    e = cliente.post(url, json={'nome': 'meu/vídeo: final'}).json()
    assert (e['status'], e['resolucao'], e['fps'], e['codec'], e['navegadores'], e['nome']) == ('rodando', '4k', 24, 'hevc', 6, 'meu vídeo final')
    assert cliente.post(url, json={}).status_code == 409  # uma por projeto
    assert cliente.get(url).json()['atual']['status'] == 'rodando' and len(rodou) == 1
    cliente.post(f'{url}/cancelar')
    assert exportacao._andamento[id]['cancelar'].is_set()
    assert cliente.get(f'{url}/arquivo').status_code == 404


def test_exportacao_interrompida_vira_erro_e_pedacos_saem(cliente, video):
    from app import exportacao
    id = _criar(cliente, video)['id']
    projeto.atualizar(id, lambda p: p.update(exportacao={'status': 'rodando', 'progresso': 0.4, 'nome': 'x', 'arquivo': None}))
    pasta = exportacao.pasta_exports(id)
    pasta.mkdir()
    (pasta / 'x.parte.mp4').write_bytes(b'1')
    (pasta / 'x.parte.camadas').mkdir()
    (pasta / 'x.parte.camadas' / '000_000.mov').write_bytes(b'1')
    (pasta / 'pronto.mp4').write_bytes(b'1')
    exportacao.retomar_interrompidas()
    e = projeto.ler(id)['exportacao']
    assert e['status'] == 'erro' and 'reiniciou' in e['erro']
    assert [f.name for f in pasta.iterdir()] == ['pronto.mp4']


# --- presets de enriquecimento (SPEC §8.4) ---

def _receita(dy=38, rot=0.0, n=1, curva=(0.16, 1, 0.3, 1)):
    card = lambda k: {'inicio_frac': 0.5 * k, 'sai_antes_do_fim': 0, 'ajuste': 'cover',
                      'repouso': {'cx': 50, 'cy': 46 + 30 * k, 'w': 84, 'h': 40, 'rot': rot, 'rx': 0, 'ry': 0, 'raio': 3, 'sombra': True, 'z': 1 + k},
                      'entrada': {'duracao': 0.6, 'de': {'dx': 0, 'dy': dy, 'escala': 1, 'rot': 0, 'rx': 0, 'ry': 0, 'opacidade': 0, 'desfoque': 0},
                                  'curvas': {'pos': list(curva), 'opacidade': [0.33, 0, 0.67, 1]}},
                      'saida': {'duracao': 0.4, 'para': {'dx': 0, 'dy': -60, 'escala': 1, 'rot': 0, 'rx': 0, 'ry': 0, 'opacidade': 1, 'desfoque': 0},
                                'curvas': {'pos': [0.7, 0, 0.84, 0]}}}
    return {'formato': 'vertical', 'fundo': 'proprio', 'duracao_ref': 2.5, 'cards': [card(k) for k in range(n)]}


def test_preset_feito_a_mao_e_marcado_na_referencia(tmp_path, monkeypatch):
    from app import presets
    monkeypatch.setattr(presets, 'RAIZ', tmp_path / 'presets')
    p = presets.criar('Card · entra de baixo', _receita(), [{'ref': 'ref1', 'inicio': 1, 'fim': 3.5}])
    assert presets.ler(p['id'])['receita']['cards'][0]['entrada']['de']['dy'] == 38 and not p['aprovado']
    assert presets.fontes() == [{'ref': 'ref1', 'inicio': 1.0, 'fim': 3.5, 'preset': p['id'], 'nome': 'Card · entra de baixo', 'aprovado': False}]
    # aprovado e ajustado pelo criador
    c = p['receita']['cards'][0]
    presets.editar(p['id'], {'aprovado': True, 'receita': {**p['receita'], 'cards': [{**c, 'repouso': {**c['repouso'], 'w': 70}}]}})
    assert presets.ler(p['id'])['receita']['cards'][0]['repouso']['w'] == 70 and presets.fontes()[0]['aprovado']
    with pytest.raises(ValueError):
        presets.validar_receita({'formato': 'quadrado', 'cards': []})
    assert presets.validar_receita(_receita(dy=999))['cards'][0]['entrada']['de']['dy'] == 200  # nos limites


def test_ordem_dos_presets_por_situacao(cliente, monkeypatch, tmp_path):
    from app import presets
    monkeypatch.setattr(presets, 'RAIZ', tmp_path / 'presets')
    a, b = (presets.criar(n, _receita(), [])['id'] for n in ('A', 'B'))
    url = '/api/presets/ordem/vertical%3A2%2B'
    assert cliente.put(url, json={'campos': {'ids': [b, a, b, '0000000000'], 'favoritos': 1}}).json() == {'vertical:2+': {'ids': [b, a], 'favoritos': 1}}
    assert len(cliente.get('/api/presets').json()) == 2  # o ordem.json não vira preset
    assert cliente.put('/api/presets/ordem/quadrado%3A1', json={'campos': {'ids': [a]}}).status_code == 422
    assert cliente.put('/api/presets/ordem/dividida%3A1%3Ape', json={'campos': {'ids': [a]}}).status_code == 200  # 1 mídia: pela proporção
    presets.apagar(b)
    assert cliente.get('/api/presets/ordem').json()['vertical:2+'] == {'ids': [a], 'favoritos': 0}  # o favorito apagado sai
    assert 'vertical:2+' not in cliente.put(url, json={'campos': {'ids': []}}).json()  # vazia: volta a não ter ordem


def test_insert_com_preset(cliente, video, monkeypatch, tmp_path):
    from app import presets
    monkeypatch.setattr(presets, 'RAIZ', tmp_path / 'presets')
    presets.salvar({'id': 'abcdef0123', 'nome': 'x', 'formato': 'vertical', 'receita': presets.validar_receita(_receita()), 'fontes': [], 'aprovado': True})
    id = _criar(cliente, video)['id']
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: _saida_inserts())
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [_plano_ins('p1', 'insert_tela_cheia', 0, 5)]}))
    pid = cliente.get(f'/api/projetos/{id}/inserts').json()['pedidos'][0]['id']
    url = f'/api/projetos/{id}/inserts/{pid}/enriquecimento'
    assert cliente.put(url, json={'campos': {'preset': 'abcdef0123'}}).json()['pedidos'][0]['enriquecimento'] == {'preset': 'abcdef0123'}
    assert cliente.put(url, json={'campos': {'preset': '0000000000'}}).status_code == 422
    assert cliente.put(url, json={'campos': {'preset': None}}).json()['pedidos'][0]['enriquecimento'] == {}
    assert cliente.patch('/api/presets/abcdef0123', json={'campos': {'nome': 'Card que sobe'}}).json()['nome'] == 'Card que sobe'
    assert cliente.patch('/api/presets/abcdef0123', json={'campos': {'receita': {'formato': 'x'}}}).status_code == 422
