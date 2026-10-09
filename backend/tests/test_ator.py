"""O ator nas áreas que sobram (P5; docs/rosto.md): a geometria de cada trecho dividido aplicada pelo ffmpeg — a tela
dividida enquadrada pelo rosto, a janela, o canto e o recortado — e o ajuste do ator salvo no insert."""
import subprocess
import sys

import numpy as np
import pytest

from apoio import criar_projeto
from app import exportacao, inserts

W, H = 180, 320


def _video(arq, filtro='testsrc2'):
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'{filtro}=s={W}x{H}:r=24:d=3', '-f', 'lavfi', '-i', 'sine=d=3',
                    '-shortest', '-pix_fmt', 'yuv420p', str(arq)], check=True)


def _quadro(arq, t):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', str(arq), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(H, W, 3).astype(float)


@pytest.fixture(scope='module')
def videos(tmp_path_factory):
    p = tmp_path_factory.mktemp('ator')
    _video(p / 'v.mp4')
    # a máscara da pessoa: um retângulo branco no meio
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r=24:d=3', '-vf',
                    f"drawbox=x={W // 4}:y={H // 4}:w={W // 2}:h={H // 2}:color=white:t=fill", '-pix_fmt', 'yuv420p', str(p / 'm.mp4')], check=True)
    return p


@pytest.mark.parametrize('modo', ['metade', 'janela', 'canto', 'recortado'])
def test_geometria_no_ffmpeg(videos, tmp_path, modo):
    """Dentro do trecho (1 a 2 s) o quadro muda onde o ator foi posto; fora dele, o ator como foi gravado."""
    g = {'metade': {'modo': 'metade', 's': 1.3, 'tx': -0.15, 'ty': 0.3},
         'janela': {'modo': 'janela', 's': 0.55, 'tx': 0.225, 'ty': 0.45, 'topo': 0.49, 'raio': 0.07},
         'canto': {'modo': 'canto', 's': 0.34, 'tx': 0.62, 'ty': 0.63, 'raio': 0.07},
         'recortado': {'modo': 'recortado', 's': 0.6, 'tx': 0.2, 'ty': 0.4}}[modo]
    d = {'modo': 'metade' if modo == 'metade' else 'atras', 'tipo': 'area', 'f': 0.5 if modo == 'metade' else 1, 'ator': g}
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    saida = tmp_path / 'o.mp4'
    cmd = exportacao.comando_final(videos / 'v.mp4', clipes, False, 0.5, W, H, 24, [(1.0, 2.0, d)], [], 'h264', 3.0, saida,
                                   mascara=videos / 'm.mp4' if modo in ('janela', 'recortado') else None)
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    sem = tmp_path / 's.mp4'
    subprocess.run(exportacao.comando_final(videos / 'v.mp4', clipes, False, 0.5, W, H, 24, [], [], 'h264', 3.0, sem), check=True, capture_output=True)
    # a caixa do ator: muda dentro do trecho, igual fora dele
    y0, y1 = int((g['ty'] + 0.1 * g['s']) * H), int(min(g['ty'] + 0.9 * g['s'], 1) * H)
    x0, x1 = int(max(g['tx'] + 0.2 * g['s'], 0) * W), int(min(g['tx'] + 0.8 * g['s'], 1) * W)
    regiao = (slice(max(y0, 0), y1), slice(x0, x1))
    assert np.abs(_quadro(saida, 1.5)[regiao] - _quadro(sem, 1.5)[regiao]).mean() > 15
    assert np.abs(_quadro(saida, 0.4)[regiao] - _quadro(sem, 0.4)[regiao]).mean() < 3
    assert np.abs(_quadro(saida, 2.6)[regiao] - _quadro(sem, 2.6)[regiao]).mean() < 3


def test_sem_mascara_o_recortado_vira_o_ator_no_canto(videos, tmp_path):
    d = {'modo': 'atras', 'tipo': 'area', 'f': 1, 'ator': {'modo': 'recortado', 's': 0.6, 'tx': 0.2, 'ty': 0.4}}
    cmd = exportacao.comando_final(videos / 'v.mp4', [{'inicio': 0.0, 'fim': 3.0}], False, 0.5, W, H, 24, [(1.0, 2.0, d)], [], 'h264', 3.0, tmp_path / 'o.mp4')
    fc = cmd[cmd.index('-filter_complex') + 1]
    assert '[masc]' not in fc and 'alphamerge' in fc
    assert subprocess.run(cmd, capture_output=True).returncode == 0


