"""Inspeção de mídia com ffprobe."""
import json
import subprocess
from pathlib import Path


def inspecionar(arquivo: Path) -> dict:
    """Duração e dimensões como o espectador vê (já aplicando a rotação do metadado)."""
    saida = subprocess.run(
        ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(arquivo)],
        capture_output=True, text=True, check=True,
    ).stdout
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
