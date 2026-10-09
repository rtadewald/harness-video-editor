"""Legenda (SPEC §8.10; docs/legenda.md): as escolhas do projeto, o ASS e a legenda desenhada pelo libass na exportação."""
import subprocess

import numpy as np
import pytest

from apoio import criar_projeto
from app import exportacao, legenda


def test_escolhas_e_validar():
    a = legenda.do_projeto({})
    assert a == {'ligada': True, 'modo': 'palavra', 'ajustes': {}}
    n = legenda.validar({'modo': 'frase', 'ajustes': {'w00003': {'fim': 'w00005', 'texto': 'olá mundo'}, 'w00007': {'texto': ''}}}, a)
    assert n['modo'] == 'frase' and n['ajustes'] == {'w00003': {'fim': 'w00005', 'texto': 'olá mundo'}, 'w00007': {'texto': ''}}
    n = legenda.validar({'ajustes': {'w00003': None, 'w00007': {}}}, n)
    assert n['ajustes'] == {}  # null e vazio voltam ao automático
    assert legenda.validar({'limpar': True}, {**a, 'ajustes': {'w1': {'texto': 'x'}}})['ajustes'] == {}
    for ruim in ({'modo': 'karaoke'}, {'ajustes': {'../x': {}}}, {'ajustes': {'w1': 'texto'}}, {'ajustes': {'w1': {'fim': 'a b'}}}):
        with pytest.raises(ValueError):
            legenda.validar(ruim, a)


def test_rotas(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    assert cliente.get(f'/api/projetos/{pid}/legenda').json() == {'ligada': True, 'modo': 'palavra', 'ajustes': {}}
    r = cliente.put(f'/api/projetos/{pid}/legenda', json={'campos': {'ligada': False, 'ajustes': {'w00001': {'texto': 'oi'}}}}).json()
    assert r == {'ligada': False, 'modo': 'palavra', 'ajustes': {'w00001': {'texto': 'oi'}}}
    assert cliente.put(f'/api/projetos/{pid}/legenda', json={'campos': {'modo': 'x'}}).status_code == 422
    assert cliente.get(f'/api/projetos/{pid}/legenda').json()['ligada'] is False
    # dois ajustes em PUTs seguidos se somam (a mescla é feita dentro da trava, com o que está gravado)
    cliente.put(f'/api/projetos/{pid}/legenda', json={'campos': {'ajustes': {'w00002': {'fim': 'w00003'}}}})
    assert cliente.get(f'/api/projetos/{pid}/legenda').json()['ajustes'] == {'w00001': {'texto': 'oi'}, 'w00002': {'fim': 'w00003'}}
    # um pedido inválido não grava nada
    assert cliente.put(f'/api/projetos/{pid}/legenda', json={'campos': {'ligada': True, 'ajustes': {'../x': {}}}}).status_code == 422
    assert cliente.get(f'/api/projetos/{pid}/legenda').json()['ligada'] is False


def test_ass():
    s = legenda.ass([{'ini': 1.0, 'fim': 1.5, 'texto': 'olha {isso}', 'y': 0.5}, {'ini': 2, 'fim': 2, 'texto': 'nada', 'y': 0.5},
                     {'ini': 3, 'fim': 4, 'texto': ' ', 'y': 0.5}], 1080, 1920)
    assert 'PlayResX: 1080' in s and 'PlayResY: 1920' in s and ',SF Pro Display,66,' in s
    eventos = [l for l in s.splitlines() if l.startswith('Dialogue:')]
    assert len(eventos) == 2  # a sombra e o texto; os blocos vazios ou sem duração saem
    assert eventos[0].startswith('Dialogue: 0,0:00:01.00,0:00:01.50,Sombra') and '\\pos(540,963)\\blur6.0\\fsp-0.13}' in eventos[0]
    assert eventos[1].startswith('Dialogue: 1,0:00:01.00,0:00:01.50,Legenda') and eventos[1].endswith('{\\pos(540,960)\\fsp-0.13}olha (isso)')
    assert legenda.escrever(None, 1080, 1920, None) is None and legenda.escrever({'blocos': []}, 1080, 1920, None) is None
    # em 4K tudo escala com a altura: o tamanho, o deslocamento, o espalhamento da sombra e o espaço entre as letras
    s4 = legenda.ass([{'ini': 1.0, 'fim': 1.5, 'texto': 'olha', 'y': 0.5}], 2160, 3840)
    assert ',SF Pro Display,132,' in s4 and '\\pos(1080,1926)\\blur12.0\\fsp-0.26}' in s4
    # o caminho escapado nos dois níveis do ffmpeg, sem aspas
    assert legenda.filtro("/a b/c:d's, [e];.ass") == r"ass=filename=/a b/c\\:d\\\'s\, \[e\]\;.ass"


def test_exportacao_com_legenda(tmp_path):
    """O texto aparece branco no meio do quadro só enquanto o bloco dura, com o ASS numa pasta cujo nome tem o que o
    nome de uma exportação pode ter (espaço, apóstrofo, vírgula, colchetes, dois-pontos); sem legenda, nada de `ass`."""
    video = tmp_path / 'cinza.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=24:d=2', '-f', 'lavfi', '-i', 'sine=d=2',
                    '-shortest', '-pix_fmt', 'yuv420p', str(video)], check=True)
    args = (video, [{'inicio': 0.0, 'fim': 2.0}], False, 0.5, 360, 640, 24, [], [], 'h264', 2.0)
    pasta = tmp_path / "Rodrigo's vídeo, [1]; 10:00 · 1080p.parte.camadas"
    pasta.mkdir()
    arq = legenda.escrever({'blocos': [{'ini': 0.5, 'fim': 1.5, 'texto': 'legenda', 'y': 0.5}]}, 360, 640, pasta / 'legenda.ass')
    assert 'ass=' not in ' '.join(exportacao.comando_final(*args, tmp_path / 'sem.mp4'))
    assert 'ass=' not in ' '.join(exportacao.comando_final(*args, tmp_path / 'sem.mp4', legenda={'arquivo': None}))
    cmd = exportacao.comando_final(*args, tmp_path / 'com.mp4', legenda={'arquivo': arq})
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]

    def quadro(t):
        o = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', str(tmp_path / 'com.mp4'), '-frames:v', '1', '-f', 'rawvideo',
                            '-pix_fmt', 'gray', '-'], capture_output=True, check=True)
        return np.frombuffer(o.stdout, np.uint8).reshape(640, 360).astype(float)
    meio = (slice(300, 340), slice(100, 260))
    assert quadro(1.0)[meio].max() > 240 and quadro(0.2)[meio].max() < 140 and quadro(1.8)[meio].max() < 140
