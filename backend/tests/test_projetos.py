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
