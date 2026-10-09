"""Ferramenta do Claude: gera a biblioteca de faixas de fundo (docs/audio.md) com o Lyria 3 Pro (Google, pela OpenRouter,
US$ 0,08 por faixa completa), a partir da música das referências (`trilhas_analisar.py` → `trilhas/analise.json`).

Os prompts saem da análise (out/2026): as 10 referências têm música, eletrônica downtempo / lo-fi / cinemática, de
78 a 152 BPM, calma a levemente inspiradora, com pads, piano, arpejos e beats discretos, deixando os médios livres para
a voz. Cada faixa é normalizada para `trilhas.LUFS` (o mesmo volume percebido) e gravada em `trilhas/<id>.m4a`, com o
`catalogo.json` (nome, clima, BPM medido, duração, o prompt). Faixas que já existem não são geradas de novo.

    uv run --project backend python ferramentas/trilhas_gerar.py [id ...]
"""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / 'backend'))
from app import comum, trilhas  # noqa: E402

MODELO = 'google/lyria-3-pro-preview'
COMUM = ('Instrumental only, no vocals, no singing, no spoken words, no vocal chops, no vocal samples, no choir or vocal pads. Background music for a short video with a spoken '
         'voice-over: keep the mid-range (300 Hz to 3 kHz) uncluttered, no prominent lead melody fighting the voice, steady '
         'energy without big drops, breaks or builds, consistent from start to end so it can loop. About 2 minutes.')
FAIXAS = [
    {'id': 'lofi-piano', 'nome': 'Piano lo-fi', 'clima': 'calmo, focado',
     'prompt': 'Lo-fi downtempo at 86 BPM: muted soft piano chords, a shuffling laid-back electronic beat with brushed hi-hats, warm sub bass, light vinyl crackle. Calm and focused.'},
    {'id': 'arpejo-suave', 'nome': 'Arpejo suave', 'clima': 'leve, inspirador',
     'prompt': 'Chill electronic at 100 BPM: a gentle arpeggiated plucked synth, soft driving electronic drums, warm round bass, airy pads. Dreamy and quietly inspirational.'},
    {'id': 'pads-ambiente', 'nome': 'Pads ambiente', 'clima': 'flutuante, reflexivo',
     'prompt': 'Ambient electronic at 80 BPM: warm, expansive, slowly evolving synth pads, a distant soft beat, subtle textures. Floating and introspective.'},
    {'id': 'chillhop', 'nome': 'Chillhop', 'clima': 'descontraído',
     'prompt': 'Chillhop at 90 BPM: a laid-back hip-hop drum groove, a simple looping electric piano motif, a thick smooth bassline. Relaxed and confident.'},
    {'id': 'sinos-leves', 'nome': 'Sinos leves', 'clima': 'otimista, curioso',
     'prompt': 'Light electronic at 118 BPM: a clean bell-like synth motif over a simple, tight electronic beat, soft pads underneath. Optimistic and curious.'},
    {'id': 'cinematico', 'nome': 'Cinemático', 'clima': 'pensativo, com tensão leve',
     'prompt': 'Cinematic electronic at 85 BPM: deep resonant swells, a soft reverbed electronic snare, low warm synths, a subtle sense of anticipation without a drop. Thoughtful.'},
    {'id': 'grave-tech', 'nome': 'Grave tech', 'clima': 'focado, escuro',
     'prompt': 'Minimal dark electronic at 100 BPM: deep resonant sub bass, a sparse precise beat, an evolving low synth drone, small glitchy details. Focused, techy, serious.'},
    {'id': 'piano-pulsante', 'nome': 'Piano pulsante', 'clima': 'animado, positivo',
     'prompt': 'Modern electronic at 76 BPM in half-time feel: a simple acoustic piano motif, a punchy soft electronic kick, airy hi-hats, warm pads. Uplifting and positive.'},
]


def gerar(prompt: str) -> bytes:
    """O áudio gerado (bytes do arquivo). A saída de áudio da OpenRouter vem em streaming (SSE), em base64."""
    corpo = {'model': MODELO, 'messages': [{'role': 'user', 'content': prompt}], 'modalities': ['text', 'audio'], 'stream': True}
    partes: list[str] = []
    with httpx.stream('POST', 'https://openrouter.ai/api/v1/chat/completions', json=corpo, timeout=600,
                      headers={'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}"}) as r:
        if r.status_code >= 400:
            raise RuntimeError(f'OpenRouter respondeu {r.status_code}: {r.read()[:300]!r}')
        for linha in r.iter_lines():
            if not linha.startswith('data: ') or linha[6:].strip() == '[DONE]':
                continue
            pedaco = json.loads(linha[6:])
            if 'error' in pedaco:
                raise RuntimeError(f"OpenRouter: {pedaco['error']}")
            for c in pedaco.get('choices', []):
                a = (c.get('delta') or {}).get('audio') or (c.get('message') or {}).get('audio') or {}
                if a.get('data'):
                    partes.append(a['data'])
    if not partes:
        raise RuntimeError('A resposta não trouxe áudio')
    return base64.b64decode(''.join(partes))


def normalizar(bruto: Path, destino: Path) -> None:
    """Para `trilhas.LUFS` (duas passadas do loudnorm), estéreo 48 kHz, AAC."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(bruto), '-af', f'loudnorm=I={trilhas.LUFS}:TP=-2:LRA=11:print_format=json',
                        '-f', 'null', '-'], capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    ln = (f"loudnorm=I={trilhas.LUFS}:TP=-2:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
          f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(bruto), '-af', f'{ln},aresample=48000', '-ac', '2', '-c:a', 'aac', '-b:a', '192k',
                    str(destino)], check=True)


def medir(arq: Path) -> tuple[float, float]:
    """A duração e o andamento (librosa)."""
    import librosa

    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], capture_output=True, check=True)
    y = np.frombuffer(r.stdout, np.float32)
    tempo, _ = librosa.beat.beat_track(y=y, sr=22050)
    return round(len(y) / 22050, 1), round(float(np.atleast_1d(tempo)[0]), 1)


def main() -> None:
    comum.carregar_env()
    trilhas.RAIZ.mkdir(exist_ok=True)
    arq = trilhas.RAIZ / 'catalogo.json'
    cat = json.loads(arq.read_text()) if arq.exists() else {'faixas': []}
    pedidas = set(sys.argv[1:]) or {f['id'] for f in FAIXAS}
    for f in FAIXAS:
        destino = trilhas.RAIZ / f"{f['id']}.m4a"
        if f['id'] not in pedidas or destino.exists():
            continue
        print('gerando', f['id'], file=sys.stderr)
        audio = gerar(f"{f['prompt']} {COMUM}")
        bruto = trilhas.RAIZ / f"{f['id']}.original"
        bruto.write_bytes(audio)
        normalizar(bruto, destino)
        duracao, bpm = medir(destino)
        cat['faixas'] = [x for x in cat['faixas'] if x['id'] != f['id']] + [{**{k: f[k] for k in ('id', 'nome', 'clima')}, 'bpm': bpm,
                                                                               'duracao': duracao, 'prompt': f"{f['prompt']} {COMUM}", 'modelo': MODELO}]
        cat['faixas'].sort(key=lambda x: [y['id'] for y in FAIXAS].index(x['id']) if x['id'] in [y['id'] for y in FAIXAS] else 99)
        arq.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f['id'], duracao, 's', bpm, 'BPM', file=sys.stderr)


if __name__ == '__main__':
    main()
