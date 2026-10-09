"""As faixas de fundo (SPEC §8.9; docs/audio.md): geradas com o Lyria 3 Pro a partir da música das referências
(`ferramentas/trilhas_gerar.py`), em `trilhas/` (dados, fora do git, como os presets): `<id>.m4a` e o
`catalogo.json` (nome, clima, BPM, duração, o prompt usado), normalizadas para o mesmo volume percebido."""
import re
import subprocess
from pathlib import Path

from . import comum

RAIZ = comum.DADOS / 'trilhas'
_ID = re.compile(r'[a-z0-9][a-z0-9-]{0,40}')
LUFS = -16.0  # a sonoridade de todas as faixas da biblioteca (a geração normaliza)
# o laço: o trecho estável da faixa, onde a energia (média de 2 s) fica a menos de `LACO_DB` da mediana
LACO_DB = 5.0
_lacos: dict[tuple[str, float], tuple[float, float]] = {}


def catalogo() -> list[dict]:
    arq = RAIZ / 'catalogo.json'
    if not arq.exists():
        return []
    return [t for t in comum.ler_json(arq).get('faixas', []) if _ID.fullmatch(t.get('id') or '') and (RAIZ / f"{t['id']}.m4a").exists()]


def existe(tid: str) -> bool:
    return bool(_ID.fullmatch(tid or '')) and any(t['id'] == tid for t in catalogo())


def arquivo(tid: str) -> Path:
    if not existe(tid):
        raise FileNotFoundError(tid)
    return RAIZ / f'{tid}.m4a'


def laco(tid: str) -> tuple[float, float]:
    """O trecho da faixa que se repete num vídeo mais longo que ela (s, `(ini, fim)`): sem a introdução baixa e sem o
    fade/silêncio do fim (as faixas do Lyria começam devagar e terminam sumindo). A 1ª volta toca do 0 até `fim`; as
    outras, de `ini` a `fim`, com crossfade (`audio.CRUZA_FUNDO`). Medido uma vez por arquivo."""
    import numpy as np

    arq = arquivo(tid)
    chave = (tid, arq.stat().st_mtime)
    if chave in _lacos:
        return _lacos[chave]
    taxa, janela = 8000, 4000  # 0,5 s
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-ac', '1', '-ar', str(taxa), '-f', 'f32le', '-'], capture_output=True)
    x = np.frombuffer(r.stdout, np.float32).astype(np.float64)
    n = len(x) // janela
    dur = len(x) / taxa
    out = (0.0, round(dur, 2))
    if n >= 8:
        energia = (x[: n * janela].reshape(n, janela) ** 2).mean(axis=1)
        media = np.convolve(energia, np.ones(4) / 4, mode='same')  # 2 s
        e = 10 * np.log10(media + 1e-12)
        ok = np.where(e > np.median(e) - LACO_DB)[0]
        if len(ok):
            ini, fim = ok[0] * janela / taxa, (ok[-1] + 1) * janela / taxa
            if ini <= dur * 0.3 and fim >= dur * 0.6:  # um laço estranho (faixa curta ou irregular): a faixa inteira
                out = (round(float(ini), 2), round(float(fim), 2))
    _lacos[chave] = out
    return out
