"""Ajusta uma cubic-bezier (CSS) a pontos medidos nos quadros (t 0..1, progresso 0..1), por busca em grade.

    uv run --project backend python ferramentas/preset_curva.py '{"t": [0, 0.1, ...], "p": [0, 0.3, ...]}'"""
import sys, json, itertools
import numpy as np
def by(x1, y1, x2, y2, t):
    s = np.linspace(0, 1, 400)
    X = 3*(1-s)**2*s*x1 + 3*(1-s)*s**2*x2 + s**3
    Y = 3*(1-s)**2*s*y1 + 3*(1-s)*s**2*y2 + s**3
    return np.interp(t, X, Y)
def ajustar(ts, ps):
    ts, ps = np.array(ts), np.array(ps)
    melhor = None
    g = np.linspace(0, 1, 21); gy = np.linspace(-0.2, 1.4, 33)
    for x1, y1, x2, y2 in itertools.product(g, gy, g, gy):
        e = np.mean((by(x1, y1, x2, y2, ts) - ps) ** 2)
        if melhor is None or e < melhor[0]: melhor = (e, [x1, y1, x2, y2])
    e, c = melhor
    return [round(float(v), 3) for v in c], float(np.sqrt(e))
if __name__ == '__main__':
    d = json.loads(sys.argv[1]); print(ajustar(d['t'], d['p']))
