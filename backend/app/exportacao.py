"""Exportação do vídeo final (SPEC §13): o ator e o áudio saem do bruto original pelo ffmpeg (cortes, recorte 9:16, fade
curto em cada emenda) e a camada dos inserts é a própria prévia, fotografada quadro a quadro por um navegador escondido
(`/render/p/<id>` do front), com o relógio parado em cada instante — sai igual ao que o criador aprova na tela, sem os
quadros perdidos da reprodução em tempo real. Vários navegadores fotografam em paralelo e o resto usa o chip de vídeo do
Mac, para ficar perto do tempo real. Roda em segundo plano, uma por projeto; o MP4 vai para `exports/`."""
import math
import multiprocessing
import re
import shutil
import subprocess
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from . import audio as audio_mod
from . import legenda as legenda_mod
from . import look as look_mod
from . import transicoes as transicoes_mod
from . import banco, comum, midia, projeto, render_quadros, sons

RESOLUCOES = {'720p': (720, 1280), '1080p': (1080, 1920), '4k': (2160, 3840)}
FPS = (24, 30, 60)
CODECS = ('hevc', 'h264')
NAVEGADORES = 6  # navegadores fotografando em paralelo (padrão; o criador escolhe de 1 a 8 no modal)
FADE = 0.015  # s de fade do áudio em cada emenda, contra estalos

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
         'arquivo': None, 'erro': None, 'aviso': None, 'inicio': datetime.now().isoformat(timespec='seconds'), 'fim': None}
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


JANELA = {'y0': 0.72, 'escala': 0.55, 'raio': 0.07}  # o ator no "insert atrás" (igual a editor/divisao.ts; raio em fração da largura do ator encolhido)


