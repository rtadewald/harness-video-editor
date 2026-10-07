"""Trabalhador da exportação (SPEC §13): um processo com um navegador escondido na página de render, que fotografa pedaços
da camada dos inserts e grava cada pedaço num clipe ProRes 4444 (com transparência, pelo chip de vídeo do Mac). Vários
rodam em paralelo. Módulo leve de propósito: não importa o resto do app, para cada processo subir rápido."""
import base64
import re
import subprocess
from io import BytesIO

_pagina = None
_cdp = None


def iniciar(url: str, w: int, h: int) -> None:
    """Abre o navegador deste processo (uma vez; fica aberto para todos os pedaços que ele pegar)."""
    global _pagina, _cdp
    from playwright.sync_api import sync_playwright

    pw = sync_playwright().start()
    browser = pw.chromium.launch(channel='chromium', args=[
        '--force-color-profile=srgb', '--hide-scrollbars', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'])
    # a janela tem o tamanho do vídeo; a página amplia o desenho da prévia (540 px de largura) com zoom
    _pagina = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
    # o websocket do Vite fica mudo: um aviso do servidor de desenvolvimento recarregava a página no meio
    _pagina.route_web_socket(re.compile('.*'), lambda ws: None)
    _pagina.goto(url, wait_until='load', timeout=60_000)
    _pagina.wait_for_function('() => !!window.__render', timeout=60_000)
    _cdp = _pagina.context.new_cdp_session(_pagina)
    _cdp.send('Emulation.setDefaultBackgroundColorOverride', {'color': {'r': 0, 'g': 0, 'b': 0, 'a': 0}})


def _ir(t: float) -> str | None:
    """Leva a página ao instante `t`; devolve a chave do quadro quando ele é igual aos seguintes (insert parado)."""
    for tentativa in (1, 2):
        try:
            return _pagina.evaluate('(t) => window.__render.ir(t)', t)
        except Exception:  # a página recarregou: espera ela voltar
            if tentativa == 2:
                raise
            _pagina.wait_for_function('() => !!window.__render', timeout=60_000)


def _rgba(png: bytes, w: int, h: int) -> bytes:
    """O PNG em RGBA cru (o Chrome tira o alfa dos quadros todo opacos; o ffmpeg precisa do mesmo formato sempre)."""
    from PIL import Image
    img = Image.open(BytesIO(png)).convert('RGBA')
    return (img if img.size == (w, h) else img.resize((w, h), Image.LANCZOS)).tobytes()


def pedaco(args: tuple[list[int], int, int, int, str]) -> int:
    """Fotografa os quadros `quadros` (índices no vídeo final) e grava o clipe em `saida`. Devolve quantos fez."""
    quadros, fps, w, h, saida = args
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}',
                           '-framerate', str(fps), '-i', '-', '-c:v', 'prores_videotoolbox', '-profile:v', '4444', saida],
                          stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    anterior: tuple[str | None, bytes] = (None, b'')
    for q in quadros:
        chave = _ir(q / fps)
        if chave and chave == anterior[0]:
            cru = anterior[1]  # insert parado: o mesmo quadro de antes, sem fotografar
        else:
            png = base64.b64decode(_cdp.send('Page.captureScreenshot', {'format': 'png', 'optimizeForSpeed': True})['data'])
            cru = _rgba(png, w, h)
        ff.stdin.write(cru)
        anterior = (chave, cru)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError(f'ffmpeg (camada) falhou: {ff.stderr.read().decode(errors="replace")[-300:]}')
    return len(quadros)
