import subprocess

import pytest
from fastapi.testclient import TestClient

from app import main, projeto


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setattr(projeto, 'RAIZ', tmp_path / 'projetos')
    return TestClient(main.app)


@pytest.fixture(scope='session')
def video(tmp_path_factory):
    """Vídeo vertical de 1 s com áudio, gerado pelo FFmpeg."""
    arq = tmp_path_factory.mktemp('midia') / 'teste.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=30:duration=1',
                    '-f', 'lavfi', '-i', 'sine=duration=1', '-shortest', str(arq)], check=True)
    return arq


def test_criar_listar_abrir(cliente, video):
    with video.open('rb') as b, video.open('rb') as a:
        r = cliente.post('/api/projetos', data={'nome': 'Melhor IA de Design', 'briefing_texto': 'foco no processo'},
                         files=[('bruto', ('meu bruto.mp4', b, 'video/mp4')), ('apoios', ('site.mp4', a, 'video/mp4'))])
    assert r.status_code == 200, r.text
    p = r.json()
    assert p['id'] == 'melhor-ia-de-design'
    bruto, apoio = p['fontes']
    assert (bruto['papel'], bruto['largura'], bruto['altura'], bruto['tem_audio']) == ('bruto', 360, 640, True)
    assert apoio['papel'] == 'apoio' and apoio['nome_original'] == 'site.mp4'
    assert p['briefing']['texto'] == 'foco no processo'

    assert [x['id'] for x in cliente.get('/api/projetos').json()] == ['melhor-ia-de-design']
    assert cliente.get('/api/projetos/melhor-ia-de-design').json() == p
    assert cliente.get(f"/api/projetos/{p['id']}/arquivos/{bruto['arquivo']}").status_code == 200


def test_nome_repetido_ganha_sufixo(cliente, video):
    for _ in range(2):
        with video.open('rb') as b:
            r = cliente.post('/api/projetos', data={'nome': 'Teste'}, files={'bruto': ('x.mp4', b, 'video/mp4')})
    assert r.json()['id'] == 'teste-2'


def test_arquivo_invalido_nao_deixa_lixo(cliente, tmp_path):
    r = cliente.post('/api/projetos', data={'nome': 'Ruim'}, files={'bruto': ('x.mp4', b'nao e video', 'video/mp4')})
    assert r.status_code == 422
    assert cliente.get('/api/projetos').json() == []


def test_nao_sai_da_pasta_do_projeto(cliente, video):
    with video.open('rb') as b:
        cliente.post('/api/projetos', data={'nome': 'A'}, files={'bruto': ('x.mp4', b, 'video/mp4')})
    assert cliente.get('/api/projetos/a/arquivos/../../etc/passwd').status_code == 404
    assert cliente.get('/api/projetos/..%2F..').status_code == 404


def _criar(cliente, video):
    with video.open('rb') as b:
        return cliente.post('/api/projetos', data={'nome': 'E'}, files={'bruto': ('x.mp4', b, 'video/mp4')}).json()


def test_editor_mock_ancora_em_palavras_existentes(cliente, video):
    _criar(cliente, video)
    e = cliente.get('/api/projetos/e/editor').json()
    ids = [p['id'] for p in e['palavras']]
    for trilha in e['timeline'].values():
        for item in trilha:
            assert ids.index(item['palavra_ini']) <= ids.index(item['palavra_fim'])
    v1 = e['timeline']['V1']
    assert all(a['fim'] <= b['inicio'] for a, b in zip(v1, v1[1:]))
    assert v1[-1]['fim'] <= 1.0  # cabe no bruto de 1 s


def test_chat_guarda_historico_por_etapa(cliente, video):
    _criar(cliente, video)
    r = cliente.post('/api/projetos/e/chat/cortes', json={'texto': 'volta a primeira tentativa'})
    assert [m['autor'] for m in r.json()] == ['rodrigo', 'agente']
    p = cliente.get('/api/projetos/e').json()
    assert len(p['chats']['cortes']) == 2 and p['chats']['inserts'] == []
    assert cliente.post('/api/projetos/e/chat/xpto', json={'texto': 'oi'}).status_code == 404


def test_miniatura_gerada_uma_vez(cliente, video):
    _criar(cliente, video)
    r = cliente.get('/api/projetos/e/miniatura')
    assert r.status_code == 200 and r.headers['content-type'] == 'image/jpeg'
    assert (projeto.RAIZ / 'e' / 'miniatura.jpg').exists()
