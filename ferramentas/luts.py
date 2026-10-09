"""Ferramenta do Claude: os LUTs do look do ator (docs/preprocessamento.md), gerados por nós (por isso ficam no git, em
backend/luts/). Cada look é uma transformação de cor simples, ajustada comparando os planos de ator das referências com
um bruto cru (medido em out/2026: as referências têm pretos profundos, sombras neutras/quentes em vez de azuladas e luzes
quentes; o bruto de teste, gravado de dia, tem sombras azuladas):

- **natural:** quase neutro, só um pouco de contraste;
- **casa** (o padrão): mais contraste com pretos profundos, sombras sem o azul, luzes quentes, verde e azul do fundo
  um pouco menos saturados;
- **frio:** branco mais neutro (tira o amarelo de luz quente) e contraste suave.

Sai um `.cube` 33×33×33 por look (a mesma tabela vale na prévia, como textura 3D do WebGL, e no `lut3d` do ffmpeg).

    uv run --project backend python ferramentas/luts.py
"""
from pathlib import Path

import numpy as np

SAIDA = Path(__file__).resolve().parents[1] / 'backend' / 'luts'
N = 33


def _luma(c: np.ndarray) -> np.ndarray:
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def _contraste(c: np.ndarray, forca: float, preto: float) -> np.ndarray:
    """Curva em S (mistura com o smoothstep) e o ponto de preto descido (`preto`: o que vira 0)."""
    c = np.clip((c - preto) / (1 - preto), 0, 1)
    s = c * c * (3 - 2 * c)
    return c + (s - c) * forca


def _tons(c: np.ndarray, sombras: tuple, luzes: tuple) -> np.ndarray:
    """Tinge as sombras e as luzes (somando um pouco de cor, mais forte quanto mais escuro / claro o pixel)."""
    y = _luma(c)[..., None]
    ws, wl = (1 - y) ** 2, y ** 2
    return c + ws * np.array(sombras) + wl * np.array(luzes)


def _saturacao(c: np.ndarray, geral: float, frios: float) -> np.ndarray:
    """A saturação geral e, à parte, a dos verdes, cianos e azuis (o fundo), sem mexer na pele."""
    y = _luma(c)[..., None]
    mx, mn = c.max(-1), c.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60  # matiz em graus
    peso_frio = np.clip(1 - np.abs(h - 160) / 100, 0, 1)  # 60°–260° (verde ao azul), máximo no ciano
    k = geral * (1 + (frios - 1) * peso_frio)[..., None]
    return y + (c - y) * k


LOOKS = {
    'natural': lambda c: _saturacao(_contraste(c, 0.15, 0.01), 1.0, 1.0),
    'casa': lambda c: _saturacao(_tons(_contraste(c, 0.35, 0.025), (0.016, 0.008, -0.018), (0.022, 0.008, -0.03)), 0.97, 0.82),
    'frio': lambda c: _saturacao(_tons(_contraste(c, 0.1, 0.01), (0, 0, 0.006), (-0.016, -0.004, 0.014)), 0.95, 1.0),
}


def tabela(look: str) -> np.ndarray:
    v = np.linspace(0, 1, N)
    b, g, r = np.meshgrid(v, v, v, indexing='ij')  # .cube: o vermelho varia mais rápido
    c = np.stack([r, g, b], -1)
    return np.clip(LOOKS[look](c), 0, 1)


def gravar(look: str) -> Path:
    t = tabela(look).reshape(-1, 3)
    SAIDA.mkdir(parents=True, exist_ok=True)
    arq = SAIDA / f'{look}.cube'
    linhas = [f'TITLE "harness {look}"', f'LUT_3D_SIZE {N}', 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1']
    linhas += [f'{x:.6f} {y:.6f} {z:.6f}' for x, y, z in t]
    arq.write_text('\n'.join(linhas) + '\n')
    return arq


if __name__ == '__main__':
    for nome in LOOKS:
        print(gravar(nome))
