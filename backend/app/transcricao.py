"""Transcrição local com timestamps por palavra (MLX Whisper turbo)."""
import math
import os
import wave
from pathlib import Path

MODELO = 'mlx-community/whisper-large-v3-turbo'
CORTE_MIN = 0.5  # pausas a partir disso separam pedaços transcritos à parte (0,7 ainda deixava 4 retomadas fundidas no bruto de teste)
FALA_MIN = 0.3   # pedaço com menos fala que isso é pulado (o Whisper inventaria texto no silêncio)


def pedacos(silencios: list[dict], duracao: float, corte_min: float = CORTE_MIN) -> list[tuple[float, float]]:
    """Divide o áudio no meio de cada pausa longa, pulando pedaços que são quase só silêncio.

    Transcrever tudo de uma vez deixa o Whisper fundir tentativas repetidas ("Qual a melhor IA… qual a
    melhor IA do mundo") numa frase só, esticando uma palavra sobre a pausa. Separados, cada tentativa sai inteira."""
    meios = [(s['inicio'] + s['fim']) / 2 for s in silencios if s['dur'] >= corte_min]
    limites = [0.0, *meios, duracao]
    out = []
    for a, b in zip(limites, limites[1:]):
        mudo = sum(max(0.0, min(b, s['fim']) - max(a, s['inicio'])) for s in silencios)
        if (b - a) - mudo >= FALA_MIN:
            out.append((a, b))
    return out


def transcrever(audio: Path, silencios: list[dict], modelo: str = MODELO) -> list[dict]:
    """Palavras com ID estável (w00000…), na ordem e com os tempos do áudio inteiro.
    Não limpa nada: repetições e retomadas ficam, porque são justamente o que a etapa de cortes decide."""
    os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
    import mlx_whisper  # pesado: só carrega quando precisa
    import numpy as np

    with wave.open(str(audio), 'rb') as w:
        taxa = w.getframerate()
        amostras = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

    palavras = []
    for a, b in pedacos(silencios, len(amostras) / taxa):
        resultado = mlx_whisper.transcribe(
            amostras[int(a * taxa):int(b * taxa)], path_or_hf_repo=modelo, language='pt', task='transcribe',
            word_timestamps=True, temperature=0.0, condition_on_previous_text=False, verbose=None,
        )
        for seg in resultado.get('segments', []):
            for w in seg.get('words', []):
                inicio, fim = float(w['start']) + a, float(w['end']) + a
                if not (math.isfinite(inicio) and math.isfinite(fim)) or fim <= inicio:
                    continue
                palavras.append({'id': f'w{len(palavras):05d}', 'texto': w['word'].strip(),
                                 'inicio': round(inicio, 3), 'fim': round(fim, 3)})
    return palavras


def refinar(audio: Path, palavras: list[dict], modelo: str = MODELO) -> tuple[list[dict], str | None]:
    """Refina início e fim de cada palavra alinhando o texto JÁ transcrito ao áudio (stable-ts).
    O texto não muda. Os tempos do Whisper ficam em `inicio_whisper`/`fim_whisper`, para comparar na tela.
    Devolve (palavras, aviso); se o alinhamento não bater palavra a palavra, mantém tudo como estava."""
    import stable_whisper

    modelo_mlx = stable_whisper.load_mlx_whisper(modelo)
    resultado = modelo_mlx.align(str(audio), ' '.join(p['texto'] for p in palavras), language='pt')
    alinhadas = [w for seg in resultado.segments for w in seg.words] if resultado else []
    if len(alinhadas) != len(palavras):
        return palavras, f'o alinhamento devolveu {len(alinhadas)} palavras para {len(palavras)}; mantive os tempos do Whisper'
    out = []
    for p, w in zip(palavras, alinhadas):
        ok = math.isfinite(w.start) and math.isfinite(w.end) and w.end > w.start
        out.append({**p, 'inicio_whisper': p['inicio'], 'fim_whisper': p['fim'],
                    'inicio': round(w.start, 3) if ok else p['inicio'], 'fim': round(w.end, 3) if ok else p['fim']})
    return out, None
