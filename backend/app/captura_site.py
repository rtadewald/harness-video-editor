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

from . import inserts, midia, projeto

# proporção → janela de computador (largura e altura em px de CSS) e densidade na gravação. A 9:16 é um computador em
# pé (nunca a versão de celular, que mostra pouco): 1200 px de largura pega o layout desktop; 1,8× → 2160×3840
JANELAS = {'16:9': (1440, 810), '4:3': (1200, 900), '1:1': (1080, 1080), '9:16': (1200, 2133)}
DENSIDADE = {'9:16': 1.8}  # as outras: 2×
FPS = 30
MAX_DOBRAS = 3
DURACAO_PADRAO = 5.0  # s por dobra (o criador escolhe de 1 a 30 s; animações de entrada às vezes levam mais de 3 s)
ALTURA_MAXIMA_PREVIA = 16_000
# botões de aceitar cookies mais comuns (texto exato, sem diferenciar maiúsculas)
COOKIES = ('Accept all', 'Accept', 'Allow all', 'I agree', 'Got it', 'OK', 'Aceitar', 'Aceitar todos', 'Concordo', 'Entendi')

_fila = ThreadPoolExecutor(max_workers=3)  # até 3 capturas ao mesmo tempo (o resto espera na fila)


def normalizar_url(url: str) -> str:
    url = (url or '').strip()
    if url and '://' not in url:
        url = 'https://' + url
    p = urlparse(url)
    if p.scheme not in ('http', 'https') or not p.netloc:
        raise ValueError('Endereço inválido')
    return url


def _contexto(browser, proporcao: str, densidade: int):
    w, h = JANELAS[proporcao]
    return browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=densidade, locale='pt-BR')


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


