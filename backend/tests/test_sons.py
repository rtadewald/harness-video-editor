"""Sons de apoio (SPEC §8.6): a biblioteca, os momentos de som nos presets, a mistura com a voz e o nível da voz."""
import json
import subprocess

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main, motions, presets, projeto, sons


def _tom(arq, freq=2000, dur=0.08, vol=0.5, taxa=48000):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'sine=frequency={freq}:duration={dur}:sample_rate={taxa}',
                    '-af', f'volume={vol}', '-c:a', 'aac', str(arq)], check=True)


@pytest.fixture
def biblioteca():
    """Uma biblioteca de mentira: um clique curto (2 kHz) e um ding (1 kHz), com o catálogo."""
    sons.RAIZ.mkdir(parents=True)
    _tom(sons.RAIZ / 'clique.m4a')
    _tom(sons.RAIZ / 'ding.m4a', freq=1000, dur=0.3)
    (sons.RAIZ / 'catalogo.json').write_text(json.dumps([
        {'id': 'clique', 'nome': 'Clique', 'familia': 'Clique', 'duracao': 0.08, 'ataque': 0.0},
        {'id': 'ding', 'nome': 'Ding', 'familia': 'Ding', 'duracao': 0.3, 'ataque': 0.05}]))
    return sons.RAIZ


def _audio(arq, taxa=8000) -> np.ndarray:
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-vn', '-ac', '1', '-ar', str(taxa), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32)


def test_momentos_de_som_validados_na_receita():
    v = sons.validar([
        {'momento': 'entrada', 'som': 'ui-pop-02', 'intensidade': 'medio', 'atraso': 0.1},
        {'momento': 'entrada', 'som': 'outro'},  # repetido: fica o primeiro
        {'momento': 'voar', 'som': 'x'},  # momento que não existe
        {'momento': 'saida', 'som': '../../etc/passwd', 'intensidade': 'altissimo', 'atraso': 99},
    ])
    assert v == [{'momento': 'entrada', 'som': 'ui-pop-02', 'intensidade': 'medio', 'atraso': 0.1},
                 {'momento': 'saida', 'som': None, 'intensidade': 'baixo', 'atraso': 3.0}]
    assert sons.validar('nada') == []
    r = presets.validar_receita({'formato': 'vertical', 'cards': [{'repouso': {}}], 'sons': [{'momento': 'troca', 'som': 'click-classic-01'}]})
    assert r['sons'] == [{'momento': 'troca', 'som': 'click-classic-01', 'intensidade': 'baixo', 'atraso': 0.0}]
    assert 'sons' not in presets.validar_receita({'formato': 'vertical', 'cards': [{'repouso': {}}]})


def test_catalogo_e_arquivos_pela_api(biblioteca):
    c = TestClient(main.app)
    r = c.get('/api/sons').json()
    assert [s['id'] for s in r['sons']] == ['clique', 'ding'] and r['intensidades'] == sons.INTENSIDADES
    assert c.get('/api/sons/clique.m4a').status_code == 200
    assert c.get('/api/sons/nao-existe.m4a').status_code == 404
    assert c.get('/api/sons/..%2Fcatalogo.m4a').status_code == 404


def test_sem_biblioteca_o_catalogo_vem_vazio():
    assert sons.catalogo() == []
    assert sons.filtro_mistura([{'som': 'clique', 't': 1}], 1, 'ac', 'am') == ([], ['[ac]anull[am]'])


def test_mistura_poe_cada_som_no_seu_instante_por_cima_da_voz(biblioteca, tmp_path):
    """Dois cliques e um ding sobre 3 s de silêncio: o som aparece só nos instantes pedidos, no volume pedido, e um
    arquivo de entrada por som (o clique repetido abre o arquivo uma vez)."""
    eventos = [{'som': 'clique', 't': 0.5, 'ganho': 1.0, 'desde': 0}, {'som': 'clique', 't': 2.0, 'ganho': 0.25, 'desde': 0},
               {'som': 'ding', 't': 1.2, 'ganho': 1.0, 'desde': 0.1, 'dur': 0.1}, {'som': 'nao-existe', 't': 1, 'ganho': 1}]
    entradas, filtros = sons.filtro_mistura(eventos, 1, 'ac', 'am')
    assert entradas.count('-i') == 2
    saida = tmp_path / 'mix.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=3', *entradas,
                    '-filter_complex', ';'.join(['[0:a]anull[ac]', *filtros]), '-map', '[am]', str(saida)], check=True)
    a = np.abs(_audio(saida))
    janela = lambda t0, t1: float(a[int(t0 * 8000):int(t1 * 8000)].max())  # noqa: E731
    assert janela(0.0, 0.45) < 1e-3 and janela(0.62, 1.15) < 1e-3 and janela(1.35, 1.95) < 1e-3  # silêncio fora dos sons
    pico = float(np.abs(_audio(biblioteca / 'clique.m4a')).max())  # o clique sozinho
    assert janela(0.48, 0.6) == pytest.approx(pico, rel=0.15)  # o 1º clique, no volume cheio
    assert janela(1.98, 2.1) == pytest.approx(pico / 4, rel=0.15)  # o 2º, a 1/4
    assert janela(1.18, 1.32) > pico / 2 and janela(1.32, 1.36) < 1e-3  # o ding, cortado em 0,1 s
    assert len(a) == 3 * 8000  # a duração é a da voz


