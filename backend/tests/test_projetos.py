import subprocess
import sys
import types
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import cortes, main, midia, pipeline, projeto, transcricao


@pytest.fixture
def enfileirados(tmp_path, monkeypatch):
    monkeypatch.setattr(projeto, 'RAIZ', tmp_path / 'projetos')
    chamadas = []
    monkeypatch.setattr(pipeline, 'enfileirar', lambda id, passos=pipeline.PASSOS: chamadas.append((id, passos)))
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
    assert {k: v['status'] for k, v in p['pipeline']['passos'].items()} == dict.fromkeys(pipeline.PASSOS, 'pronto')
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
