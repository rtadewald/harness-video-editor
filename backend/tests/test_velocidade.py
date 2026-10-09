"""A aceleração do ator (out/2026): o tempo da saída, a rota e o ffmpeg cortando e acelerando o ator e a voz."""
import json
import subprocess

import pytest

from apoio import criar_projeto
from app import direcao_projeto, exportacao, projeto


def test_tempo_da_saida_acelerado():
    p = {'velocidade': 1.25, 'timeline': {'V1': [{'id': 'c2', 'inicio': 5.0, 'fim': 7.5}, {'id': 'c1', 'inicio': 0.0, 'fim': 2.5}]}}
    v1 = projeto.v1_tocada(p)
    assert [c['id'] for c in v1] == ['c1', 'c2'] and all(c['vel'] == 1.25 for c in v1)
    assert direcao_projeto.duracao_saida(v1) == 4.0  # 5 s do bruto a 1,25×
    w = direcao_projeto.palavras_na_saida([{'id': 'w1', 'inicio': 5.5, 'fim': 6.0}], v1)[0]
    assert (w['saida_ini'], w['saida_fim']) == (2.4, 2.8)  # 2 s do 1º clipe + 0,5 s / 1,25
    assert projeto.velocidade({}) == 1.0 and projeto.velocidade({'velocidade': 9}) == 1.5 and projeto.velocidade({'velocidade': 'x'}) == 1.0


def test_rota(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    assert cliente.put(f'/api/projetos/{pid}/velocidade', json={'campos': {'velocidade': 1.2}}).json() == {'velocidade': 1.2}
    assert projeto.velocidade(projeto.ler(pid)) == 1.2
    for ruim in (0.9, 1.6, 'rápido', None):
        assert cliente.put(f'/api/projetos/{pid}/velocidade', json={'campos': {'velocidade': ruim}}).status_code == 422


def _duracoes(arq):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', str(arq)], capture_output=True, text=True, check=True)
    return {s['codec_type']: float(s['duration']) for s in json.loads(r.stdout)['streams']}


@pytest.mark.parametrize('vel', [1.0, 1.5])
def test_exportacao_acelera_o_ator_e_a_voz(tmp_path, vel):
    bruto = tmp_path / 'b.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=6', '-f', 'lavfi', '-i', 'sine=f=440:d=6',
                    '-shortest', '-pix_fmt', 'yuv420p', str(bruto)], check=True)
    clipes = [{'inicio': 0.0, 'fim': 2.0, 'vel': vel}, {'inicio': 3.0, 'fim': 6.0, 'vel': vel}]
    duracao = sum(projeto.dur_saida(c) for c in clipes)
    saida = tmp_path / 'o.mp4'
    r = subprocess.run(exportacao.comando_final(bruto, clipes, False, 0.5, 180, 320, 24, [], [], 'h264', duracao, saida), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-500:]
    d = _duracoes(saida)
    assert d['video'] == pytest.approx(5 / vel, abs=0.1) and d['audio'] == pytest.approx(5 / vel, abs=0.1)


def test_voz_da_mistura_acelerada(tmp_path):
    """A voz da P3 (a limpa ou a do bruto) é cortada e acelerada como o ator: 3 s a 1,5× viram 2 s."""
    from app import audio
    voz = tmp_path / 'v.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=300:d=3', '-ac', '1', str(voz)], check=True)
    a = {'voz': voz, 'voz_lufs': -20.0, 'timbre': 'natural', 'niveis': dict.fromkeys(audio.TRILHAS, 0.0), 'fundo': None, 'fundo_mudo': False,
         'falas': [], 'ducking_db': 3}
    entradas, f = audio.filtros(a, [{'inicio': 0.0, 'fim': 3.0, 'vel': 1.5}], [], 0, 'fim', 2.0, {'ganho': 0.0})
    assert any('atempo=1.5000' in x for x in f)
    saida = tmp_path / 'o.wav'
    subprocess.run(['ffmpeg', '-v', 'error', *entradas, '-filter_complex', ';'.join(f), '-map', '[fim]', str(saida)], check=True)
    assert _duracoes(saida)['audio'] == pytest.approx(2.0, abs=0.05)
