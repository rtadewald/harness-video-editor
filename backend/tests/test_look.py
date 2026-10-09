"""O look do ator (docs/preprocessamento.md): LUTs, vinheta, a rota e a exportação com o look."""
import subprocess

import numpy as np
import pytest

from app import exportacao, look


def _quadro(arq, t=0.5, w=180, h=320):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', str(arq), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3).astype(float)


def test_validar_e_padrao():
    assert look.do_projeto({}) == look.PADRAO
    assert look.do_projeto({'look': {'vinheta': 'forte'}})['vinheta'] == 'forte'
    assert look.validar({'lut': None, 'intensidade': 7, 'vinheta': 'leve'}) == {'lut': None, 'intensidade': 1, 'vinheta': 'leve'}
    for errado in ({'lut': 'sepia'}, {'vinheta': 'enorme'}, {'intensidade': 'muito'}):
        with pytest.raises((ValueError, TypeError)):
            look.validar(errado)
    assert not look.ativo({'lut': None, 'intensidade': 1, 'vinheta': 'sem'})
    assert look.ativo({'lut': None, 'intensidade': 1, 'vinheta': 'leve'}) and look.ativo({'lut': 'casa', 'intensidade': 0.5, 'vinheta': 'sem'})
    assert all(look.arquivo_lut(k).exists() for k in look.NOMES)  # os .cube estão no git


def test_vinheta_centro_e_bordas(tmp_path):
    assert look.fator_vinheta(0.5, look.FORMA['cy'], 0.4) == 1
    assert 0.6 <= look.fator_vinheta(0, 0, 0.4) < 0.7  # o canto escurece perto de 1 − força
    assert look.fator_vinheta(0.5, 0.95, 0.4) > look.fator_vinheta(0, 0, 0.4)  # o meio da borda menos que o canto
    m = __import__('cv2').imread(str(look.mascara_vinheta(90, 160, 0.4, tmp_path / 'm.png')), -1) / 65535
    assert m.shape == (160, 90)
    for x, y in ((45, 72), (0, 0), (89, 159), (10, 80)):
        assert m[y, x] == pytest.approx(look.fator_vinheta((x + 0.5) / 90, (y + 0.5) / 160, 0.4), abs=1e-3)


def test_rota_do_look(cliente, video):
    from tests.test_projetos import _criar
    id = _criar(cliente, video)['id']
    assert cliente.get(f'/api/projetos/{id}/look').json() == look.PADRAO
    assert cliente.put(f'/api/projetos/{id}/look', json={'campos': {'vinheta': 'forte', 'intensidade': 0.5}}).json() == {'lut': 'casa', 'intensidade': 0.5, 'vinheta': 'forte'}
    assert cliente.put(f'/api/projetos/{id}/look', json={'campos': {'lut': 'xpto'}}).status_code == 422
    assert cliente.get('/api/look').json()['vinhetas']['forte'] == look.VINHETAS['forte']
    assert cliente.get('/api/look/casa.cube').text.startswith('TITLE')
    assert cliente.get('/api/look/nada.cube').status_code == 404


def test_exportacao_com_look(tmp_path):
    """Com o look, os cantos escurecem na proporção da vinheta e o LUT muda a cor; sem look, o comando é o de antes."""
    video = tmp_path / 'cinza.mp4'  # cinza liso: o canto e o centro partem do mesmo valor
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=d=2',
                    '-shortest', '-pix_fmt', 'yuv420p', str(video)], check=True)
    clipes = [{'inicio': 0.0, 'fim': 1.0}]
    args = (video, clipes, False, 0.5, 180, 320, 24, [], [], 'h264', 1.0)
    sem = tmp_path / 'sem.mp4'
    assert exportacao.comando_final(*args, sem, look=None) == exportacao.comando_final(*args, sem)
    subprocess.run(exportacao.comando_final(*args, sem), check=True, capture_output=True)
    lk = {'lut': None, 'intensidade': 1, 'vinheta': 'forte'}
    so_vinheta = tmp_path / 'vinheta.mp4'
    r = subprocess.run(exportacao.comando_final(*args, so_vinheta, look=lk, mascara_vinheta=look.mascara_vinheta(180, 320, 0.55, tmp_path / 'm.png')),
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    a, b = _quadro(sem), _quadro(so_vinheta)
    centro = (slice(140, 150), slice(85, 95))
    canto = (slice(2, 12), slice(2, 12))
    assert b[centro].mean() == pytest.approx(a[centro].mean(), abs=4)  # o centro não muda
    assert b[canto].mean() / a[canto].mean() == pytest.approx(look.fator_vinheta(7 / 180, 7 / 320, 0.55), abs=0.08)
    # o LUT, num vídeo colorido (num cinza liso ele quase não muda nada): inteiro e com um quarto da intensidade (um valor
    # assimétrico: com 0,5, uma mistura invertida passaria despercebida)
    cor = tmp_path / 'cor.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=d=2',
                    '-shortest', '-pix_fmt', 'yuv420p', str(cor)], check=True)
    args = (cor, *args[1:])
    q = {}
    for nome, lk in (('sem', None), ('lut', {'lut': 'casa', 'intensidade': 1, 'vinheta': 'sem'}), ('quarto', {'lut': 'casa', 'intensidade': 0.25, 'vinheta': 'sem'})):
        r = subprocess.run(exportacao.comando_final(*args, tmp_path / f'{nome}.mp4', look=lk), capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[-400:]
        q[nome] = _quadro(tmp_path / f'{nome}.mp4')
    inteiro, quarto = np.abs(q['lut'] - q['sem']).mean(), np.abs(q['quarto'] - q['sem']).mean()
    assert inteiro > 3  # o LUT mudou a cor
    assert 0.15 < quarto / inteiro < 0.5  # perto de um quarto (o ruído da compressão soma um pouco); invertido daria ~0,75