def _ator(clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
          divisoes: list[tuple[float, float, dict]], duracao: float, mascara: bool, com_look: bool = False) -> tuple[list[str], list[str]]:
    """Os filtros do ator e do áudio (entrada 0 = bruto; 1 = a máscara da pessoa, se houver): cada clipe da V1 vira um
    par vídeo + áudio (o áudio com fade curto nas pontas) e o concat mantém os dois juntos em cada emenda; depois, recorte
    9:16, escala, fps de saída (o ator repete quadros, sem interpolar) e o ator descendo para a parte de baixo nas telas
    divididas (metade de `f` da altura). Devolve os filtros de baixo (saídas [base] e [ac]) e os de cima, aplicados depois
    dos inserts sobre [topo_in] → [topo]: o ator na janela do "insert atrás" e a pessoa recortada saindo da área dele.
    `com_look`: o ator escalado sai em [ator_cru] e o look (`look.filtros`, ligado em `comando_final`) faz o [ator]."""
    n = len(clipes)
    usa_mascara = mascara and any(d['modo'] == 'atras' for _, _, d in divisoes)  # a cabeça sai por cima só no "ator embaixo"
    partes = [f'[0:v]split={n}' + ''.join(f'[v{k}]' for k in range(n)), f'[0:a]asplit={n}' + ''.join(f'[a{k}]' for k in range(n))]
    if usa_mascara:
        partes.append(f'[1:v]split={n}' + ''.join(f'[m{k}]' for k in range(n)))
    pares, masc = '', ''
    for k, c in enumerate(clipes):
        ini, fim = c['inicio'], c['fim']
        dur = fim - ini
        partes.append(f'[v{k}]trim=start={ini:.4f}:end={fim:.4f},setpts=PTS-STARTPTS[cv{k}]')
        partes.append(f'[a{k}]atrim=start={ini:.4f}:end={fim:.4f},asetpts=PTS-STARTPTS,'
                      f'afade=t=in:d={FADE},afade=t=out:st={max(dur - FADE, 0):.4f}:d={FADE}[ca{k}]')
        pares += f'[cv{k}][ca{k}]'
        if usa_mascara:
            partes.append(f'[m{k}]trim=start={ini:.4f}:end={fim:.4f},setpts=PTS-STARTPTS[cm{k}]')
            masc += f'[cm{k}]'
    partes.append(f'{pares}concat=n={n}:v=1:a=1[vc][ac]')
    recorte = f"crop=w=trunc(ih*9/16/2)*2:h=ih:x=(iw-ow)*{enquadramento_x:.4f}," if horizontal else ''
    partes.append(f'[vc]{recorte}scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos,crop={w}:{h},setsar=1,fps={fps}[{'ator_cru' if com_look else 'ator'}]')
    quando = lambda ts: '+'.join(f'between(t,{a:.4f},{b - 0.5 / fps:.4f})' for a, b in ts) or '0'  # noqa: E731
    metades = [(a, b, d['f']) for a, b, d in divisoes if d['modo'] == 'metade']
    atras = [(a, b) for a, b, d in divisoes if d['modo'] == 'atras']
    # o ator desce metade da fração do insert (o centro do quadro vai para o meio da parte de baixo)
    desce = '+'.join(f'between(t,{a:.4f},{b - 0.5 / fps:.4f})*{f / 2:.5f}*H' for a, b, f in metades) or '0'
    usos = 1 + (1 if atras else 0) + (1 if usa_mascara else 0)
    partes.append(f'[ator]split={usos}[ator0]' + ('[ator1]' if atras else '') + ('[ator2]' if usa_mascara else ''))
    partes.append(f'color=c=black:s={w}x{h}:r={fps}:d={duracao:.4f}[tela]')
    partes.append(f"[tela][ator0]overlay=x=0:y='{desce}':eval=frame:shortest=1[base]")
    topo: list[str] = []
    atual = 'topo_in'
    jw, jh = round(w * JANELA['escala'] / 2) * 2, round(h * JANELA['escala'] / 2) * 2
    jx, jy_ator = (w - jw) // 2, h - jh  # o ator encolhido, apoiado embaixo e centrado
    corte = round(h * JANELA['y0']) - jy_ator  # a janela começa aqui, dentro do ator encolhido
    if atras:
        r = round(jw * JANELA['raio'])
        janela_h = jh - corte
        topo.append(f'[ator1]scale={jw}:{jh},crop={jw}:{janela_h}:0:{corte},format=rgba[jan]')
        topo.append(f"color=c=white:s={jw}x{janela_h}:r={fps},format=gray,geq=lum='255*lte(hypot(max(0,max({r}-X,X-{jw - r})),"
                    f"max(0,max({r}-Y,Y-{janela_h - r}))),{r})'[cantos]")
        topo.append('[jan][cantos]alphamerge[janr]')
        topo.append(f"[{atual}][janr]overlay=x={jx}:y={jy_ator + corte}:enable='{quando([(a, b) for a, b in atras])}'[t1]")
        atual = 't1'
    if usa_mascara:
        partes.append(f'{masc}concat=n={n}:v=1:a=0,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=gray,fps={fps}[masc]')
        partes.append('[ator2][masc]alphamerge[pessoa]')
        fs: list[float] = []
        saidas = len(fs) + (1 if atras else 0)
        topo.append(f'[pessoa]split={saidas}' + ''.join(f'[p{i}]' for i in range(saidas)))
        for i, f in enumerate(fs):
            y = round(f / 2 * h)
            topo.append(f'[p{i}]crop={w}:{y}:0:0[pc{i}]')
            topo.append(f"[{atual}][pc{i}]overlay=x=0:y={y}:enable='{quando([(a, b) for a, b, g in metades if g == f])}'[tp{i}]")
            atual = f'tp{i}'
        if atras:
            topo.append(f'[p{len(fs)}]scale={jw}:{jh},crop={jw}:{corte}:0:0[pj]')
            topo.append(f"[{atual}][pj]overlay=x={jx}:y={jy_ator}:enable='{quando(atras)}'[tpj]")
            atual = 'tpj'
    topo.append(f'[{atual}]null[topo]')
    return partes, topo