def test_exportacao_mistura_os_sons_com_o_audio_do_bruto(biblioteca, video, tmp_path):
    from app import exportacao
    clipes = [{'inicio': 0.0, 'fim': 1.0}]
    saida = tmp_path / 'final.mp4'
    cmd = exportacao.comando_final(video, clipes, False, 0.5, 180, 320, 24, [], [], 'h264', 1.0, saida,
                                   eventos_som=[{'som': 'clique', 't': 0.5, 'ganho': 0.5, 'desde': 0}])
    assert '[am]' in cmd and 'amix' in ';'.join(cmd)
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    assert abs(len(_audio(saida)) / 8000 - 1.0) < 0.05
    # sem sons, a voz sai como estava
    assert 'amix' not in ';'.join(exportacao.comando_final(video, clipes, False, 0.5, 180, 320, 24, [], [], 'h264', 1.0, saida))


def test_nivel_da_voz_e_o_fator_dos_sons(tmp_path):
    arq = tmp_path / 'voz.wav'
    # um tom de amplitude 0,2 × 1/8 (o padrão do sine): o "nível da fala" é a energia dele
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-af', 'volume=0.2', str(arq)], check=True)
    assert abs(sons.nivel_da_voz(arq) - 20 * np.log10(0.2 / 8 / np.sqrt(2))) < 0.5
    assert sons.fator_da_voz(sons.VOZ_REF) == 1.0 and sons.fator_da_voz(None) == 1.0
    assert sons.fator_da_voz(sons.VOZ_REF - 20) == pytest.approx(0.1)  # voz 20 dB mais baixa: os sons descem junto
    assert sons.fator_da_voz(-200) == 0.1 and sons.fator_da_voz(40) == 3.0  # nos limites


def test_fator_do_projeto_medido_uma_vez(cliente, video, monkeypatch):
    from tests.test_projetos import _criar
    id = _criar(cliente, video)['id']
    medidas = []
    real = sons.nivel_da_voz
    monkeypatch.setattr(sons, 'nivel_da_voz', lambda a, ate=180: medidas.append(a) or real(a, ate))
    f = cliente.get(f'/api/projetos/{id}/sons/fator').json()['fator']
    assert 0.1 <= f <= 3 and cliente.get(f'/api/projetos/{id}/sons/fator').json()['fator'] == f
    assert len(medidas) == 1 and projeto.ler(id)['nivel_voz']['db'] < 0


def test_presets_de_motion_declaram_os_sons_e_o_plano_troca(cliente, video):
    from tests.test_projetos import _criar
    lista = {p['id']: p for p in motions.listar_presets()}
    assert lista['claude-code']['sons']['digitacao'] == {'rotulo': 'Digitação', 'som': 'typing-keyboard-01', 'intensidade': 'baixo'}
    assert set(lista['lettering']['sons']) == {'palavra', 'destaque'}
    # cada momento declarado é marcado na página (motion.som)
    for pid, p in lista.items():
        html = motions.html_do_preset(pid)
        assert all(f"'{k}'" in html for k in p['sons']), pid
    id = _criar(cliente, video)['id']
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': [{'id': 'p1', 'camada': 'plano', 'tipo': 'motion_tela_cheia', 'inicio': 0, 'fim': 2}]}))
    assert cliente.put(f'/api/projetos/{id}/motions/p1', json={'tipo': 'preset', 'formato': 'vertical', 'preset': 'claude-code'}).status_code == 200
    r = cliente.patch(f'/api/projetos/{id}/motions/p1', json={'sons': {'digitacao': {'som': None}, 'entrada': {'som': 'ui-pop-03', 'intensidade': 'medio'},
                                                                          'inventado': {'som': 'x'}}}).json()
    assert r['sons'] == {'digitacao': {'som': None, 'intensidade': 'baixo'}, 'entrada': {'som': 'ui-pop-03', 'intensidade': 'medio'}}


def test_som_esticado_para_abranger_um_movimento(biblioteca, tmp_path):
    """Um som com `vel` (o mergulho: o som estica ou encolhe para ir do começo ao fim do zoom) dura o arquivo ÷ vel, a
    partir de `desde` (no tempo do arquivo), como no navegador (playbackRate)."""
    _tom(biblioteca / 'longo.m4a', freq=3000, dur=1.0)
    for vel, desde, esperado in ((0.8, 0, 1.25), (1.6, 0, 0.625), (1.0, 0.4, 0.6)):
        entradas, filtros = sons.filtro_mistura([{'som': 'longo', 't': 0.5, 'ganho': 1.0, 'desde': desde, 'vel': vel}], 1, 'ac', 'am')
        saida = tmp_path / f'v{vel}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=3', *entradas,
                        '-filter_complex', ';'.join(['[0:a]anull[ac]', *filtros]), '-map', '[am]', str(saida)], check=True)
        a = np.abs(_audio(saida))
        soando = np.nonzero(a > a.max() * 0.3)[0] / 8000
        assert soando[0] == pytest.approx(0.5, abs=0.03) and soando[-1] - soando[0] == pytest.approx(esperado, abs=0.05), (vel, desde)
