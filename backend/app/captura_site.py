"""Captura de site para um insert (SPEC §8.3): o criador dá a URL, a proporção e marca até 3 dobras numa imagem da página
inteira; o app grava cada dobra em tempo real (a 1ª desde a página em branco, para pegar as animações de entrada; as
outras com a página recarregada e o pulo direto até a dobra) e cada gravação vira uma mídia do banco, ligada ao insert."""
import shutil
import tempfile
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from . import inserts, projeto

# proporção → janela (largura e altura em px de CSS, celular?); densidade 2× na gravação
JANELAS = {'16:9': (1440, 810, False), '4:3': (1200, 900, False), '1:1': (1080, 1080, False), '9:16': (390, 693, True)}
DENSIDADE = 2
FPS = 30
MAX_DOBRAS = 3
FOLGA = 2.0  # s além da duração do insert (para cortar depois com o ponto de início)
ALTURA_MAXIMA_PREVIA = 16_000
UA_CELULAR = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) '
              'Version/17.5 Mobile/15E148 Safari/604.1')
# botões de aceitar cookies mais comuns (texto exato, sem diferenciar maiúsculas)
COOKIES = ('Accept all', 'Accept', 'Allow all', 'I agree', 'Got it', 'OK', 'Aceitar', 'Aceitar todos', 'Concordo', 'Entendi')

_fila = ThreadPoolExecutor(max_workers=1)  # uma captura por vez


def normalizar_url(url: str) -> str:
    url = (url or '').strip()
    if url and '://' not in url:
        url = 'https://' + url
    p = urlparse(url)
    if p.scheme not in ('http', 'https') or not p.netloc:
        raise ValueError('Endereço inválido')
    return url


def _contexto(browser, proporcao: str, densidade: int):
    w, h, celular = JANELAS[proporcao]
    return browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=densidade, is_mobile=celular, has_touch=celular,
                               user_agent=UA_CELULAR if celular else None, locale='pt-BR')


def fechar_cookies(page) -> None:
    for texto in COOKIES:
        try:
            botao = page.get_by_role('button', name=texto, exact=True)
            if botao.count() and botao.first.is_visible():
                botao.first.click(timeout=1000)
                page.wait_for_timeout(300)
                return
        except Exception:
            continue


def _pasta(id: str, cid: str) -> Path:
    return projeto.pasta(id) / 'capturas' / cid


# ---------------------------------------------------------------- prévia (para marcar as dobras)

