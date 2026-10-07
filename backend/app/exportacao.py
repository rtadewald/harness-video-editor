"""Exportação do vídeo final (SPEC §13): o ator e o áudio saem do bruto original pelo ffmpeg (cortes, recorte 9:16, fade
curto em cada emenda) e a camada dos inserts é a própria prévia, fotografada quadro a quadro por um navegador escondido
(`/render/p/<id>` do front), com o relógio parado em cada instante — sai igual ao que o criador aprova na tela, sem os
quadros perdidos da reprodução em tempo real. Vários navegadores fotografam em paralelo e o resto usa o chip de vídeo do
Mac, para ficar perto do tempo real. Roda em segundo plano, uma por projeto; o MP4 vai para `exports/`."""
import math
import multiprocessing
import os
import re
import shutil
import subprocess
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from . import inserts, projeto, render_quadros

RESOLUCOES = {'720p': (720, 1280), '1080p': (1080, 1920), '4k': (2160, 3840)}
FPS = (24, 30, 60)
CODECS = ('hevc', 'h264')
NAVEGADORES = 6  # navegadores fotografando em paralelo (padrão; o criador escolhe de 1 a 8 no modal)
FADE = 0.015  # s de fade do áudio em cada emenda, contra estalos
FRONT = os.environ.get('HARNESS_FRONT', 'http://localhost:5173')

_fila = ThreadPoolExecutor(max_workers=2)
_andamento: dict[str, dict] = {}  # id do projeto → {progresso, cancelar}
_trava = threading.Lock()


def pasta_exports(id: str) -> Path:
    return projeto.pasta(id) / 'exports'


def nome_padrao(p: dict, resolucao: str, fps: int, quando: datetime | None = None) -> str:
    quando = quando or datetime.now()
    return f"{p['nome']} · {quando:%Y-%m-%d %Hh%M} · {resolucao.replace('k', 'K')} {fps}"


def _limpar_nome(nome: str) -> str:
    nome = re.sub(r'[/\\:*?"<>|\n\r\t]+', ' ', nome or '').strip().strip('.')
    return re.sub(r'\s+', ' ', nome)[:120]


def estado(id: str) -> dict | None:
    """A última exportação do projeto, com o progresso ao vivo se estiver rodando."""
    e = projeto.ler(id).get('exportacao')
    if not e:
        return None
    vivo = _andamento.get(id)
    return {**e, 'progresso': vivo['progresso'] if vivo and e['status'] == 'rodando' else e.get('progresso', 0)}


def exportar(id: str, resolucao: str, fps: int, codec: str, nome: str | None = None, navegadores: int = NAVEGADORES) -> dict:
    if resolucao not in RESOLUCOES or fps not in FPS or codec not in CODECS or not 1 <= navegadores <= 8:
        raise ValueError('Opção de exportação inválida')
    p = projeto.ler(id)
    if not (p.get('timeline') or {}).get('V1'):
        raise ValueError('O projeto ainda não tem cortes para exportar')
    with _trava:
        if id in _andamento:
            raise ValueError('Já há uma exportação deste projeto em andamento')
        _andamento[id] = {'progresso': 0.0, 'cancelar': threading.Event()}
    nome = _limpar_nome(nome or '') or nome_padrao(p, resolucao, fps)
    e = {'status': 'rodando', 'progresso': 0.0, 'resolucao': resolucao, 'fps': fps, 'codec': codec, 'navegadores': navegadores, 'nome': nome,
         'arquivo': None, 'erro': None, 'inicio': datetime.now().isoformat(timespec='seconds'), 'fim': None}
    projeto.atualizar(id, lambda q: q.__setitem__('exportacao', e))
    _fila.submit(_rodar, id, e)
    return e


def cancelar(id: str) -> None:
    vivo = _andamento.get(id)
    if vivo:
        vivo['cancelar'].set()


def _fim(id: str, **campos) -> None:
    def mudar(q: dict) -> None:
        q['exportacao'] = {**(q.get('exportacao') or {}), **campos, 'fim': datetime.now().isoformat(timespec='seconds')}
    projeto.atualizar(id, mudar)


def retomar_interrompidas() -> None:
    """Exportações que estavam rodando quando o servidor parou viram erro (pede-se de novo); os pedaços ficam de fora."""
    for r in projeto.listar():
        try:
            p = projeto.ler(r['id'])
        except FileNotFoundError:
            continue
        if (p.get('exportacao') or {}).get('status') == 'rodando':
            _fim(p['id'], status='erro', erro='Interrompida (o servidor reiniciou): exporte de novo')
        for parte in pasta_exports(p['id']).glob('*.parte.*'):
            shutil.rmtree(parte, ignore_errors=True) if parte.is_dir() else parte.unlink(missing_ok=True)