def test_validar_ator():
    v = inserts._validar_ator
    assert v(None) is None and v({}) is None
    assert v({'modo': 'canto', 'x': 1.4, 'escala': 0.05, 'dy': None}) == {'modo': 'canto', 'x': 1.0, 'escala': 0.15}
    assert v({'zoom': 3, 'dx': -0.9}) == {'zoom': 1.6, 'dx': -0.5}
    assert v({'zoom': 0.8}) == {'zoom': 0.8} and v({'zoom': 0.1}) == {'zoom': 0.625}  # menos que o automático, até 1/1,6
    for ruim in ({'modo': 'gigante'}, {'x': 'meio'}, {'cor': 1}, 'janela', {'zoom': True}):
        with pytest.raises(ValueError):
            v(ruim)


def _pico_de_memoria(cmd):
    """O pico de memória (RSS) de um comando, num processo só para ele (a unidade muda com o sistema; só a razão importa)."""
    medir = 'import resource, subprocess, sys; r = subprocess.run(sys.argv[1:], capture_output=True); ' \
            'print(r.returncode, resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss)'
    rc, pico = subprocess.run([sys.executable, '-c', medir, *cmd], capture_output=True, text=True, check=True).stdout.split()
    assert rc == '0'
    return int(pico)


@pytest.mark.parametrize('modo', ['canto', 'janela'])
def test_insert_tardio_nao_guarda_o_ator_na_memoria(tmp_path, modo):
    """Um insert por cima do ator perto do fim não faz o ffmpeg guardar todos os quadros do ator até ele (a memória
    crescia com o instante do insert: ~1,4 GB num insert aos 30 s de um 720p)."""
    v, m = tmp_path / 'v.mp4', tmp_path / 'm.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=24:d=30', '-f', 'lavfi', '-i', 'sine=d=30',
                    '-shortest', '-pix_fmt', 'yuv420p', str(v)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=360x640:r=24:d=30', '-pix_fmt', 'yuv420p', str(m)], check=True)
    g = {'canto': {'modo': 'canto', 's': 0.34, 'tx': 0.62, 'ty': 0.63, 'raio': 0.07},
         'janela': {'modo': 'janela', 's': 0.55, 'tx': 0.225, 'ty': 0.45, 'topo': 0.49, 'raio': 0.07}}[modo]
    d = {'modo': 'atras', 'tipo': 'area', 'f': 1, 'ator': g}

    def pico(a):
        return _pico_de_memoria(exportacao.comando_final(v, [{'inicio': 0.0, 'fim': 30.0}], False, 0.5, 360, 640, 24, [(a, a + 1, d)], [],
                                                         'h264', 30.0, tmp_path / 'o.mp4', mascara=m))
    cedo, tarde = pico(1.0), pico(27.0)
    # 26 s de quadros 360×640 guardados seriam ~200 MB a mais
    assert tarde < cedo * 1.25, (cedo, tarde)


def _media_central(arq, t):
    """O brilho médio do miolo do quadro (um zoom no centro de testsrc2 muda o miolo)."""
    q = _quadro(arq, t)
    return q[H // 3: 2 * H // 3, W // 3: 2 * W // 3]


@pytest.mark.parametrize('tipo', ['zoom_seco', 'zoom_lento'])
def test_presets_do_full_ator_no_ffmpeg(videos, tmp_path, tipo):
    """O zoom no ator só dentro do plano (1 a 2,6 s), com o centro no rosto; fora dele, o ator como foi gravado. O seco é
    o mesmo em todo o plano; o lento cresce ao longo dele."""
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    mov = [{'ini': 1.0, 'fim': 2.6, 'tipo': tipo, 'cx': 0.5, 'cy': 0.45}]
    com, sem = tmp_path / 'c.mp4', tmp_path / 's.mp4'
    r = subprocess.run(exportacao.comando_final(videos / 'v.mp4', clipes, False, 0.5, W, H, 24, [], [], 'h264', 3.0, com, movimentos=mov), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    subprocess.run(exportacao.comando_final(videos / 'v.mp4', clipes, False, 0.5, W, H, 24, [], [], 'h264', 3.0, sem), check=True, capture_output=True)
    dif = lambda t: np.abs(_media_central(com, t) - _media_central(sem, t)).mean()
    assert dif(0.5) < 3 and dif(2.85) < 3  # fora do plano: igual
    assert dif(2.4) > 8  # dentro: mexeu
    if tipo == 'zoom_lento':
        assert dif(1.1) < dif(2.4)  # começa quase sem zoom e vai aproximando


def test_rota_do_movimento_do_ator(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    r = cliente.put(f'/api/projetos/{pid}/inserts/ator/p3', json={'movimento': 'zoom_lento'})
    assert r.status_code == 200 and r.json()['ator_planos'] == {'p3': 'zoom_lento'}
    assert cliente.put(f'/api/projetos/{pid}/inserts/ator/p3', json={'movimento': None}).json()['ator_planos'] == {}
    assert cliente.put(f'/api/projetos/{pid}/inserts/ator/p3', json={'movimento': 'girar'}).status_code == 422
    assert exportacao._movimentos([], W, H, 'a', 'b') == '[a]null[b]'
