"""Acha cx, cy, w, h (% da área), rot, rx, ry (graus) de um card cujos 4 cantos (px de 720×1280) são dados,
reproduzindo o transform do CenaPreset: perspective(138.9cqw) rotateX rotateY rotate, origem no centro.

    uv run --project backend python ferramentas/preset_pose.py '[[x,y] sup-esq, sup-dir, inf-dir, inf-esq]' '[cx, cy, w, h, rot, rx, ry] (chute)' ['[largura, altura da área em px]']

Na tela dividida, passe a área de cima (ex.: [720, 600]) e os cantos medidos dentro dela."""
import json, math, sys
import numpy as np

def cantos(p, area_w=720, area_h=1280):
    cx, cy, w, h, rot, rx, ry = p
    W, H = w / 100 * area_w, h / 100 * area_h
    P = 1.389 * area_w
    pts = np.array([[-W/2, -H/2, 0], [W/2, -H/2, 0], [W/2, H/2, 0], [-W/2, H/2, 0]], float)
    a, b, c = map(math.radians, (rot, ry, rx))
    Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(c), -math.sin(c)], [0, math.sin(c), math.cos(c)]])
    q = pts @ Rz.T @ Ry.T @ Rx.T  # CSS aplica da direita para a esquerda: rotate, depois rotateY, depois rotateX
    k = P / (P - q[:, 2])
    return np.c_[q[:, 0] * k + cx / 100 * area_w, q[:, 1] * k + cy / 100 * area_h]

def ajustar(alvo, p0, area=(720, 1280)):
    alvo = np.array(alvo, float); p = np.array(p0, float)
    for _ in range(60):
        r = (cantos(p, *area) - alvo).ravel()
        J = np.zeros((len(r), len(p)))
        for i in range(len(p)):
            d = np.zeros(len(p)); d[i] = 1e-3
            J[:, i] = ((cantos(p + d, *area) - alvo).ravel() - r) / 1e-3
        p = p - np.linalg.lstsq(J, r, rcond=None)[0] * 0.7
    return p, float(np.abs(cantos(p, *area) - alvo).max())

if __name__ == '__main__':
    alvo = json.loads(sys.argv[1]); p0 = json.loads(sys.argv[2]); area = json.loads(sys.argv[3]) if len(sys.argv) > 3 else [720, 1280]
    p, e = ajustar(alvo, p0, area)
    print([round(float(x), 2) for x in p], 'erro px', round(e, 1))
