"""Motores de transcrição e alinhamento além do padrão (SPEC §8.1 e §16).

Cada motor devolve uma lista de palavras {id, texto, inicio, fim}. Os alinhadores (Qwen3, CTC) recebem o texto que o
Whisper já transcreveu e só recalculam os tempos: o texto e os IDs não mudam, então os cortes continuam valendo.
Os transcritores de verdade (Parakeet, ElevenLabs) escrevem um texto próprio, com IDs próprios."""
import os
import tempfile
import wave
from pathlib import Path

import numpy as np

from . import comum, transcricao

# Quais motores rodam em segundo plano depois do padrão (Whisper + stable-ts), em ordem.
EXTRAS = ['whisper', 'whisper-stable', 'whisper-qwen', 'whisper-ctc', 'parakeet', 'qwen-asr', 'whisper-v3', 'elevenlabs']

QWEN_ASR = 'mlx-community/Qwen3-ASR-1.7B-8bit'
QWEN_ALINHADOR = 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit'
WHISPER_V3 = 'mlx-community/whisper-large-v3-mlx'


def _amostras(audio: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(audio), 'rb') as w:
        taxa = w.getframerate()
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0, taxa


def mapear_por_nucleo(palavras: list[dict], itens: list[tuple[str, float, float]]) -> list[dict]:
    """Casa os itens de um alinhador (texto sem pontuação, início, fim) com as palavras originais pela parte
    alfanumérica. Palavras sem núcleo ("%") não têm item e ficam no vão entre as vizinhas."""
    alvo = [k for k, w in enumerate(palavras) if comum.norm(w['texto'])]
    if len(alvo) != len(itens):
        raise RuntimeError(f'o alinhador devolveu {len(itens)} palavras para {len(alvo)} com som')
    out = [dict(w) for w in palavras]
    for k, (texto, inicio, fim) in zip(alvo, itens):
        if comum.norm(texto) != comum.norm(palavras[k]['texto']):
            raise RuntimeError(f'o alinhador leu “{texto}” onde está “{palavras[k]["texto"]}” ({palavras[k]["id"]})')
        out[k]['inicio'], out[k]['fim'] = round(inicio, 3), round(fim, 3)
    for k, w in enumerate(out):
        if not comum.norm(w['texto']):
            ant = out[k - 1]['fim'] if k else 0.0
            prox = out[k + 1]['inicio'] if k + 1 < len(out) else ant + 0.02
            w['inicio'], w['fim'] = round(ant, 3), round(max(prox, ant + 0.02), 3)
    return out


def contiguo(palavras: list[dict], pausa: float = 0.25) -> list[dict]:
    """Fala contínua: o fim de cada palavra vai até o começo da próxima, se o vão for menor que `pausa`.
    Corrige palavras curtas com duração ~0 (o CTC trabalha em quadros de 20 ms)."""
    out = [dict(p) for p in palavras]
    for a, b in zip(out, out[1:]):
        if 0 <= b['inicio'] - a['fim'] < pausa or b['inicio'] < a['fim']:
            a['fim'] = round(max(b['inicio'], a['inicio'] + 0.02), 3)
    return out


_modelos: dict = {}


def _modelo_mlx(nome: str):
    """Modelos do mlx-audio ficam carregados entre execuções (carregar leva até um minuto)."""
    from mlx_audio.stt import load

    if nome not in _modelos:
        _modelos[nome] = load(nome)
    return _modelos[nome]


