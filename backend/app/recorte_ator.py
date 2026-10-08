"""Recorte do ator (SPEC §8.4, divisão da tela): a silhueta da pessoa no vídeo bruto, quadro a quadro, para a cabeça e os
ombros passarem por cima do insert quando o ator fica pequeno (divisão 56/44 e "insert atrás"). Roda uma vez por
projeto, em segundo plano, sobre o proxy (720×1280, a mesma linha do tempo do bruto), com o segmentador de selfie do
MediaPipe (local, sem serviço pago). Saídas em `midia/recorte/`:
- `<bruto>_mascara.mp4`: a máscara em cinza (branco = pessoa), com a borda macia; a exportação usa sobre o bruto.
- `<bruto>_pessoa.webm`: só a pessoa, com transparência (VP9 com alfa), para a prévia no navegador."""
import subprocess
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import projeto

MODELO = Path(__file__).resolve().parents[2] / 'modelos' / 'selfie_segmenter.tflite'
_fila = ThreadPoolExecutor(max_workers=1)
_trava = threading.Lock()


def pasta(id: str) -> Path:
    return projeto.pasta(id) / 'midia' / 'recorte'


def arquivos(id: str, bruto: str) -> tuple[Path, Path]:
    return pasta(id) / f'{bruto}_mascara.mp4', pasta(id) / f'{bruto}_pessoa.webm'


def _marcar(id: str, **campos) -> None:
    with _trava:
        projeto.atualizar(id, lambda p: p.setdefault('recorte', {}).update(campos))


def retomar_interrompidos() -> None:
    """Se o servidor caiu no meio, recomeça os recortes que ficaram na fila ou rodando."""
    for resumo in projeto.listar():
        r = projeto.ler(resumo['id']).get('recorte') or {}
        if r.get('estado') in ('fila', 'rodando'):
            _marcar(resumo['id'], estado='erro')
            pedir(resumo['id'])


def pedir(id: str) -> dict:
    """Põe o recorte na fila (se ainda não foi feito ou falhou)."""
    p = projeto.ler(id)
    r = p.get('recorte') or {}
    if r.get('estado') in ('fila', 'rodando', 'pronto'):
        return r
    _marcar(id, estado='fila', progresso=0, erro=None)
    _fila.submit(_rodar, id)
    return projeto.ler(id)['recorte']


def _bruto(p: dict) -> tuple[str, Path]:
    f = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    return f['id'], projeto.pasta(p['id']) / 'midia' / 'proxy' / f'{f["id"]}.mp4'


def _rodar(id: str) -> None:
    try:
        _marcar(id, estado='rodando')
        p = projeto.ler(id)
        bid, proxy = _bruto(p)
        mascara, pessoa = arquivos(id, bid)
        mascara.parent.mkdir(parents=True, exist_ok=True)
        _baixar_modelo()
        _segmentar(proxy, mascara, lambda f: _marcar(id, progresso=round(f * 0.8, 3)))
        _pessoa(proxy, mascara, pessoa)
        _marcar(id, estado='pronto', progresso=1, bruto=bid)
    except Exception as e:
        traceback.print_exc()
        _marcar(id, estado='erro', erro=str(e)[:300])


def _baixar_modelo() -> None:
    """O modelo (250 KB, do MediaPipe) fica fora do git: baixa na primeira vez."""
    if MODELO.exists():
        return
    import urllib.request
    MODELO.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/'
                               'selfie_segmenter.tflite', MODELO)


def _segmentar(video: Path, destino: Path, progresso) -> None:
    """A máscara quadro a quadro: confiança do segmentador, suavizada no tempo (sem tremer), uma rampa estreita em volta
    de 0,5 (borda definida) e um desfoque leve (a borda macia que mistura com o insert)."""
    import cv2
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks.python import BaseOptions, vision

    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    opcoes = vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=str(MODELO)),
                                          running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True)
    sai = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{w}x{h}', '-r', f'{fps}',
                            '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'veryfast', str(destino)],
                           stdin=subprocess.PIPE)
    anterior = None
    with vision.ImageSegmenter.create_from_options(opcoes) as seg:
        k = 0
        while True:
            ok, f = cap.read()
            if not ok:
                break
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
            conf = seg.segment_for_video(img, int(k * 1000 / fps)).confidence_masks[0].numpy_view()
            m = cv2.resize(conf, (w, h), interpolation=cv2.INTER_LINEAR)
            anterior = m if anterior is None else 0.6 * m + 0.4 * anterior
            a = np.clip((anterior - 0.35) / 0.3, 0, 1)
            a = cv2.GaussianBlur(a, (0, 0), 2.5)
            sai.stdin.write((a * 255).astype(np.uint8).tobytes())
            k += 1
            if k % 48 == 0:
                progresso(min(k / total, 1))
    sai.stdin.close()
    if sai.wait():
        raise RuntimeError('ffmpeg (máscara) falhou')


def _pessoa(video: Path, mascara: Path, destino: Path) -> None:
    """Só a pessoa, com transparência, em VP9 com alfa (o navegador toca por cima do insert)."""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-i', str(mascara), '-filter_complex',
                        '[1:v]format=gray[m];[0:v][m]alphamerge,scale=540:-2,format=yuva420p[v]', '-map', '[v]', '-an',
                        '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1',
                        '-auto-alt-ref', '0', str(destino)], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f'ffmpeg (pessoa) falhou: {r.stderr[-300:]}')
