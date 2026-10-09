"""Exportação por camadas (SPEC §13): o comando do ffmpeg montado pelas funções de cada camada é exatamente o de antes
da separação (congelado em `dados/exportacao_comandos.json`, gerado com a versão anterior de `comando_final`), e os
ganchos das camadas futuras (transições, legenda) ainda não mudam nada."""
import json
from pathlib import Path

import pytest

from app import exportacao, sons

ESPERADO = Path(__file__).parent / 'dados' / 'exportacao_comandos.json'


def casos(raiz: Path) -> dict[str, tuple[tuple, dict]]:
    """Entradas variadas de `comando_final`: vertical e horizontal, telas divididas (metade e "insert atrás"), máscara,
    clipes de inserts e sons (repetidos, com trecho, duração e velocidade)."""
    bruto, mascara, saida = raiz / 'midia' / 'bruto.mov', raiz / 'midia' / 'mascara.mp4', raiz / 'exports' / 'final.parte.mp4'
    clipes = [{'inicio': 0.2, 'fim': 1.35}, {'inicio': 2.1, 'fim': 4.0}, {'inicio': 5.25, 'fim': 7.5}]
    duracao = sum(c['fim'] - c['inicio'] for c in clipes)
    camadas = [(raiz / 'camadas' / '000.mov', 0.5), (raiz / 'camadas' / '001.mov', 2.25)]
    eventos = [{'som': 'clique', 't': 0.5, 'ganho': 0.25, 'desde': 0}, {'som': 'clique', 't': 2.0, 'ganho': 0.5, 'desde': 0},
               {'som': 'ding', 't': 1.2, 'ganho': 0.3, 'desde': 0.1, 'dur': 0.4, 'vel': 1.25}, {'som': 'nao-existe', 't': 1}]
    metade = [(0.5, 1.4, {'modo': 'metade', 'f': 0.5}), (2.25, 3.0, {'modo': 'metade', 'f': 0.56})]
    atras = [(3.1, 4.2, {'modo': 'atras', 'f': 0.5})]
    return {
        'vertical_simples': ((bruto, clipes, False, 0.5, 1080, 1920, 24, [], [], 'hevc', duracao, saida), {}),
        'horizontal_com_inserts': ((bruto, clipes, True, 0.37, 2160, 3840, 30, metade, camadas, 'h264', duracao, saida), {}),
        'mascara_sem_atras': ((bruto, clipes, False, 0.5, 720, 1280, 60, metade, camadas[:1], 'hevc', duracao, saida), {'mascara': mascara}),
        'atras_mascara_e_sons': ((bruto, clipes, False, 0.5, 1080, 1920, 24, metade + atras, camadas, 'hevc', duracao, saida),
                                 {'mascara': mascara, 'eventos_som': eventos}),
        'atras_sem_mascara': ((bruto, clipes, False, 0.5, 1080, 1920, 24, atras, [], 'h264', duracao, saida), {'eventos_som': eventos[:1]}),
    }


def biblioteca_falsa(raiz: Path) -> None:
    """Só a existência dos arquivos importa para montar o comando."""
    raiz.mkdir(parents=True, exist_ok=True)
    for sid in ('clique', 'ding'):
        (raiz / f'{sid}.m4a').write_bytes(b'')


def comandos(comando_final, raiz: Path) -> dict[str, list[str]]:
    """Os comandos de cada caso, com a pasta temporária trocada por `<raiz>` (para comparar entre execuções)."""
    return {nome: [x.replace(str(raiz), '<raiz>') for x in comando_final(*args, **kw)] for nome, (args, kw) in casos(raiz).items()}


def test_comando_por_camadas_e_identico_ao_de_antes(tmp_path):
    biblioteca_falsa(sons.RAIZ)
    esperado = json.loads(ESPERADO.read_text())
    atual = comandos(exportacao.comando_final, tmp_path)
    assert set(atual) == set(esperado)
    for nome in esperado:
        assert atual[nome] == esperado[nome], nome


@pytest.mark.parametrize('transicoes, legenda', [([{'t': 1.0, 'id': 'x'}], {'blocos': [{'texto': 'oi'}]}), ([], None)])
def test_ganchos_de_transicoes_e_legenda_ainda_sem_efeito(tmp_path, transicoes, legenda):
    """Os campos `transicoes` e `legenda` do `__render` já chegam ao comando; até a P2 e a P4, não mudam nada."""
    biblioteca_falsa(sons.RAIZ)
    for args, kw in casos(tmp_path).values():
        assert exportacao.comando_final(*args, **kw, transicoes=transicoes, legenda=legenda) == exportacao.comando_final(*args, **kw)


def test_cada_camada_na_sua_funcao(tmp_path):
    """A ordem do contrato: inserts sobre a base do ator, a pós-montagem termina no formato de saída, o áudio sem sons só
    renomeia a voz."""
    ent, f = exportacao._inserts([(tmp_path / 'a.mov', 1.5)], 2, 'base', 'topo_in')
    assert ent == ['-i', str(tmp_path / 'a.mov')] and f[-1] == '[o0]null[topo_in]' and f[0].startswith('[2:v]setpts')
    assert exportacao._inserts([], 1, 'base', 'topo_in') == ([], ['[base]null[topo_in]'])
    assert exportacao._pos_montagem(None, None, 'topo', 'v') == ['[topo]format=yuv420p[v]']
    assert exportacao._audio(None, 3, 'ac', 'am') == ([], ['[ac]anull[am]'])
