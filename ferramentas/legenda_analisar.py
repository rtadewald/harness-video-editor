"""Ferramenta do Claude: o estilo da legenda nas referências (docs/legenda.md), para a P4.

Em quadros de cada referência (`--fps` por segundo, 540 px de largura), o OCR do macOS (Vision, pelo `ocrmac`, num
ambiente à parte) lê os textos com a posição e o tamanho; fica como legenda o texto que bate com as palavras faladas
naquele instante (a transcrição da referência, ±1,2 s) — o que for de um insert ou de um motion não bate e sai. Por
quadro com legenda: as palavras na tela, o centro (x, y, frações do quadro, y de cima para baixo), a altura da linha,
o número de linhas, maiúsculas, a pontuação e a categoria do plano (a direção da referência). Grava
`referencias/_legenda.json` e imprime o resumo.

    uv run --project backend python ferramentas/legenda_analisar.py [ref ...] [--fps 4]
"""
import collections
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
REFS = RAIZ / 'dados' / 'referencias'
SAIDA = REFS / '_legenda.json'
DUPLICADAS = {'52-processo-ds-1'}
JANELA = 1.2
OCR = ['uv', 'run', '--no-project', '--with', 'ocrmac', 'python', '-c', '''
import json, sys
from ocrmac import ocrmac
out = {}
for arq in sys.argv[1:]:
    r = ocrmac.OCR(arq, language_preference=['pt-BR'], recognition_level='accurate').recognize()
    out[arq] = [[t, c, list(b)] for t, c, b in r]
print(json.dumps(out))
''']


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def ler_ocr(ref: str, fps: float, arqs: list[Path]) -> dict:
    """O OCR de cada quadro (por nome do quadro), guardado por referência em `referencias/_legenda_ocr/` (refazer não lê
    de novo). Em lotes de 20; um lote que falha (o sistema mata o processo com a memória cheia) é tentado de novo."""
    cache = REFS / '_legenda_ocr' / f'{ref}_{fps:g}.json'
    if cache.exists():
        guardado = json.loads(cache.read_text())
        return {str(a): guardado.get(a.name, []) for a in arqs}
    lidos: dict = {}
    for k in range(0, len(arqs), 20):
        lote = arqs[k:k + 20]
        for tentativa in range(3):
            r = subprocess.run([*OCR, *map(str, lote)], capture_output=True, text=True)
            if r.returncode == 0:
                lidos.update(json.loads(r.stdout))
                break
        else:
            raise RuntimeError(f'OCR falhou em {ref}: {r.stderr[-200:]}')
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({Path(a).name: v for a, v in lidos.items()}))
    return lidos


def plano_em(planos: list[dict], t: float) -> str | None:
    return next((p['tipo'] for p in planos if p['inicio'] <= t < p['fim']), None)


def analisar(ref: str, fps: float) -> list[dict]:
    pasta = REFS / ref
    palavras = json.loads((pasta / 'palavras.json').read_text())['palavras']
    planos = [i for i in json.loads((pasta / 'direcao.json').read_text())['itens'] if i.get('camada') == 'plano']
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(pasta / 'video.mp4'), '-vf', f'fps={fps},scale=540:-2', f'{tmp}/q%05d.png'], check=True)
        arqs = sorted(Path(tmp).glob('q*.png'))
        lidos = ler_ocr(ref, fps, arqs)
        out = []
        for i, arq in enumerate(arqs):
            t = (i + 0.5) / fps
            faladas = {norm(w['texto']) for w in palavras if w['inicio'] - JANELA <= t <= w['fim'] + JANELA}
            linhas = []
            for texto, conf, (x, y, w, h) in lidos.get(str(arq), []):
                ws = [norm(p) for p in texto.split() if norm(p)]
                if conf < 0.5 or not ws or not all(p in faladas for p in ws):
                    continue
                linhas.append({'texto': texto, 'x': x + w / 2, 'y': 1 - (y + h / 2), 'h': h, 'w': w})
            if not linhas:
                continue
            # as linhas de um mesmo bloco ficam juntas na vertical; um texto solto longe é de outra coisa
            linhas.sort(key=lambda l: l['y'])
            texto = ' '.join(l['texto'] for l in linhas)
            out.append({'ref': ref, 't': round(t, 2), 'texto': texto, 'palavras': len(texto.split()), 'linhas': len(linhas),
                        'x': round(float(np.mean([l['x'] for l in linhas])), 3), 'y': round(float(np.mean([l['y'] for l in linhas])), 3),
                        'h': round(float(np.median([l['h'] for l in linhas])), 4), 'largura': round(max(l['w'] for l in linhas), 3),
                        'maiusculas': texto.isupper(), 'pontuacao': bool(re.search(r'[.,!?…:;]', texto)), 'plano': plano_em(planos, t)})
        return out


def resumo(qs: list[dict]) -> dict:
    por_plano = collections.defaultdict(list)
    for q in qs:
        por_plano[q['plano']].append(q)
    med = lambda xs: round(float(np.median(xs)), 3) if xs else None  # noqa: E731
    return {
        'quadros': len(qs),
        'palavras_por_bloco': dict(collections.Counter(min(q['palavras'], 6) for q in qs)),
        'linhas': dict(collections.Counter(q['linhas'] for q in qs)),
        'altura_da_linha': med([q['h'] for q in qs]),
        'x': med([q['x'] for q in qs]),
        'maiusculas': round(sum(q['maiusculas'] for q in qs) / max(len(qs), 1), 2),
        'pontuacao': round(sum(q['pontuacao'] for q in qs) / max(len(qs), 1), 2),
        'y_por_plano': {p: {'n': len(v), 'y': med([q['y'] for q in v]), 'y_p10': round(float(np.percentile([q['y'] for q in v], 10)), 3),
                            'y_p90': round(float(np.percentile([q['y'] for q in v], 90)), 3)} for p, v in sorted(por_plano.items(), key=lambda x: -len(x[1]))},
        'por_referencia': {r: {'n': len([q for q in qs if q['ref'] == r]), 'palavras': med([q['palavras'] for q in qs if q['ref'] == r]),
                               'y': med([q['y'] for q in qs if q['ref'] == r])} for r in sorted({q['ref'] for q in qs})},
    }


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    fps = float(sys.argv[sys.argv.index('--fps') + 1]) if '--fps' in sys.argv else 4
    args = [a for a in args if a != str(fps) and a != str(int(fps))]
    refs = args or sorted(p.parent.name for p in REFS.glob('*/palavras.json') if p.parent.name not in DUPLICADAS)
    qs = []
    for ref in refs:
        q = analisar(ref, fps)
        print(ref, len(q), file=sys.stderr)
        qs += q
    r = resumo(qs)
    SAIDA.write_text(json.dumps({'resumo': r, 'quadros': qs}, ensure_ascii=False, indent=1))
    print(json.dumps(r, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