def _inserts(camadas: list[tuple[Path, float]], primeira_entrada: int, rotulo_in: str, saida: str) -> tuple[list[str], list[str]]:
    """Camada 2 (SPEC §13): cada clipe da camada dos inserts e motions (ProRes 4444 com transparência, fotografado pelos
    navegadores) sobreposto no seu instante. Devolve (entradas, filtros), de [`rotulo_in`] a [`saida`]."""
    entradas: list[str] = []
    filtros: list[str] = []
    atual = rotulo_in
    for k, (clipe, inicio) in enumerate(camadas):
        entradas += ['-i', str(clipe)]
        filtros.append(f'[{k + primeira_entrada}:v]setpts=PTS-STARTPTS+{inicio:.6f}/TB[c{k}]')
        filtros.append(f'[{atual}][c{k}]overlay=format=auto:eof_action=pass[o{k}]')
        atual = f'o{k}'
    filtros.append(f'[{atual}]null[{saida}]')
    return entradas, filtros


def _transicoes(transicoes: list[dict] | None, rotulo_in: str, w: int, h: int, primeira_entrada: int,
                fps: int = 30) -> tuple[list[str], list[str], str]:
    """Camada 4 (SPEC §13, §8.8): as transições entre planos, sobre o quadro já montado (`transicoes.filtros`: zoom com
    desfoque, brilho e a luz colorida, só nas janelas delas). Recebe `__render.transicoes`. Devolve (entradas, filtros,
    rótulo de saída); sem transições com efeito, nada."""
    if not any(x.get('tipo') in ('luz', 'brilho', 'zoom') for x in transicoes or []):
        return [], [], rotulo_in
    entradas, f = transicoes_mod.filtros(transicoes, rotulo_in, 'tr', w, h, primeira_entrada, fps)
    return entradas, f, 'tr'


def _legenda(legenda: dict | None, rotulo_in: str) -> tuple[list[str], str]:
    """Camada 5 (SPEC §13, §8.10; a P4): a legenda por cima de tudo, um ASS (`legenda.escrever`, dos blocos de
    `__render.legenda`) desenhado pelo libass. `legenda`: `{arquivo: Path}`; sem arquivo, nada. Devolve (filtros,
    rótulo de saída)."""
    if not legenda or not legenda.get('arquivo'):
        return [], rotulo_in
    return [f'[{rotulo_in}]{legenda_mod.filtro(legenda["arquivo"])}[leg]'], 'leg'


def _pos_montagem(transicoes: list[dict] | None, legenda: dict | None, rotulo_in: str, saida: str, w: int, h: int,
                  primeira_entrada: int, fps: int = 30) -> tuple[list[str], list[str]]:
    """O que age sobre o quadro inteiro já montado: as transições e, por cima de tudo, a legenda; no fim, o formato de
    saída. Devolve (entradas, filtros)."""
    entradas, filtros, atual = _transicoes(transicoes, rotulo_in, w, h, primeira_entrada, fps)
    f_leg, atual = _legenda(legenda, atual)
    return entradas, [*filtros, *f_leg, f'[{atual}]format=yuv420p[{saida}]']


def _audio(eventos_som: list[dict] | None, primeira_entrada: int, rotulo_voz: str, saida: str, clipes: list[dict],
           duracao: float, audio: dict | None = None) -> tuple[list[str], list[str]]:
    """Camada A (SPEC §13, §8.6, §8.8, §8.9): sem `audio`, a voz do bruto (já cortada, [`rotulo_voz`]) com os sons
    somados — os de apoio dos presets e os das transições (os dois vêm em `__render.sons`). Com `audio` (a P3,
    `audio.da_exportacao`), a voz vem de uma entrada própria (a limpa, cortada igual) com o timbre, o compressor e os
    faders, o fundo com ducking e o −14 LUFS (`audio.filtros`); a voz do bruto é descartada. Devolve (entradas,
    filtros), com a mistura em [`saida`]."""
    if audio is None:
        return sons.filtro_mistura(eventos_som or [], primeira_entrada, rotulo_voz, saida)
    entradas, filtros = audio_mod.filtros(audio, clipes, eventos_som or [], primeira_entrada, saida, duracao, audio.get('medida'))
    return entradas, [f'[{rotulo_voz}]anullsink', *filtros]