# o site de verdade está num iframe que ocupa a tela (ex.: as galerias do ds.asimov.academy): a página de fora não rola
IFRAME_DA_TELA = """() => {
    const d = document.documentElement
    if (d.scrollHeight > innerHeight + 20) return null
    const f = [...document.querySelectorAll('iframe')].find(f => {
        const r = f.getBoundingClientRect()
        return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && f.src && f.src.startsWith('http')
    })
    return f ? f.src : null
}"""


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
        # o Chrome com GPU (Metal): no headless antigo o WebGL é desenhado em software e cada foto leva meio segundo
        browser = pw.chromium.launch(channel='chromium', args=['--hide-scrollbars', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'])
        try:
            page = _contexto(browser, proporcao, 1).new_page()
            titulo_fora = ''
            page.goto(url, wait_until='load', timeout=45_000)
            page.wait_for_timeout(800)
            dentro = page.evaluate(IFRAME_DA_TELA)
            titulo_fora = page.title().strip()
            if dentro:  # abre o iframe direto: é ele que rola e é ele que vai ser gravado
                url = dentro
                page.goto(url, wait_until='load', timeout=45_000)
                page.wait_for_timeout(800)
            fechar_cookies(page)
            # tela por tela: rola, espera as animações de entrada (as de rolagem só tocam com a seção na tela) e fotografa;
            # a foto da página inteira de uma vez pega as seções ainda escondidas
            w, janela = JANELAS[proporcao][0], JANELAS[proporcao][1]
            page.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
            telas, y = [], 0
            while len(telas) * janela < ALTURA_MAXIMA_PREVIA:
                real = page.evaluate("""(y) => { if (window.lenis?.scrollTo) window.lenis.scrollTo(y, {immediate: true, force: true});
                    window.scrollTo({top: y, behavior: 'instant'}); return Math.round(window.scrollY) }""", y)
                page.wait_for_timeout(300)  # o bastante para o conteúdo aparecer (a prévia só serve para marcar as dobras)
                arq = pasta / f'tela{len(telas):02d}.jpg'
                page.screenshot(path=str(arq), type='jpeg', quality=85)
                telas.append((real, arq))
                if len(telas) == 1:  # cabeçalhos e botões fixos: só na 1ª tela (senão se repetem em todas)
                    page.evaluate("""() => { for (const e of document.querySelectorAll('body *')) {
                        const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') e.style.visibility = 'hidden' } }""")
                altura = page.evaluate('() => document.documentElement.scrollHeight')
                if real + janela >= altura or (len(telas) > 1 and real == telas[-2][0]):
                    break
                y += janela
            if len(telas) > 1 and telas[-1][0] == telas[-2][0]:
                telas.pop()
            # empilha: cada tela no seu lugar (a última pode ter parado antes, no fim da página: só a parte nova entra)
            entradas, filtros, partes = [], [], []
            altura = 0
            for k, (yk, arq) in enumerate(telas):
                topo = yk if k == 0 else max(yk, telas[k - 1][0] + janela)
                corte = topo - yk + (topo - yk) % 2  # recortes pares (o JPEG em 4:2:0 não aceita meio pixel de cor)
                if janela - corte < 16:  # a última tela só acrescentou uns pixels: fica de fora
                    continue
                entradas += ['-i', str(arq)]
                filtros.append(f'[{len(partes)}:v]crop={w}:{janela - corte}:0:{corte}[t{len(partes)}]')
                partes.append(f'[t{len(partes)}]')
                altura += janela - corte
            # as telas podem vir em formatos de cor diferentes: a saída é sempre a do JPEG (yuvj420p)
            juntar = f"{''.join(partes)}vstack=inputs={len(partes)}" if len(partes) > 1 else '[t0]null'
            grafo = ';'.join(filtros) + f';{juntar},format=yuvj420p[v]'
            midia.ffmpeg(*entradas, '-filter_complex', grafo, '-map', '[v]', '-frames:v', '1', '-q:v', '4', '-strict', '-1', str(pasta / 'previa.jpg'))
            for _, arq in telas:
                arq.unlink(missing_ok=True)
            titulo = titulo_fora or page.title().strip()
        finally:
            browser.close()
    return {'id': cid, 'url': url, 'proporcao': proporcao, 'titulo': titulo or urlparse(url).netloc, 'altura_pagina': altura,
            'largura_janela': JANELAS[proporcao][0], 'altura_janela': JANELAS[proporcao][1]}


def arquivo_previa(id: str, cid: str) -> Path:
    return _pasta(id, cid) / 'previa.jpg'


# ---------------------------------------------------------------- captura (em segundo plano)

def capturas_do(x: dict) -> list[dict]:
    """As capturas de um insert (antes era uma só, em `captura`)."""
    return x.get('capturas') or ([{'id': 'antiga', **x['captura']}] if x.get('captura') else [])


def _status(id: str, pid: str, cid: str, **campos) -> None:
    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                x['capturas'] = [{**c, **campos} if c['id'] == cid else c for c in capturas_do(x)]
                x.pop('captura', None)
    projeto.atualizar(id, aplicar)


def capturar(id: str, pid: str, url: str, proporcao: str, dobras: list[float], titulo: str | None = None,
             duracao: float = DURACAO_PADRAO) -> dict:
    """Põe uma captura na fila (várias podem rodar ao mesmo tempo, no mesmo insert ou em outros). `dobras`: o topo de
    cada dobra em px de CSS (a 1ª é o topo da página)."""
    url = normalizar_url(url)
    if proporcao not in JANELAS:
        raise ValueError('Proporção inválida')
    ys = sorted({max(0, round(float(y))) for y in dobras})[:MAX_DOBRAS] or [0]
    duracao = round(max(1.0, min(float(duracao), 30.0)), 2)
    cid = uuid.uuid4().hex[:8]
    nova = {'id': cid, 'status': 'fila', 'url': url, 'proporcao': proporcao, 'dobras': ys, 'feitas': 0, 'erro': None, 'duracao': duracao}

    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                # as que já terminaram bem saem da lista; ficam as em andamento e as com erro (até a próxima)
                x['capturas'] = [*(c for c in capturas_do(x) if c['status'] in ('fila', 'rodando')), nova]
                x.pop('captura', None)
                return
        raise LookupError('Pedido não encontrado')
    projeto.atualizar(id, aplicar)
    _fila.submit(_rodar, id, pid, cid, url, proporcao, ys, duracao, titulo)
    return inserts.sincronizar(id)


def _rodar(id: str, pid: str, cid: str, url: str, proporcao: str, ys: list[int], duracao: float, titulo: str | None) -> None:
    tmp = Path(tempfile.mkdtemp())
    try:
        _status(id, pid, cid, status='rodando')
        for k, y in enumerate(ys):
            saida = tmp / f'dobra{k + 1}.mp4'
            visto = gravar(url, proporcao, y, duracao, saida, do_carregamento=(k == 0 and y == 0))
            titulo = titulo or visto or urlparse(url).netloc
            nome = f'{titulo} · dobra {k + 1}' if len(ys) > 1 else titulo
            item = inserts.subir(saida, f'{nome}.mp4', fonte={'tipo': 'captura de site', 'url': url, 'proporcao': proporcao, 'dobra': y})

            def ligar(p, bid=item['id'], feitas=k + 1):
                for x in (p.get('inserts') or {}).get('pedidos', []):
                    if x['id'] == pid:
                        x['midias'] = [*(x.get('midias') or []), {'id': uuid.uuid4().hex[:8], 'banco': bid}]
                        x['capturas'] = [{**c, 'feitas': feitas} if c['id'] == cid else c for c in capturas_do(x)]
            projeto.atualizar(id, ligar)
        _status(id, pid, cid, status='pronto')
    except Exception as e:
        traceback.print_exc()
        try:
            _status(id, pid, cid, status='erro', erro=str(e)[:300])
        except Exception:
            pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def gravar(url: str, proporcao: str, y: int, duracao: float, saida: Path, do_carregamento: bool) -> str:
    """Grava uma dobra em tempo real (screencast do Chrome com GPU), a 30 quadros/s constantes e densidade 2× (1,8× na
    9:16). Antes, uma visita de aquecimento fecha o banner de cookies e deixa a rede quente; a gravação abre uma aba
    nova (sem o estado da página, só com os cookies). Do carregamento: o vídeo começa no 1º quadro pintado. Dobra: a página
    carrega sem gravar, pula direto até `y` e grava parada."""
    import asyncio
    return asyncio.run(_gravar(url, proporcao, y, duracao, saida, do_carregamento))


async def _gravar(url: str, proporcao: str, y: int, duracao: float, saida: Path, do_carregamento: bool) -> str:
    import asyncio
    import base64
    import time

    from playwright.async_api import async_playwright

    w, h = JANELAS[proporcao]
    dpr = DENSIDADE.get(proporcao, 2)
    quadros: list[tuple[float, bytes]] = []
    async with async_playwright() as pw:
        # channel 'chromium' = headless novo, com GPU (Metal); a densidade precisa ser real, senão o screencast sai em 1×
        browser = await pw.chromium.launch(channel='chromium', args=[
            '--force-color-profile=srgb', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', f'--force-device-scale-factor={dpr}'])
        try:
            ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, locale='pt-BR')
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
            await cdp.send('Emulation.setDeviceMetricsOverride', {'width': w, 'height': h, 'deviceScaleFactor': dpr, 'mobile': False})

            async def confirmar(sid):
                try:
                    await cdp.send('Page.screencastFrameAck', {'sessionId': sid})
                except Exception:  # o navegador fechou com uma confirmação ainda a caminho
                    pass

            def quadro(ev):
                quadros.append((ev['metadata']['timestamp'], base64.b64decode(ev['data'])))
                asyncio.ensure_future(confirmar(ev['sessionId']))
            cdp.on('Page.screencastFrame', quadro)

            async def ligar():
                await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 100, 'maxWidth': round(w * dpr), 'maxHeight': round(h * dpr), 'everyNthFrame': 1})

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
            titulo = (await page.title()).strip()
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
    return titulo


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
            for c in capturas_do(x):
                if c['status'] in ('fila', 'rodando'):
                    _status(p['id'], x['id'], c['id'], status='erro', erro='Interrompida (o servidor reiniciou): capture de novo')
