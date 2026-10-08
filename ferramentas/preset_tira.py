"""Ferramenta do Claude para montar presets à mão (SPEC §8.4): quadros de um trecho de referência e a comparação
referência × recriação, quadro a quadro, nos mesmos instantes.

    uv run --project backend python ferramentas/preset_tira.py quadros <ref> <inicio> <fim> [passo] [saida.jpg]
    uv run --project backend python ferramentas/preset_tira.py comparar <receita.json> [saida.jpg]

O JSON de `comparar`: {"ref", "inicio", "fim", "receita", "midias": [[x0, y0, x1, y1, t], ...] (o recorte de cada mídia
num quadro da referência, px de 720×1280; ou {"quad": [4 cantos], "t", "w", "h"} para desentortar um card em perspectiva), "tempos": [...] (opcional, s desde o início)}. A recriação é desenhada pelo
próprio app (`/render/preset`), então o app precisa estar rodando (./dev.sh)."""
import base64
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
FRONT = os.environ.get('HARNESS_FRONT', 'http://localhost:5173')


def quadro(ref: str, t: float) -> np.ndarray:
    """O quadro da referência (ou de um vídeo externo, `externa:<nome>`), cortado em 9:16 e em 720×1280."""
    sys.path.insert(0, str(RAIZ / 'backend'))
    from app import presets
    return presets.quadro_9x16(cv2.VideoCapture(str(presets.video_da_fonte(ref))), t)


def rotulo(img: np.ndarray, texto: str) -> np.ndarray:
    img = img.copy()
    cv2.rectangle(img, (0, 0), (img.shape[1], 34), (0, 0, 0), -1)
    cv2.putText(img, texto, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    return img


def grade(img: np.ndarray) -> np.ndarray:
    """Linhas a cada 10% (para medir posição e tamanho no olho)."""
    img = img.copy()
    h, w = img.shape[:2]
    for k in range(1, 10):
        cv2.line(img, (w * k // 10, 0), (w * k // 10, h), (0, 255, 0) if k == 5 else (80, 80, 80), 1)
        cv2.line(img, (0, h * k // 10), (w, h * k // 10), (0, 255, 0) if k == 5 else (80, 80, 80), 1)
    return img


def quadros(ref: str, ini: float, fim: float, passo: float = 0.1, saida: str = 'quadros.jpg', largura: int = 240):
    ts = np.arange(ini, fim + 1e-6, passo)
    imgs = [cv2.resize(rotulo(grade(quadro(ref, t)), f'{t - ini:.2f}'), (largura, largura * 16 // 9)) for t in ts]
    por_linha = 8
    linhas = [np.hstack(imgs[i:i + por_linha] + [np.zeros_like(imgs[0])] * (por_linha - len(imgs[i:i + por_linha]))) for i in range(0, len(imgs), por_linha)]
    cv2.imwrite(saida, np.vstack(linhas))
    print(saida, len(ts), 'quadros')


def _data_url(img: np.ndarray) -> str:
    ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.tobytes()).decode()


def recriar(receita: dict, dur: float, midias: list[str], tempos: list[float]) -> list[np.ndarray]:
    from playwright.sync_api import sync_playwright
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chromium')
        pg = b.new_page(viewport={'width': 540, 'height': 960})
        pg.add_init_script(f'window.__preset = {json.dumps({"receita": receita, "dur": dur, "midias": midias})}')
        pg.goto(f'{FRONT}/render/preset')
        pg.wait_for_function('() => !!window.__ir')
        pg.wait_for_timeout(300)
        for t in tempos:
            pg.evaluate('(t) => window.__ir(t)', t)
            png = pg.screenshot()
            out.append(cv2.resize(cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR), (720, 1280)))
        b.close()
    return out


def comparar(arq: str, saida: str = 'comparar.jpg', largura: int = 200):
    d = json.loads(Path(arq).read_text())
    ref, ini, fim = d['ref'], d['inicio'], d['fim']
    dur = fim - ini
    tempos = d.get('tempos') or list(np.round(np.linspace(0, dur - 0.02, 10), 3))
    midias = []
    for m in d['midias']:
        if isinstance(m, dict) and 'arquivo' in m:  # uma imagem pronta (a mídia inteira, de um vídeo de outro formato)
            midias.append(_data_url(cv2.imread(str(RAIZ / m['arquivo']))))
        elif isinstance(m, dict):  # card em perspectiva: os 4 cantos (sup-esq, sup-dir, inf-dir, inf-esq), desentortados
            q = np.float32(m['quad'])
            w, h = m['w'], m['h']
            H = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
            midias.append(_data_url(cv2.warpPerspective(quadro(ref, ini + m['t']), H, (w, h))))
        else:
            x0, y0, x1, y1, t = m
            midias.append(_data_url(quadro(ref, ini + t)[int(y0):int(y1), int(x0):int(x1)]))
    rec = recriar(d['receita'], dur, midias, tempos)
    cima = [cv2.resize(rotulo(grade(quadro(ref, ini + t)), f'ref {t:.2f}'), (largura, largura * 16 // 9)) for t in tempos]
    baixo = [cv2.resize(rotulo(grade(r), f'rec {t:.2f}'), (largura, largura * 16 // 9)) for t, r in zip(tempos, rec)]
    cv2.imwrite(saida, np.vstack([np.hstack(cima), np.hstack(baixo)]))
    print(saida)


if __name__ == '__main__':
    cmd, *a = sys.argv[1:]
    if cmd == 'quadros':
        quadros(a[0], float(a[1]), float(a[2]), *(float(x) for x in a[3:4]), *a[4:5])
    else:
        comparar(*a)