def _gravar_wav(arquivo: Path, amostras: np.ndarray, taxa: int) -> None:
    with wave.open(str(arquivo), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes((amostras * 32767).astype(np.int16).tobytes())


def alinhar_qwen(audio: Path, palavras: list[dict]) -> list[dict]:
    """Qwen3-ForcedAligner (mlx-audio, 8 bits): alinha o texto do Whisper ao áudio. Local e rápido (~1 s).
    NÃO transcreve: recebe o texto pronto e só calcula os tempos."""
    itens = _modelo_mlx(QWEN_ALINHADOR).generate(str(audio), text=' '.join(p['texto'] for p in palavras), language='Portuguese')
    return mapear_por_nucleo(palavras, [(i.text, i.start_time, i.end_time) for i in itens])


def transcrever_qwen_asr(audio: Path, silencios: list[dict]) -> list[dict]:
    """Qwen3-ASR 1,7B transcreve, e o Qwen3-ForcedAligner dá os tempos, pedaço por pedaço (entre as pausas): o texto de
    cada pedaço só é alinhado ao áudio dele, então um erro de um trecho não desalinha o resto."""
    amostras, taxa = _amostras(audio)
    asr, alinhador = _modelo_mlx(QWEN_ASR), _modelo_mlx(QWEN_ALINHADOR)
    palavras: list[dict] = []
    with tempfile.TemporaryDirectory() as pasta:
        for k, (a, b) in enumerate(transcricao.pedacos(silencios, len(amostras) / taxa)):
            arq = Path(pasta) / f'{k}.wav'
            _gravar_wav(arq, amostras[int(a * taxa):int(b * taxa)], taxa)
            texto = asr.generate(str(arq), language='Portuguese').text.strip()
            if not texto:
                continue
            fichas = [{'texto': w, 'inicio': 0.0, 'fim': 0.0} for w in texto.split()]
            itens = alinhador.generate(str(arq), text=texto, language='Portuguese')
            alinhadas = mapear_por_nucleo(fichas, [(i.text, i.start_time, i.end_time) for i in itens])
            palavras += [{'texto': w['texto'], 'inicio': w['inicio'] + a, 'fim': w['fim'] + a} for w in alinhadas]
    return [{'id': f'w{i:05d}', 'texto': w['texto'], 'inicio': round(w['inicio'], 3), 'fim': round(w['fim'], 3)} for i, w in enumerate(palavras)]


def transcrever_whisper_v3(audio: Path, silencios: list[dict]) -> list[dict]:
    """Whisper large-v3 completo (mais lento e, em geral, mais completo que o turbo), refinado pelo stable-ts."""
    palavras = transcricao.transcrever(audio, silencios, modelo=WHISPER_V3)
    return transcricao.refinar(audio, palavras, modelo=WHISPER_V3)[0]


def alinhar_ctc(audio: Path, palavras: list[dict]) -> list[dict]:
    """ctc-forced-aligner (MMS, ONNX): alinha o texto do Whisper ao áudio. O modelo vem de um repositório de terceiros
    no Hugging Face (deskpai/ctc_forced_aligner) na primeira vez."""
    from ctc_forced_aligner import AlignmentSingleton, generate_emissions, get_alignments, get_spans, postprocess_results, preprocess_text

    amostras, _ = _amostras(audio)
    s = AlignmentSingleton()
    tokens, texto_marcado = preprocess_text(' '.join(p['texto'] for p in palavras), romanize=True, language='por')
    emissoes, passo = generate_emissions(s.alignment_model, amostras)
    segmentos, notas, vazio = get_alignments(emissoes, tokens, s.alignment_tokenizer)
    res = postprocess_results(texto_marcado, get_spans(tokens, segmentos, vazio), passo, notas)
    if len(res) != len(palavras):
        raise RuntimeError(f'o alinhador devolveu {len(res)} palavras para {len(palavras)}')
    return contiguo([{**p, 'inicio': round(r['start'], 3), 'fim': round(r['end'], 3)} for p, r in zip(palavras, res)])


def _palavras_parakeet(tokens, deslocamento: float = 0.0) -> list[dict]:
    out: list[dict] = []
    for t in tokens:
        if not out or t.text.startswith(' '):
            out.append({'texto': t.text.strip(), 'inicio': t.start + deslocamento, 'fim': t.end + deslocamento})
        else:
            out[-1]['texto'] += t.text
            out[-1]['fim'] = t.end + deslocamento
    return [p for p in out if p['texto']]


def transcrever_parakeet(audio: Path, silencios: list[dict]) -> list[dict]:
    """Parakeet TDT v3 (parakeet-mlx), por pedaços entre as pausas: no áudio inteiro ele funde e "limpa" as retomadas."""
    from parakeet_mlx import from_pretrained

    amostras, taxa = _amostras(audio)
    modelo = from_pretrained('mlx-community/parakeet-tdt-0.6b-v3')
    palavras: list[dict] = []
    with tempfile.TemporaryDirectory() as pasta:
        for k, (a, b) in enumerate(transcricao.pedacos(silencios, len(amostras) / taxa)):
            arq = Path(pasta) / f'{k}.wav'
            _gravar_wav(arq, amostras[int(a * taxa):int(b * taxa)], taxa)
            try:
                palavras += _palavras_parakeet(modelo.transcribe(str(arq)).tokens, a)
            except ValueError:  # pedaço curto demais para o modelo
                continue
    return [{'id': f'w{i:05d}', 'texto': p['texto'], 'inicio': round(p['inicio'], 3), 'fim': round(p['fim'], 3)} for i, p in enumerate(palavras)]


def transcrever_elevenlabs(audio: Path) -> list[dict]:
    """ElevenLabs Scribe v2 (API). Envia o áudio da voz a um terceiro: só roda com ELEVENLABS_API_KEY em backend/.env."""
    import httpx

    with audio.open('rb') as f:
        r = httpx.post(
            'https://api.elevenlabs.io/v1/speech-to-text',
            headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY']},
            data={'model_id': 'scribe_v2', 'language_code': 'por', 'timestamps_granularity': 'word', 'tag_audio_events': 'false', 'diarize': 'false'},
            files={'file': (audio.name, f, 'audio/wav')},
            timeout=300,
        )
    if r.status_code >= 400:
        raise RuntimeError(f'ElevenLabs respondeu {r.status_code}: {r.text[:200]}')
    palavras = [w for w in r.json().get('words', []) if w.get('type') == 'word']
    return [{'id': f'w{i:05d}', 'texto': w['text'].strip(), 'inicio': round(float(w['start']), 3), 'fim': round(float(w['end']), 3)} for i, w in enumerate(palavras)]


def rodar(vid: str, audio: Path, whisper: list[dict] | None, silencios: list[dict]) -> list[dict]:
    """`whisper` são as palavras do Whisper puro (só os alinhadores precisam delas)."""
    if vid == 'whisper':
        return transcricao.transcrever(audio, silencios)
    if vid == 'whisper-qwen':
        return alinhar_qwen(audio, whisper)
    if vid == 'whisper-ctc':
        return alinhar_ctc(audio, whisper)
    if vid == 'parakeet':
        return transcrever_parakeet(audio, silencios)
    if vid == 'qwen-asr':
        return transcrever_qwen_asr(audio, silencios)
    if vid == 'whisper-v3':
        return transcrever_whisper_v3(audio, silencios)
    if vid == 'elevenlabs':
        return transcrever_elevenlabs(audio)
    raise ValueError(f'motor desconhecido: {vid}')
