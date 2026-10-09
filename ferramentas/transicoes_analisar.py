"""Ferramenta do Claude: o que acontece em cada corte entre planos das referências (docs/transicoes.md), para montar as
transições e as favoritas de cada par. Para cada corte (a troca de um plano da direção para o seguinte), mede de −0,4 s
a +0,4 s, a 24 quadros/s: o brilho (um flash é um pico acima dos dois lados), a nitidez (um desfoque é uma queda da
variância do Laplaciano), o movimento (fluxo óptico: divergência = zoom, horizontal = deslize) e os sons achados em
volta (`sons_detectar.py`, de −0,8 s a +0,5 s). Atenção, medido em out/2026: o "desfoque" que aparece nos cortes para um
insert quase sempre é a ENTRADA do próprio insert (o card surgindo desfocado), não uma transição — conferir nas tiras.

Grava `transicoes/pares.json`: por par ("de>para"), quantos cortes, quantos com cada som, as classes medidas e os
instantes (para conferir e para a página Transições mostrar a referência).

    uv run --project backend python ferramentas/sons_detectar.py --min 0.5 --json /tmp/sons.json
    uv run --project backend python ferramentas/transicoes_analisar.py /tmp/sons.json
"""
import collections
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
FPS = 24
DUPLICADAS = {'52-processo-ds-1'}  # a mesma referência subida duas vezes


def quadros(video: Path, t0: float, t1: float, w=180, h=320) -> np.ndarray:
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{max(t0, 0):.3f}', '-t', f'{t1 - t0:.3f}', '-i', str(video), '-vf', f'fps={FPS},scale={w}:{h}',
                        '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8)
    return a[: len(a) // (w * h) * w * h].reshape(-1, h, w)


def medir(fr: np.ndarray) -> dict:
    lum = fr.reshape(len(fr), -1).mean(1)
    nit = np.array([cv2.Laplacian(f, cv2.CV_64F).var() for f in fr])
    div, hor = [0.0], [0.0]
    h, w = fr.shape[1:]
    yy, xx = np.mgrid[0:h, 0:w]
    rx, ry = xx - w / 2, yy - h / 2
    n = np.sqrt(rx ** 2 + ry ** 2) + 1e-6
    for a, b in zip(fr, fr[1:]):
        fl = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        div.append(float(((fl[..., 0] * rx + fl[..., 1] * ry) / n).mean()))
        hor.append(float(fl[..., 0].mean()))
    return {'lum': lum, 'nit': nit, 'div': np.array(div), 'hor': np.array(hor)}


def classe(m: dict) -> str:
    lum, nit, div, hor = m['lum'], m['nit'], m['div'], m['hor']
    meio = len(lum) // 2
    perto = slice(max(meio - 4, 0), meio + 5)
    lados = np.concatenate([lum[:3], lum[-3:]])
    tags = []
    if lum[perto].max() > lados.max() + 30:
        tags.append('flash')
    base = np.median(np.concatenate([nit[:3], nit[-3:]]))
    if base > 20 and nit[perto].min() < 0.35 * base:
        tags.append('desfoque')
    if np.abs(div[perto]).mean() > 1.2:
        tags.append('zoom')
    if np.abs(hor[perto]).mean() > 3:
        tags.append('deslize')
    return '+'.join(tags) or 'seco'


def main() -> None:
    sons = [d for d in json.loads(Path(sys.argv[1]).read_text()) if d.get('z', 99) >= 40 and d['nota'] >= 0.5] if len(sys.argv) > 1 else []
    pares: dict = collections.defaultdict(lambda: {'n': 0, 'classes': collections.Counter(), 'sons': collections.Counter(), 'cortes': []})
    for arq in sorted((RAIZ / 'dados' / 'referencias').glob('*/direcao.json')):
        ref = arq.parent.name
        if ref in DUPLICADAS:
            continue
        planos = sorted((i for i in json.loads(arq.read_text())['itens'] if i.get('camada') == 'plano'), key=lambda i: i['inicio'])
        for a, b in zip(planos, planos[1:]):
            t = b['inicio']
            fr = quadros(arq.parent / 'video.mp4', t - 0.4, t + 0.4)
            if len(fr) < 12:
                continue
            c = classe(medir(fr))
            s = sorted({d['som'] for d in sons if d['ref'] == ref and -0.8 <= d['t'] - t <= 0.5})
            p = pares[f"{a['tipo']}>{b['tipo']}"]
            p['n'] += 1
            p['classes'][c] += 1
            p['sons'].update(s)
            p['cortes'].append({'ref': ref, 't': round(t, 3), 'classe': c, 'sons': s})
        print(ref, file=sys.stderr)
    saida = RAIZ / 'dados' / 'transicoes' / 'pares.json'
    saida.parent.mkdir(exist_ok=True)
    saida.write_text(json.dumps({k: {**v, 'classes': dict(v['classes']), 'sons': dict(v['sons'])} for k, v in sorted(pares.items(), key=lambda x: -x[1]['n'])},
                                ensure_ascii=False, indent=1))
    print(saida)


if __name__ == '__main__':
    main()