def comando_final(bruto: Path, clipes: list[dict], horizontal: bool, enquadramento_x: float, w: int, h: int, fps: int,
                  divisoes: list[tuple[float, float, dict]], camadas: list[tuple[Path, float]], codec: str, duracao: float,
                  saida: Path, mascara: Path | None = None, eventos_som: list[dict] | None = None,
                  transicoes: list[dict] | None = None, legenda: dict | None = None, look: dict | None = None,
                  mascara_vinheta: Path | None = None, audio: dict | None = None) -> list[str]:
    """Uma passada só, montada por camadas na ordem do contrato (SPEC §13; cada área mexe só na sua função): o ator e o
    áudio do bruto, decodificado pelo chip de vídeo (`_ator`); por cima, a camada dos inserts (`_inserts`); por cima
    dela, o ator na janela do "insert atrás" e a pessoa recortada (a parte de cima de `_ator`); depois, sobre o quadro
    montado, as transições e a legenda (`_pos_montagem`); o áudio (`_audio`). Codifica no chip de vídeo (HEVC ou H.264).
    Entradas do ffmpeg, nesta ordem: o bruto, a máscara (se usada), os clipes dos inserts, os sons e a máscara da
    vinheta do look (se houver; em loop). O look (LUT + vinheta, `look.py`) vale só para o ator, logo depois da escala."""
    com_look = look_mod.ativo(look)
    partes, topo = _ator(clipes, horizontal, enquadramento_x, w, h, fps, divisoes, duracao, mascara is not None, com_look)
    usa_mascara = any('[1:v]' in x for x in partes)
    base_idx = 2 if usa_mascara else 1
    entradas: list[str] = ['-i', str(mascara)] if usa_mascara else []
    ent_ins, f_ins = _inserts(camadas, base_idx, 'base', 'topo_in')
    ent_som, f_som = _audio(eventos_som, base_idx + len(camadas), 'ac', 'am', clipes, duracao, audio)
    entradas += ent_ins + ent_som
    if com_look:
        idx_vinheta = None
        if mascara_vinheta is not None and look_mod.VINHETAS.get(look.get('vinheta'), 0) > 0:
            idx_vinheta = base_idx + len(camadas) + ent_som.count('-i')
            entradas += ['-loop', '1', '-i', str(mascara_vinheta)]
        partes += look_mod.filtros(look, 'ator_cru', 'ator', idx_vinheta)
    ent_pos, f_pos = _pos_montagem(transicoes, legenda, 'topo', 'v', w, h, 1 + entradas.count('-i'), fps)
    entradas += ent_pos
    partes += f_ins + f_som + topo + f_pos
    cv = ['-c:v', 'hevc_videotoolbox', '-q:v', '65', '-tag:v', 'hvc1'] if codec == 'hevc' else ['-c:v', 'h264_videotoolbox', '-q:v', '65']
    return ['ffmpeg', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-hwaccel', 'videotoolbox', '-i', str(bruto),
            *entradas, '-filter_complex', ';'.join(partes), '-map', '[v]', '-map', '[am]', *cv, '-pix_fmt', 'yuv420p',
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
        _fim(id, status='pronta', progresso=1.0, arquivo=final.name, aviso=vivo.get('aviso'))
    except Exception as ex:
        traceback.print_exc()
        parte.unlink(missing_ok=True)
        _fim(id, status='erro', erro=str(ex)[:300])
    finally:
        _andamento.pop(id, None)


def _trechos(url: str) -> dict:
    """O que a página de render calcula no front (`window.__render`, SPEC §13), no tempo do vídeo final: os inserts com
    mídia (`trechos`), os sons de apoio (`sons`, §8.6) e, quando as áreas existirem, as transições entre planos
    (`transicoes`, §8.8) e os blocos da legenda (`legenda`, §8.10) — `None` enquanto a página não os tiver."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chromium')
        try:
            pg = render_quadros.abrir_render(browser, url)
            return pg.evaluate("""async () => {
                const r = window.__render
                const ler = async (f) => (typeof f === 'function' ? await f() : f ?? null)
                return { trechos: r.trechos, sons: r.sons ? await r.sons() : [], transicoes: await ler(r.transicoes), legenda: await ler(r.legenda) }
            }""")
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
    url = f'{comum.FRONT}/render/p/{id}'
    tmp = saida.with_suffix('.camadas')
    tmp.mkdir(exist_ok=True)
    log = saida.with_suffix('.log')
    pool = None
    try:
        # os vídeos dos inserts em resolução original, prontos para a busca quadro a quadro (feitos uma vez, guardados no banco)
        for bid in {m['banco'] for x in (p.get('inserts') or {}).get('pedidos', []) for m in x.get('midias', [])}:
            try:
                banco.arquivo_para_exportar(banco.ler_item(bid))
            except (FileNotFoundError, ValueError):
                pass  # mídia apagada do banco: a página de render mostra o que houver
        render = _trechos(url)
        trechos, eventos_som = render['trechos'], render['sons']
        fator = sons.fator_do_projeto(id)  # os sons na mesma relação com a voz deste vídeo que nas referências
        eventos_som = [{**ev, 'ganho': float(ev.get('ganho', sons.INTENSIDADES['baixo'])) * fator} for ev in eventos_som]
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
                midia.ffmpeg('-f', 'concat', '-safe', '0', '-i', str(lista), '-c', 'copy', str(clipe))
                camadas.append((clipe, g[0][0] / fps))

        # a divisão de cada trecho (sem ela, das páginas antigas: tela dividida meio a meio)
        divisoes = [(t['ini'], t['fim'], t.get('divisao') or {'modo': 'metade', 'f': 0.5}) for t in trechos if t['dividida']]
        from . import recorte_ator
        mascara = recorte_ator.arquivos(id, fonte['id'])[0] if (p.get('recorte') or {}).get('estado') == 'pronto' else None
        lk = look_mod.do_projeto(p)  # o look do ator (LUT + vinheta)
        # a legenda (P4): o ASS dos blocos que a página de render montou
        arq_leg = legenda_mod.escrever(render.get('legenda'), w, h, tmp / 'legenda.ass')
        leg = {'arquivo': arq_leg} if arq_leg else None
        # o áudio (P3): a voz limpa (feita agora se faltar; se falhar, a do bruto com um aviso), o fundo e o −14 LUFS,
        # medido antes só no áudio (rápido)
        if vivo['cancelar'].is_set():
            return True
        som = audio_mod.da_exportacao(id, p, clipes)
        vivo['aviso'] = som.pop('aviso', None)
        if vivo['cancelar'].is_set():
            return True
        som['medida'] = audio_mod.medir(som, clipes, eventos_som, duracao)
        if vivo['cancelar'].is_set():
            return True
        cmd = comando_final(projeto.pasta(id) / fonte['arquivo'], clipes, horizontal, p.get('enquadramento', {}).get('x', 0.5),
                            w, h, fps, divisoes, camadas, e['codec'], duracao, saida, mascara if mascara and mascara.exists() else None,
                            eventos_som, render.get('transicoes'), leg, lk,
                            look_mod.mascara_vinheta(w, h, look_mod.VINHETAS[lk['vinheta']], tmp / 'vinheta.png') if look_mod.ativo(lk) else None,
                            som)
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