def _ator(clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
          divididas: list[tuple[float, float]], duracao: float) -> list[str]:
    """Os filtros do ator e do áudio (entrada 0 = bruto): cada clipe da V1 vira um par vídeo + áudio (o áudio com fade curto
    nas pontas) e o concat mantém os dois juntos em cada emenda; depois, recorte 9:16, escala, fps de saída (o ator repete
    quadros, sem interpolar) e o ator descendo para a metade de baixo nas telas divididas. Saídas: [base] e [ac]."""
    n = len(clipes)
    partes = [f'[0:v]split={n}' + ''.join(f'[v{k}]' for k in range(n)), f'[0:a]asplit={n}' + ''.join(f'[a{k}]' for k in range(n))]
    pares = ''
    for k, c in enumerate(clipes):
        ini, fim = c['inicio'], c['fim']
        dur = fim - ini
        partes.append(f'[v{k}]trim=start={ini:.4f}:end={fim:.4f},setpts=PTS-STARTPTS[cv{k}]')
        partes.append(f'[a{k}]atrim=start={ini:.4f}:end={fim:.4f},asetpts=PTS-STARTPTS,'
                      f'afade=t=in:d={FADE},afade=t=out:st={max(dur - FADE, 0):.4f}:d={FADE}[ca{k}]')
        pares += f'[cv{k}][ca{k}]'
    partes.append(f'{pares}concat=n={n}:v=1:a=1[vc][ac]')
    recorte = f"crop=w=trunc(ih*9/16/2)*2:h=ih:x=(iw-ow)*{enquadramento_x:.4f}," if horizontal else ''
    partes.append(f'[vc]{recorte}scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},setsar=1,fps={fps}[ator]')
    # tela dividida: o ator desce um quarto da altura (o centro do quadro vai para o meio da metade de baixo)
    desce = '+'.join(f'between(t,{a:.4f},{b - 0.5 / fps:.4f})' for a, b in divididas) or '0'
    partes.append(f'color=c=black:s={w}x{h}:r={fps}:d={duracao:.4f}[tela]')
    partes.append(f"[tela][ator]overlay=x=0:y='if({desce},H/4,0)':eval=frame:shortest=1[base]")
    return partes


def comando_final(bruto: Path, clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
                  divididas: list[tuple[float, float]], camadas: list[tuple[Path, float]], codec: str, duracao: float,
                  saida: Path) -> list[str]:
    """Uma passada só: o ator e o áudio do bruto (decodificado pelo chip de vídeo) e, por cima, cada clipe da camada dos
    inserts (ProRes 4444 com transparência) no seu instante; codifica no chip de vídeo (HEVC ou H.264)."""
    partes = _ator(clipes, horizontal, enquadramento_x, w, h, fps, divididas, duracao)
    atual = 'base'
    entradas: list[str] = []
    for k, (clipe, inicio) in enumerate(camadas):
        entradas += ['-i', str(clipe)]
        partes.append(f'[{k + 1}:v]setpts=PTS-STARTPTS+{inicio:.6f}/TB[c{k}]')
        partes.append(f'[{atual}][c{k}]overlay=format=auto:eof_action=pass[o{k}]')
        atual = f'o{k}'
    partes.append(f'[{atual}]format=yuv420p[v]')
    cv = ['-c:v', 'hevc_videotoolbox', '-q:v', '65', '-tag:v', 'hvc1'] if codec == 'hevc' else ['-c:v', 'h264_videotoolbox', '-q:v', '65']
    return ['ffmpeg', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-hwaccel', 'videotoolbox', '-i', str(bruto),
            *entradas, '-filter_complex', ';'.join(partes), '-map', '[v]', '-map', '[ac]', *cv, '-pix_fmt', 'yuv420p',
            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
            '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', f'{duracao:.4f}', '-movflags', '+faststart', str(saida)]


def pedacos(trechos: list[dict], fps: int, navegadores: int) -> list[list[list[int]]]:
    """Os quadros de cada insert (índices no vídeo final), cortados em pedaços para dividir entre os navegadores: pedaços
    pequenos o bastante para todos trabalharem até o fim, grandes o bastante para não perder tempo trocando."""
    quadros = [[q for q in range(math.ceil(t['ini'] * fps - 1e-9), math.ceil(t['fim'] * fps - 1e-9))] for t in trechos]
    total = sum(map(len, quadros))
    tamanho = max(12, min(48, math.ceil(total / (navegadores * 3)) if total else 12))
    return [[qs[i:i + tamanho] for i in range(0, len(qs), tamanho)] for qs in quadros if qs]


