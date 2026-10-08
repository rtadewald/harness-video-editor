"""Ferramenta do Claude: a biblioteca de sons de apoio (SPEC §8.6) a partir da pasta bruta `sons/` (os arquivos do time
de audiovisual: WAV de 96 kHz, MP3, até vídeos MP4). Cada som sai cortado e compacto em `sons/biblioteca/<id>.m4a`:
- só o trecho útil: sem o silêncio do começo, e o fim onde o som já morreu (no máximo `MAX_S`, com um fade);
- no mesmo volume percebido que os outros (o pico da energia em janelas curtas num mesmo nível, sem estourar; os
  contínuos, como a digitação, um pouco abaixo);
- AAC 48 kHz (mono quando os dois canais são iguais).
O catálogo (`sons/biblioteca/catalogo.json`) guarda o nome, a família, a duração e o `ataque` (o instante do golpe
principal dentro do arquivo, para alinhar o som ao movimento). A pasta `sons/` fica fora do git (licença do time).

    uv run --project backend python ferramentas/sons_biblioteca.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
BRUTOS = RAIZ / 'sons'
SAIDA = BRUTOS / 'biblioteca'
TAXA = 48000
MAX_S = 8.0  # risers e ambientes longos: o começo basta (o resto vira fade)
ALVO_DB = -18.0  # o pico da energia (janelas de 50 ms) de cada som
CONTINUOS = {'Digitação': -6.0}  # sons contínuos (tocam por segundos): mais baixos que um golpe para soarem iguais
FAMILIAS = [  # pelo nome do arquivo: a família que aparece agrupada no select
    ('whoosh', 'Whoosh'), ('click', 'Clique'), ('pop', 'Pop'), ('typing', 'Digitação'), ('riser', 'Riser'),
    ('impact', 'Impacto'), ('hit', 'Impacto'), ('ding', 'Ding'), ('camera', 'Câmera'), ('highlighter', 'Marca-texto'),
    ('scissors', 'Tesoura'),
]


def familia(nome: str) -> str:
    n = nome.lower()
    return next((f for k, f in FAMILIAS if k in n), 'Outros')


def ident(nome: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', nome.lower()).strip('-')


def ler(arq: Path) -> np.ndarray:
    """O áudio em float32, 48 kHz, estéreo (canais × amostras)."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-vn', '-ac', '2', '-ar', str(TAXA), '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).T.copy()


def energia(mono: np.ndarray, janela: int) -> np.ndarray:
    n = len(mono) // janela
    return np.sqrt((mono[:n * janela].reshape(n, janela) ** 2).mean(axis=1) + 1e-12)


def processar(arq: Path) -> dict:
    a = ler(arq)
    mono = a.mean(axis=0)
    pico = np.abs(mono).max() + 1e-9
    # começo: a primeira amostra acima de -45 dB do pico (menos 5 ms); fim: a última janela de 20 ms acima de -50 dB
    acima = np.nonzero(np.abs(mono) > pico * 10 ** (-45 / 20))[0]
    ini = max(int(acima[0]) - TAXA // 200, 0)
    j = TAXA // 50
    e = energia(mono, j)
    vivas = np.nonzero(e > e.max() * 10 ** (-50 / 20))[0]
    fim = min((int(vivas[-1]) + 2) * j, a.shape[1])
    fim = min(fim, ini + int(MAX_S * TAXA))
    a = a[:, ini:fim]
    # fade curto no fim (e mais longo quando cortamos um som que ainda tocava)
    nf = min(int((0.5 if fim - ini >= MAX_S * TAXA - 1 else 0.03) * TAXA), a.shape[1])
    a[:, -nf:] *= np.linspace(1, 0, nf, dtype=np.float32)
    mono = a.mean(axis=0)
    e50 = energia(mono, TAXA // 20)
    ganho = 10 ** ((ALVO_DB + CONTINUOS.get(familia(arq.stem), 0)) / 20) / (e50.max() + 1e-9)
    ganho = min(ganho, 10 ** (-1 / 20) / (np.abs(a).max() + 1e-9))  # sem passar de -1 dBFS
    a *= ganho
    # o golpe principal: a janela de 20 ms com mais energia
    ataque = float(np.argmax(energia(a.mean(axis=0), j)) * j / TAXA)
    estereo = np.corrcoef(a[0], a[1])[0, 1] < 0.98 if a[0].std() > 0 and a[1].std() > 0 else False
    sid = ident(arq.stem)
    destino = SAIDA / f'{sid}.m4a'
    canais = 2 if estereo else 1
    pcm = (a if estereo else a.mean(axis=0, keepdims=True)).T.astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(TAXA), '-ac', str(canais), '-i', '-',
                    '-c:a', 'aac', '-b:a', '128k' if estereo else '96k', '-movflags', '+faststart', str(destino)],
                   input=pcm, check=True)
    return {'id': sid, 'nome': arq.stem.replace('_', ' ').strip(), 'familia': familia(arq.stem),
            'duracao': round(a.shape[1] / TAXA, 3), 'ataque': round(ataque, 3), 'origem': arq.name}


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    arquivos = sorted(f for f in BRUTOS.iterdir() if f.is_file() and f.suffix.lower() in ('.wav', '.mp3', '.mp4', '.m4a', '.aif', '.aiff'))
    catalogo = []
    for f in arquivos:
        s = processar(f)
        catalogo.append(s)
        print(f"{s['id']:<32} {s['familia']:<12} {s['duracao']:6.2f}s  ataque {s['ataque']:.2f}s  "
              f"{(SAIDA / (s['id'] + '.m4a')).stat().st_size // 1024} KB", file=sys.stderr)
    (SAIDA / 'catalogo.json').write_text(json.dumps(sorted(catalogo, key=lambda s: (s['familia'], s['nome'])), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
