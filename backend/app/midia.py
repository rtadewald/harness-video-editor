"""Inspeção de mídia com ffprobe."""
import json
import re
import subprocess
import sys
import wave
from collections.abc import Callable
from pathlib import Path


class ErroMidia(RuntimeError):
    """Um ffmpeg/ffprobe que falhou, dito para gente (SPEC §4, "erro legível"): a linha de comando e a saída crua ficam
    só no log do servidor."""


def _rodar(cmd: list[str], msg: str) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(f'[midia] {msg}\n  {" ".join(cmd)}\n  {r.stderr.strip()[-800:]}', file=sys.stderr)
        raise ErroMidia(msg)
    return r


def legivel(e: Exception) -> str:
    """A mensagem de um erro para a tela: um ffmpeg/ffprobe chamado direto (`check=True`) não mostra a linha de comando."""
    if isinstance(e, subprocess.CalledProcessError):
        programa = Path(str(e.cmd[0])).name if e.cmd else 'ffmpeg'
        saida = e.stderr.strip() if isinstance(e.stderr, str) else ''
        return f'O {programa} falhou' + (f': {saida[-300:]}' if saida else f' (código {e.returncode}).')
    return str(e)


def ffmpeg(*args: str) -> None:
    """Roda o ffmpeg (sem perguntar, só erros); se falhar, o erro diz o código e o fim da mensagem."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'ffmpeg (código {r.returncode}): {r.stderr.strip()[-400:] or "sem mensagem; o processo pode ter sido interrompido"}')


def medidas(arq: Path) -> dict:
    """Largura, altura e duração (0 numa imagem) de um vídeo ou imagem gerados pelo app (sem metadado de rotação)."""
    r = _rodar(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration',
                '-of', 'json', str(arq)], 'Não consegui ler a mídia (formato não suportado ou arquivo corrompido).')
    d = json.loads(r.stdout)
    s = (d.get('streams') or [{}])[0]
    try:
        duracao = round(float(d['format']['duration']), 3)
    except (KeyError, ValueError):
        duracao = 0.0
    return {'largura': s.get('width'), 'altura': s.get('height'), 'duracao': duracao if Path(arq).suffix != '.jpg' else 0.0}


def inspecionar(arquivo: Path) -> dict:
    """Duração e dimensões como o espectador vê (já aplicando a rotação do metadado)."""
    saida = _rodar(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(arquivo)],
                   'Não consegui ler o vídeo (formato não suportado ou arquivo corrompido).').stdout
    dados = json.loads(saida)
    video = next((s for s in dados['streams'] if s['codec_type'] == 'video'), None)
    info = {
        'duracao': round(float(dados['format'].get('duration', 0)), 3),
        'tem_audio': any(s['codec_type'] == 'audio' for s in dados['streams']),
    }
    if video:
        w, h = video['width'], video['height']
        rotacao = next((int(d.get('rotation', 0)) for d in video.get('side_data_list', []) if 'rotation' in d), 0)
        if abs(rotacao) % 180 == 90:
            w, h = h, w
        info |= {'largura': w, 'altura': h, 'fps': video.get('avg_frame_rate')}
    return info


def miniatura(video: Path, destino: Path, duracao: float) -> None:
    """Um quadro do vídeo em JPEG pequeno, para a lista de projetos."""
    _rodar(['ffmpeg', '-v', 'error', '-y', '-ss', str(min(1.0, duracao / 2)), '-i', str(video),
            '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', str(destino)], 'Não consegui tirar a miniatura do vídeo.')


def proxy(video: Path, destino: Path, duracao: float, progresso: Callable[[float], None]) -> None:
    """Cópia leve para o player: lado menor 720 px, H.264 por hardware, um keyframe a cada 0,5 s
    (o player salta muito entre trechos). Mantém a linha do tempo do bruto."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    escala = "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'"
    cmd = ['ffmpeg', '-v', 'error', '-y', '-hwaccel', 'videotoolbox', '-i', str(video), '-vf', escala,
           '-c:v', 'h264_videotoolbox', '-b:v', '3M', '-force_key_frames', 'expr:gte(t,n_forced*0.5)',
           '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', str(destino)]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as proc:
        for linha in proc.stdout:
            if linha.startswith('out_time_us=') and linha.strip()[12:].isdigit():
                progresso(min(int(linha.strip()[12:]) / 1e6 / max(duracao, 0.1), 1))
        erro = proc.stderr.read()
    if proc.returncode:
        raise RuntimeError(f'ffmpeg (proxy) falhou: {erro[-500:]}')


def extrair_audio(video: Path, destino: Path) -> None:
    """WAV mono 16 kHz para o Whisper, preservando o atraso inicial do áudio (first_pts=0)."""
    _rodar(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vn', '-af', 'aresample=16000:async=1:first_pts=0',
            '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(destino)],
           'Não consegui extrair o áudio do vídeo (ele tem trilha de áudio?).')


def silencios(audio: Path, db: float = -35, minimo: float = 0.3) -> list[dict]:
    """Silêncios reais (silencedetect). O que vai até o fim do arquivo não tem fim e fica de fora."""
    log = _rodar(['ffmpeg', '-hide_banner', '-nostats', '-i', str(audio), '-af', f'silencedetect=n={db}dB:d={minimo}',
                  '-f', 'null', '-'], 'Não consegui medir as pausas do áudio.').stderr
    inicios = [max(float(x), 0) for x in re.findall(r'silence_start: (-?[\d.]+)', log)]
    fins = re.findall(r'silence_end: ([\d.]+) \| silence_duration: ([\d.]+)', log)
    return [{'inicio': round(s, 3), 'fim': float(e), 'dur': float(d)} for s, (e, d) in zip(inicios, fins)]


PICOS_POR_SEGUNDO = 200  # um pico a cada 5 ms: dá para ver milissegundos com zoom


def picos(audio: Path, por_segundo: int = PICOS_POR_SEGUNDO) -> list[int]:
    """Forma de onda real: amplitude máxima a cada 1/por_segundo s, em 0–255. Usa a raiz da amplitude
    para a fala baixa aparecer ao lado da alta."""
    import numpy as np

    with wave.open(str(audio), 'rb') as w:
        taxa = w.getframerate()
        x = np.abs(np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)) / 32768
    janela = taxa // por_segundo
    n = len(x) // janela
    maximos = x[:n * janela].reshape(n, janela).max(axis=1)
    return np.round(np.sqrt(maximos) * 255).astype(int).tolist()