def _rodar(id: str, e: dict) -> None:
    vivo = _andamento[id]
    pasta = pasta_exports(id)
    pasta.mkdir(exist_ok=True)
    final = pasta / f"{e['nome']}.mp4"
    k = 2
    while final.exists():
        final = pasta / f"{e['nome']} ({k}).mp4"
        k += 1
    parte = final.with_suffix('.parte.mp4')
    try:
        cancelado = _gravar(id, e, parte, vivo)
        if cancelado:
            parte.unlink(missing_ok=True)
            _fim(id, status='cancelada')
            return
        parte.replace(final)
        _fim(id, status='pronta', progresso=1.0, arquivo=final.name)
    except Exception as ex:
        traceback.print_exc()
        parte.unlink(missing_ok=True)
        _fim(id, status='erro', erro=str(ex)[:300])
    finally:
        _andamento.pop(id, None)


def _trechos(url: str) -> list[dict]:
    """Os inserts com mídia, no tempo do vídeo final, lidos da página de render."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chromium')
        try:
            page = browser.new_page()
            page.route_web_socket(re.compile('.*'), lambda ws: None)
            page.goto(url, wait_until='load', timeout=60_000)
            page.wait_for_function('() => !!window.__render', timeout=60_000)
            return page.evaluate('() => window.__render.trechos')
        finally:
            browser.close()


def _gravar(id: str, e: dict, saida: Path, vivo: dict) -> bool:
    """Fotografa a camada dos inserts em paralelo (cada navegador grava pedaços em clipes com transparência) e depois monta
    tudo numa passada do ffmpeg. Devolve True se foi cancelada."""
    p = projeto.ler(id)
    fonte = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    clipes = sorted(p['timeline']['V1'], key=lambda c: c['inicio'])
    duracao = sum(c['fim'] - c['inicio'] for c in clipes)
    w, h = RESOLUCOES[e['resolucao']]
    fps, navegadores = e['fps'], e.get('navegadores', NAVEGADORES)
    horizontal = (fonte.get('largura') or 0) > (fonte.get('altura') or 0)
    url = f'{FRONT}/render/p/{id}'
    tmp = saida.with_suffix('.camadas')
    tmp.mkdir(exist_ok=True)
    log = saida.with_suffix('.log')
    pool = None
    try:
        # os vídeos dos inserts em resolução original, prontos para a busca quadro a quadro (feitos uma vez, guardados no banco)
        for bid in {m['banco'] for x in (p.get('inserts') or {}).get('pedidos', []) for m in x.get('midias', [])}:
            try:
                inserts.arquivo_para_exportar(inserts.ler_item(bid))
            except (FileNotFoundError, ValueError):
                pass  # mídia apagada do banco: a página de render mostra o que houver
        trechos = _trechos(url)
        grupos = pedacos(trechos, fps, navegadores)
        n_ins = sum(len(x) for g in grupos for x in g)
        # pesos do progresso: ~18 quadros/s fotografados (6 navegadores, 4K) e a passada final ~0,45 s por s de vídeo
        peso = (n_ins / 18) / max(n_ins / 18 + duracao * 0.45, 1e-6)

        camadas: list[tuple[Path, float]] = []
        if n_ins:
            tarefas = [(qs, fps, w, h, str(tmp / f'{i:03d}_{j:03d}.mov')) for i, g in enumerate(grupos) for j, qs in enumerate(g)]
            pool = multiprocessing.get_context('spawn').Pool(min(navegadores, len(tarefas)), initializer=render_quadros.iniciar,
                                                              initargs=(url, w, h))
            feitos = 0
            for n in pool.imap_unordered(render_quadros.pedaco, tarefas):
                if vivo['cancelar'].is_set():
                    return True
                feitos += n
                vivo['progresso'] = feitos / n_ins * peso
            pool.close()
            pool.join()
            pool = None
            # um clipe por insert (os pedaços emendados sem recodificar)
            for i, g in enumerate(grupos):
                lista = tmp / f'{i:03d}.txt'
                lista.write_text(''.join(f"file '{i:03d}_{j:03d}.mov'\n" for j in range(len(g))))
                clipe = tmp / f'{i:03d}.mov'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lista), '-c', 'copy', str(clipe)],
                               check=True, capture_output=True)
                camadas.append((clipe, g[0][0] / fps))

        divididas = [(t['ini'], t['fim']) for t in trechos if t['dividida']]
        cmd = comando_final(projeto.pasta(id) / fonte['arquivo'], clipes, horizontal, p.get('enquadramento', {}).get('x', 0.5),
                            w, h, fps, divididas, camadas, e['codec'], duracao, saida)
        with open(log, 'wb') as erros:
            ff = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=erros, text=True)
            for linha in ff.stdout:
                if vivo['cancelar'].is_set():
                    ff.kill()
                    ff.wait()
                    return True
                if linha.startswith('out_time_us=') and linha.strip()[12:].isdigit():
                    vivo['progresso'] = peso + min(int(linha.strip()[12:]) / 1e6 / duracao, 1) * (1 - peso) * 0.99
            if ff.wait() != 0:
                raise RuntimeError(f'ffmpeg falhou: {log.read_text(errors="replace")[-300:]}')
        return False
    finally:
        if pool:
            pool.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
        log.unlink(missing_ok=True)