def previa(id: str, url: str, proporcao: str) -> dict:
    """A página inteira numa imagem (densidade 1), para o criador clicar onde começa cada dobra."""
    from playwright.sync_api import sync_playwright

    url = normalizar_url(url)
    if proporcao not in JANELAS:
        raise ValueError('Proporção inválida')
    cid = uuid.uuid4().hex[:8]
    pasta = _pasta(id, cid)
    pasta.mkdir(parents=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            page = _contexto(browser, proporcao, 1).new_page()
            page.goto(url, wait_until='load', timeout=45_000)
            page.wait_for_timeout(1500)
            fechar_cookies(page)
            # rola até o fim (imagens preguiçosas e animações de rolagem) e volta ao topo
            altura = page.evaluate('() => document.documentElement.scrollHeight')
            janela = JANELAS[proporcao][1]
            for y in range(0, min(altura, ALTURA_MAXIMA_PREVIA), janela):
                page.evaluate(f'window.scrollTo(0, {y})')
                page.wait_for_timeout(150)
            page.evaluate('window.scrollTo(0, 0)')
            page.wait_for_timeout(600)
            altura = min(page.evaluate('() => document.documentElement.scrollHeight'), ALTURA_MAXIMA_PREVIA)
            page.screenshot(path=str(pasta / 'previa.jpg'), full_page=True, quality=80, type='jpeg',
                            clip={'x': 0, 'y': 0, 'width': JANELAS[proporcao][0], 'height': altura})
            titulo = page.title().strip()
        finally:
            browser.close()
    return {'id': cid, 'url': url, 'proporcao': proporcao, 'titulo': titulo or urlparse(url).netloc, 'altura_pagina': altura,
            'largura_janela': JANELAS[proporcao][0], 'altura_janela': JANELAS[proporcao][1]}


def arquivo_previa(id: str, cid: str) -> Path:
    return _pasta(id, cid) / 'previa.jpg'


# ---------------------------------------------------------------- captura (em segundo plano)

def _status(id: str, pid: str, **campos) -> None:
    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                x['captura'] = {**(x.get('captura') or {}), **campos}
    projeto.atualizar(id, aplicar)


def capturar(id: str, pid: str, url: str, proporcao: str, dobras: list[float], titulo: str | None = None) -> dict:
    """Põe a captura na fila. `dobras`: o topo de cada dobra em px de CSS (a 1ª é o topo da página)."""
    url = normalizar_url(url)
    if proporcao not in JANELAS:
        raise ValueError('Proporção inválida')
    ys = sorted({max(0, round(float(y))) for y in dobras})[:MAX_DOBRAS] or [0]
    pedido = next((x for x in (projeto.ler(id).get('inserts') or {}).get('pedidos', []) if x['id'] == pid), None)
    if pedido is None:
        raise LookupError('Pedido não encontrado')
    if (pedido.get('captura') or {}).get('status') in ('fila', 'rodando'):
        raise ValueError('Já há uma captura em andamento neste insert')
    duracao = round(pedido['duracao'] + FOLGA, 2)
    _status(id, pid, status='fila', url=url, proporcao=proporcao, dobras=ys, feitas=0, erro=None, duracao=duracao)
    _fila.submit(_rodar, id, pid, url, proporcao, ys, duracao, titulo or urlparse(url).netloc)
    return inserts.sincronizar(id)


def _rodar(id: str, pid: str, url: str, proporcao: str, ys: list[int], duracao: float, titulo: str) -> None:
    tmp = Path(tempfile.mkdtemp())
    try:
        _status(id, pid, status='rodando')
        for k, y in enumerate(ys):
            saida = tmp / f'dobra{k + 1}.mp4'
            gravar(url, proporcao, y, duracao, saida, do_carregamento=(k == 0 and y == 0))
            nome = f'{titulo} · dobra {k + 1}' if len(ys) > 1 else titulo
            item = inserts.subir(saida, f'{nome}.mp4', fonte={'tipo': 'captura de site', 'url': url, 'proporcao': proporcao, 'dobra': y})

            def ligar(p, bid=item['id']):
                for x in (p.get('inserts') or {}).get('pedidos', []):
                    if x['id'] == pid:
                        x['midias'] = [*(x.get('midias') or []), {'id': uuid.uuid4().hex[:8], 'banco': bid}]
                        x['captura'] = {**(x.get('captura') or {}), 'feitas': k + 1}
            projeto.atualizar(id, ligar)
        _status(id, pid, status='pronto')
    except Exception as e:
        traceback.print_exc()
        try:
            _status(id, pid, status='erro', erro=str(e)[:300])
        except Exception:
            pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def gravar(url: str, proporcao: str, y: int, duracao: float, saida: Path, do_carregamento: bool) -> None:
    """Grava uma dobra em tempo real (screencast do Chrome com GPU), a 30 quadros/s constantes e densidade 2× (3× no
    celular). Antes, uma visita de aquecimento fecha o banner de cookies e deixa a rede quente; a gravação abre uma aba
    nova (sem o estado da página, só com os cookies). Do carregamento: o vídeo começa no 1º quadro pintado. Dobra: a página
    carrega sem gravar, pula direto até `y` e grava parada."""
    import asyncio
    asyncio.run(_gravar(url, proporcao, y, duracao, saida, do_carregamento))


async def _gravar(url: str, proporcao: str, y: int, duracao: float, saida: Path, do_carregamento: bool) -> None:
    import asyncio
    import base64
    import time

    from playwright.async_api import async_playwright

    w, h, celular = JANELAS[proporcao]
    dpr = 3 if celular else DENSIDADE
    quadros: list[tuple[float, bytes]] = []
    async with async_playwright() as pw:
        # channel 'chromium' = headless novo, com GPU (Metal); a densidade precisa ser real, senão o screencast sai em 1×
        browser = await pw.chromium.launch(channel='chromium', args=[
            '--force-color-profile=srgb', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', f'--force-device-scale-factor={dpr}'])
        try:
            ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=celular, has_touch=celular,
                                            user_agent=UA_CELULAR if celular else None, locale='pt-BR')
            # aquecimento: cookies aceitos, rede e cache quentes; o estado da página (intro já vista etc.) é limpo
            aquece = await ctx.new_page()
            try:
                await aquece.goto(url, wait_until='load', timeout=45_000)
                await aquece.wait_for_timeout(1500)
                await _fechar_cookies_async(aquece)
                await aquece.evaluate("""() => { for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s))
                    if (!/consent|cookie|gdpr/i.test(k)) s.removeItem(k) }""")
            except Exception:
                pass
            await aquece.close()

            page = await ctx.new_page()
            cdp = await ctx.new_cdp_session(page)
            await cdp.send('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': celular})

            def quadro(ev):
                quadros.append((ev['metadata']['timestamp'], base64.b64decode(ev['data'])))
                asyncio.ensure_future(cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']}))
            cdp.on('Page.screencastFrame', quadro)

            async def ligar():
                await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 100, 'maxWidth': w * dpr, 'maxHeight': h * dpr, 'everyNthFrame': 1})

            if do_carregamento:
                await ligar()
                await asyncio.sleep(0.3)
                antes = len(quadros)  # os quadros do about:blank ficam de fora
                t_nav = time.time()
                await page.goto(url, wait_until='commit', timeout=60_000)
                limite = time.time() + 15
                while len(quadros) == antes and time.time() < limite:  # espera o 1º quadro pintado do site
                    await asyncio.sleep(0.02)
                if len(quadros) == antes:
                    raise RuntimeError('O site não pintou nada em 15 s')
                t0 = max(quadros[antes][0], t_nav)
                await asyncio.sleep(max(0.0, duracao - (time.time() - t0)) + 0.3)
            else:
                await page.goto(url, wait_until='load', timeout=60_000)
                await asyncio.sleep(2.5)
                await _fechar_cookies_async(page)
                await ligar()
                await asyncio.sleep(0.3)
                await page.evaluate("""(y) => {
                    document.documentElement.style.scrollBehavior = 'auto';
                    if (window.lenis?.scrollTo) window.lenis.scrollTo(y, {immediate: true, force: true});
                    window.scrollTo({top: y, left: 0, behavior: 'instant'});
                    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
                }""", y)
                depois = time.time()  # os quadros daqui em diante já mostram a dobra
                await asyncio.sleep(duracao + 0.5)
                t0 = min((t for t, _ in quadros if t >= depois), default=depois)
            await cdp.send('Page.stopScreencast')
        finally:
            await browser.close()

    # 30 quadros/s constantes: em cada tique, o último quadro chegado até ali
    seq = sorted((q for q in quadros), key=lambda q: q[0])
    n = round(duracao * FPS)
    escolhidos, j = [], 0
    while j + 1 < len(seq) and seq[j + 1][0] <= t0:
        j += 1
    for k in range(n):
        tique = t0 + k / FPS
        while j + 1 < len(seq) and seq[j + 1][0] <= tique:
            j += 1
        escolhidos.append(seq[j][1])
    import subprocess
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-i', '-',
                           '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709',
                           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', str(saida)],
                          stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    for q in escolhidos:
        ff.stdin.write(q)
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError(f'ffmpeg falhou: {ff.stderr.read().decode()[-300:]}')


async def _fechar_cookies_async(page) -> None:
    for texto in COOKIES:
        try:
            botao = page.get_by_role('button', name=texto, exact=True)
            if await botao.count() and await botao.first.is_visible():
                await botao.first.click(timeout=1000)
                await page.wait_for_timeout(300)
                return
        except Exception:
            continue


def retomar_interrompidas() -> None:
    """Capturas que estavam na fila ou rodando quando o servidor parou: viram erro (dá para pedir de novo)."""
    for r in projeto.listar():
        try:
            p = projeto.ler(r['id'])
        except FileNotFoundError:
            continue
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if (x.get('captura') or {}).get('status') in ('fila', 'rodando'):
                _status(p['id'], x['id'], status='erro', erro='Interrompida (o servidor reiniciou): capture de novo')
