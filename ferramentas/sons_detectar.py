"""Ferramenta do Claude: onde cada som da biblioteca aparece nas referências (SPEC §8.6), para decidir o som padrão de
cada momento dos presets. Correlação normalizada da forma de onda de cada som com o áudio da referência (a voz por
cima baixa a nota, mas o efeito copiado do banco do time ainda casa); lista as ocorrências com a nota (0 a 1).

    uv run --project backend python ferramentas/sons_detectar.py [ref ...] [--min 0.5] [--json saida.json]
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
BIBLIOTECA = RAIZ / 'dados' / 'sons' / 'biblioteca'
REFS = RAIZ / 'dados' / 'referencias'
TAXA = 22050


def ler(arq: Path) -> np.ndarray:
    """Mono, 22 kHz, só acima de 1,5 kHz (a voz fica quase toda abaixo; whooshes e cliques vivem nos agudos)."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-vn', '-ac', '1', '-ar', str(TAXA), '-af', 'highpass=f=1500:poles=2,highpass=f=1500:poles=2',
                        '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)


def correlacao(x: np.ndarray, t: np.ndarray) -> np.ndarray:
    """A correlação normalizada de `t` em cada posição de `x` (via FFT)."""
    n = len(x) + len(t) - 1
    m = 1 << (n - 1).bit_length()
    c = np.fft.irfft(np.fft.rfft(x, m) * np.conj(np.fft.rfft(t, m)), m)[: len(x) - len(t) + 1]
    q = np.concatenate([[0.0], np.cumsum(x * x)])
    local = np.sqrt(np.maximum(q[len(t):] - q[: len(x) - len(t) + 1], 1e-12))
    return c / (local * np.linalg.norm(t) + 1e-12)


def picos(c: np.ndarray, minimo: float, separacao: int) -> list[tuple[int, float]]:
    out = []
    ordem = np.argsort(c)[::-1]
    usados = np.zeros(len(c), bool)
    for i in ordem:
        if c[i] < minimo:
            break
        if usados[i]:
            continue
        out.append((int(i), float(c[i])))
        usados[max(i - separacao, 0): i + separacao] = True
    return sorted(out)


def main() -> None:
    args = sys.argv[1:]
    minimo = float(args[args.index('--min') + 1]) if '--min' in args else 0.5
    saida = args[args.index('--json') + 1] if '--json' in args else None
    refs = [a for a in args if not a.startswith('--') and not a.replace('.', '').isdigit() and not a.endswith('.json')]
    refs = refs or sorted(p.name for p in REFS.iterdir() if (p / 'video.mp4').exists())
    catalogo = json.loads((BIBLIOTECA / 'catalogo.json').read_text())
    sons = {}
    for s in catalogo:
        t = ler(BIBLIOTECA / f"{s['id']}.m4a")
        # só o corpo do som (até 1,5 s em volta do golpe): caudas longas misturadas à música casam mal
        a = int(s['ataque'] * TAXA)
        t = t[max(a - int(0.3 * TAXA), 0): a + int(1.2 * TAXA)]
        if len(t) > TAXA * 0.04:
            sons[s['id']] = t
    achados = []
    for ref in refs:
        x = ler(REFS / ref / 'video.mp4')
        for sid, t in sons.items():
            c = correlacao(x, t)
            # o chão: a correlação típica desse som com o resto do áudio (mediana e desvio robusto); um acerto de verdade
            # fica muitos desvios acima
            med = float(np.median(c))
            desvio = float(np.median(np.abs(c - med)) * 1.4826) + 1e-9
            for i, nota in picos(c, max(minimo, med + 8 * desvio), int(0.25 * TAXA)):
                achados.append({'ref': ref, 't': round(i / TAXA, 3), 'som': sid, 'nota': round(nota, 3), 'z': round((nota - med) / desvio, 1)})
        print(f'{ref}: {sum(a["ref"] == ref for a in achados)} ocorrências', file=sys.stderr)
    achados.sort(key=lambda a: (a['ref'], a['t']))
    if saida:
        Path(saida).write_text(json.dumps(achados, ensure_ascii=False, indent=1))
    for a in achados:
        print(f"{a['ref']:<30} {a['t']:8.2f}s  {a['som']:<28} {a['nota']:.2f}  z {a['z']:.0f}")


if __name__ == '__main__':
    main()
