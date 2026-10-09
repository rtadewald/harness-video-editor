"""Ferramenta do Claude: o tempo e os destaques da legenda nas referências (docs/legenda.md), o que o
`legenda_analisar.py` não mede. Lê os quadros com legenda que ele achou (`referencias/_legenda.json`, 4 por segundo) e
a transcrição de cada referência, e mede:
- **o tempo dos blocos**: quando um bloco aparece em relação ao início da 1ª palavra dele (antecipa ou atrasa), quando
  some em relação ao fim da última, e o que acontece numa pausa (o bloco fica até o próximo ou some antes);
- **se a frase se monta palavra a palavra** (o texto de um quadro é o começo do texto do quadro seguinte);
- **destaques**: se alguma palavra muda de cor (os pixels claros do texto, dentro da caixa lida pelo OCR, com cor).
Com 4 quadros/s, cada instante tem ±0,125 s de incerteza; valem as medianas. Grava `referencias/_legenda_ritmo.json`.

    uv run --project backend python ferramentas/legenda_ritmo.py
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
FPS = 4
MEIO = 0.5 / FPS  # o bloco apareceu entre o quadro anterior e este: o meio do intervalo
PAUSA = 0.3  # s: as referências são cortadas justas; pausas maiores quase não há


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s.lower())
    return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).strip()


def achar(palavras: list[dict], ws: list[str], t: float) -> int | None:
    """O índice da 1ª palavra falada do bloco: a sequência com o mesmo texto que começa mais perto de `t`."""
    melhor = None
    for k in range(len(palavras) - len(ws) + 1):
        if abs(palavras[k]['inicio'] - t) > 1.5:
            continue
        if [norm(w['texto']) for w in palavras[k:k + len(ws)]] == ws:
            if melhor is None or abs(palavras[k]['inicio'] - t) < abs(palavras[melhor]['inicio'] - t):
                melhor = k
    return melhor


def cores(video: Path, quadros: list[dict]) -> list[float]:
    """Por quadro: a fração dos pixels claros do texto (dentro da caixa do OCR) que têm cor (saturação alta)."""
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-vf', f'fps={FPS},scale=540:-2', '-pix_fmt', 'rgb24', f'{tmp}/q%05d.ppm'], check=True)
        for q in quadros:
            arq = Path(tmp) / f"q{q['i'] + 1:05d}.ppm"
            if not arq.exists():
                out.append(0.0)
                continue
            img = _ppm(arq)
            H, W = img.shape[:2]
            x0, x1 = int((q['x'] - q['largura'] / 2) * W), int((q['x'] + q['largura'] / 2) * W)
            y0, y1 = int((q['y'] - q['h'] * q['linhas'] / 2) * H), int((q['y'] + q['h'] * q['linhas'] / 2) * H)
            caixa = img[max(y0, 0):max(y1, 1), max(x0, 0):max(x1, 1)].astype(float) / 255
            if caixa.size == 0:
                out.append(0.0)
                continue
            mx, mn = caixa.max(axis=2), caixa.min(axis=2)
            claros = mx > 0.85
            sat = (mx - mn) / np.maximum(mx, 1e-6)
            out.append(float((sat[claros] > 0.5).mean()) if claros.sum() > 20 else 0.0)
    return out


def _ppm(arq: Path) -> np.ndarray:
    dados = arq.read_bytes()
    partes = dados.split(maxsplit=4)
    w, h = int(partes[1]), int(partes[2])
    return np.frombuffer(dados[-w * h * 3:], np.uint8).reshape(h, w, 3)


def analisar(ref: str, qs: list[dict]) -> dict:
    palavras = json.loads((REFS / ref / 'palavras.json').read_text())['palavras']
    for q in qs:
        q['i'] = round(q['t'] * FPS - 0.5)
        q['tq'] = q['i'] / FPS  # o instante do quadro (o filtro fps pega o quadro mais perto de i/fps)
    # os blocos: quadros seguidos com o mesmo texto
    blocos, atual = [], None
    for q in sorted(qs, key=lambda q: q['i']):
        if atual and q['i'] == atual['ate'] + 1 and norm(q['texto']) == atual['norm']:
            atual['ate'] = q['i']
            continue
        atual = {'de': q['i'], 'ate': q['i'], 'norm': norm(q['texto']), 'texto': q['texto']}
        blocos.append(atual)
    entra, sai, pausa_fica, pausa_some, monta, troca = [], [], 0, 0, 0, 0
    for b, prox in zip(blocos, blocos[1:] + [None]):
        ws = b['norm'].split()
        k = achar(palavras, ws, b['de'] / FPS)
        if k is None:
            continue
        ini_q = b['de'] / FPS - MEIO
        fim_q = b['ate'] / FPS + MEIO
        entra.append(ini_q - palavras[k]['inicio'])
        ult = palavras[k + len(ws) - 1]
        sai.append(fim_q - ult['fim'])
        # numa pausa depois do bloco (a próxima palavra começa 0,3 s ou mais depois), ele fica até a próxima?
        seguinte = palavras[k + len(ws)] if k + len(ws) < len(palavras) else None
        if seguinte and seguinte['inicio'] - ult['fim'] >= PAUSA:
            if fim_q >= seguinte['inicio'] - 0.25:
                pausa_fica += 1
            else:
                pausa_some += 1
        if prox and prox['de'] == b['ate'] + 1:
            if prox['norm'].startswith(b['norm'] + ' '):
                monta += 1
            else:
                troca += 1
    destaques = cores(REFS / ref / 'video.mp4', qs)
    for q, c in zip(qs, destaques):
        q['cor'] = round(c, 3)
    return {'entra': entra, 'sai': sai, 'pausa_fica': pausa_fica, 'pausa_some': pausa_some, 'monta': monta, 'troca': troca,
            'quadros_com_cor': [q for q in qs if q['cor'] > 0.25]}


def main() -> None:
    todos = json.loads((REFS / '_legenda.json').read_text())['quadros']
    por_ref = collections.defaultdict(list)
    for q in todos:
        por_ref[q['ref']].append(dict(q))
    med = lambda xs: round(float(np.median(xs)), 3) if xs else None  # noqa: E731
    pct = lambda xs, p: round(float(np.percentile(xs, p)), 3) if xs else None  # noqa: E731
    tudo = collections.defaultdict(list)
    por_referencia = {}
    for ref, qs in sorted(por_ref.items()):
        r = analisar(ref, qs)
        print(ref, len(qs), file=sys.stderr)
        for k in ('entra', 'sai', 'quadros_com_cor'):
            tudo[k] += r[k]
        for k in ('pausa_fica', 'pausa_some', 'monta', 'troca'):
            tudo[k].append(r[k])
        por_referencia[ref] = {'entra': med(r['entra']), 'sai': med(r['sai']), 'pausa_fica': r['pausa_fica'], 'pausa_some': r['pausa_some'],
                               'monta': r['monta'], 'troca': r['troca'], 'com_cor': len(r['quadros_com_cor']), 'quadros': len(qs)}
    resumo = {
        'entra_em_relacao_a_palavra': {'mediana': med(tudo['entra']), 'p10': pct(tudo['entra'], 10), 'p90': pct(tudo['entra'], 90), 'n': len(tudo['entra'])},
        'sai_em_relacao_ao_fim_da_fala': {'mediana': med(tudo['sai']), 'p10': pct(tudo['sai'], 10), 'p90': pct(tudo['sai'], 90), 'n': len(tudo['sai'])},
        'nas_pausas': {'fica_ate_a_proxima': sum(tudo['pausa_fica']), 'some_antes': sum(tudo['pausa_some'])},
        'frase_se_monta_palavra_a_palavra': {'monta': sum(tudo['monta']), 'troca_inteira': sum(tudo['troca'])},
        'destaques': {'quadros_com_cor': len(tudo['quadros_com_cor']), 'quadros': len(todos),
                      'altura_da_linha_p10_p90': [pct([q['h'] for q in todos if q['linhas'] == 1], 10), pct([q['h'] for q in todos if q['linhas'] == 1], 90)],
                      'exemplos': [{k: q[k] for k in ('ref', 't', 'texto', 'cor', 'plano')} for q in tudo['quadros_com_cor'][:20]]},
        'por_referencia': por_referencia,
    }
    (REFS / '_legenda_ritmo.json').write_text(json.dumps(resumo, ensure_ascii=False, indent=1))
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
