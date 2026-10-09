"""Transições entre planos (SPEC §8.8; docs/transicoes.md): como o vídeo passa de um plano da direção para o outro, com
o som. Modeladas dos nossos vídeos: nas referências, a grande maioria dos cortes entre planos é seca; os sons de corte
(o clique, a câmera, o riser terminando no corte) caem sobre cortes secos; os efeitos visuais de verdade são poucos (a
luz colorida, o zoom com desfoque, o brilho branco).

Uma transição (`transicoes/<id>.json`, dados fora do git, como os presets): nome, descrição, o **efeito** (`tipo`:
seco · luz · brilho · zoom, com quanto dura antes e depois do corte e a força), o **som** (da biblioteca, com a
intensidade; o golpe cai no corte + `atraso`), de onde veio nas referências e se está aprovada. Um **par** é a
categoria do plano que sai e a do que entra ("full_ator>tela_dividida_insert"); cada par tem a sua ordem e as suas 2
favoritas (`transicoes/ordem.json`), e cada corte do vídeo recebe sozinho a 1ª favorita do seu par (o projeto guarda só
as trocadas à mão, com o par do corte)."""
import math
import re
import threading
from pathlib import Path

from . import comum, sons

RAIZ = Path(__file__).resolve().parents[2] / 'transicoes'
EFEITOS = Path(__file__).resolve().parents[1] / 'transicoes_efeitos'
TIPOS = ('seco', 'luz', 'brilho', 'zoom')
N_FAVORITAS = 2
_ID = re.compile(r'[a-z0-9][a-z0-9-]{0,40}')
_PAR = re.compile(r'[a-z_]{2,40}>[a-z_]{2,40}')
_trava = threading.Lock()


def _arq(tid: str) -> Path:
    if not _ID.fullmatch(tid or ''):
        raise FileNotFoundError(tid)
    return RAIZ / f'{tid}.json'


def ler(tid: str) -> dict:
    return comum.ler_json(_arq(tid))


def listar() -> list[dict]:
    if not RAIZ.exists():
        return []
    out = []
    for a in sorted(RAIZ.glob('*.json')):
        if a.stem in ('ordem', 'pares'):
            continue
        try:
            out.append(comum.ler_json(a))
        except ValueError:
            continue
    return out


def existe(tid: str) -> bool:
    try:
        return _arq(tid).exists()
    except FileNotFoundError:
        return False


def validar(t: dict) -> dict:
    """Uma transição limpa (os números nos limites); levanta ValueError se a forma estiver errada."""
    e = t.get('efeito') or {}
    if e.get('tipo', 'seco') not in TIPOS:
        raise ValueError('Efeito desconhecido')
    efeito = {'tipo': e.get('tipo', 'seco'), 'antes': comum.numero(e.get('antes', 0) or 0, 0, 2, 3),
              'depois': comum.numero(e.get('depois', 0) or 0, 0, 2, 3), 'forca': comum.numero(e.get('forca', 1) if e.get('forca') is not None else 1, 0, 1, 3)}
    som = t.get('som')
    s = sons.validar([{**som, 'momento': 'entrada'}])[0] if isinstance(som, dict) else None
    som = {'som': s['som'], 'intensidade': s['intensidade'], 'atraso': s['atraso']} if s and s['som'] else None
    if not _ID.fullmatch(t.get('id') or ''):
        raise ValueError('Id inválido')
    return {'id': t['id'], 'nome': str(t.get('nome') or t['id'])[:60], 'descricao': str(t.get('descricao') or '')[:400],
            'efeito': efeito, 'som': som, 'fontes': [{'ref': str(f['ref']), 't': float(f['t'])} for f in t.get('fontes') or [] if 'ref' in f and 't' in f][:12],
            'aprovado': bool(t.get('aprovado'))}


def salvar(t: dict) -> dict:
    t = validar(t)
    comum.salvar_json(_arq(t['id']), t)
    return t


def editar(tid: str, campos: dict) -> dict:
    t = ler(tid)
    if 'aprovado' in campos:
        t['aprovado'] = bool(campos['aprovado'])
    if 'nome' in campos and str(campos['nome']).strip():
        t['nome'] = str(campos['nome']).strip()[:60]
    if 'som' in campos:
        t['som'] = campos['som']
    if 'efeito' in campos and isinstance(campos['efeito'], dict):
        t['efeito'] = {**t['efeito'], **campos['efeito']}
    return salvar(t)


# ---------------------------------------------------------------- pares, ordem e favoritas

def familia(categoria: str) -> str:
    """A família de uma categoria de plano (para os pares que nunca apareceram nas referências)."""
    if 'motion' in categoria:
        return 'motion'
    if categoria.startswith('full_ator') or categoria == 'comentario_insert_ator':
        return 'ator'
    return 'insert'


def chave(de: str, para: str) -> str:
    return f'{de}>{para}'


def pares() -> dict:
    """Os pares vistos nas referências (`transicoes/pares.json`, da análise: quantos cortes e de onde) com a ordem e as
    favoritas de cada um."""
    arq = RAIZ / 'pares.json'
    vistos = comum.ler_json(arq) if arq.exists() else {}
    return {'pares': vistos, 'ordem': ordem()}


def ordem() -> dict[str, dict]:
    arq = RAIZ / 'ordem.json'
    return comum.ler_json(arq) if arq.exists() else {}


def definir_ordem(par: str, ids: list, favoritas: int) -> dict:
    if not _PAR.fullmatch(par or '') and not re.fullmatch(r'familia:[a-z]+>[a-z]+', par or ''):
        raise ValueError('Par inválido')
    if not isinstance(ids, list):
        raise ValueError('A ordem é uma lista de transições')
    limpos = list(dict.fromkeys(x for x in ids if isinstance(x, str) and existe(x)))
    with _trava:
        o = ordem()
        if limpos:
            o[par] = {'ids': limpos, 'favoritas': min(int(comum.numero(favoritas or 0, 0, N_FAVORITAS, 0)), len(limpos))}
        else:
            o.pop(par, None)
        comum.salvar_json(RAIZ / 'ordem.json', o)
    return o


def ordem_do_par(de: str, para: str, o: dict | None = None) -> dict | None:
    """A ordem que vale para um par: a dele, ou (se ele não tiver) a da família."""
    o = ordem() if o is None else o
    return o.get(chave(de, para)) or o.get(f'familia:{familia(de)}>{familia(para)}')


def padrao_do_par(de: str, para: str, o: dict | None = None) -> str:
    """A transição que um corte recebe sozinho: a 1ª favorita da ordem que vale para o par (a dele ou a da família); um par
    com ordem própria e nenhuma favorita fica seco (não cai na família), e sem nada também. A mesma regra de
    `padraoDoPar` em transicoes.ts, que é quem decide o vídeo e a exportação."""
    x = ordem_do_par(de, para, o)
    tid = x['ids'][0] if x and x.get('favoritas') and x.get('ids') else None
    return tid if tid and existe(tid) else 'corte-seco'


# ---------------------------------------------------------------- no projeto

def _escolha(v) -> dict | None:
    """Uma escolha guardada: `{'id': transição, 'par': 'de>para'}` — o par do corte quando ela foi feita (os ids dos planos
    são de posição, `p5`; com outra direção, `p5` pode ser outro corte, e a escolha só vale se o par ainda bater). As
    antigas, só o id, valem em qualquer par."""
    if isinstance(v, str):
        return {'id': v}
    if isinstance(v, dict) and isinstance(v.get('id'), str):
        return {'id': v['id'], **({'par': v['par']} if isinstance(v.get('par'), str) else {})}
    return None


def do_projeto(p: dict) -> dict[str, dict]:
    """As transições trocadas à mão no projeto: o id do plano que entra → `{id da transição, par}`."""
    return {k: e for k, v in (p.get('transicoes') or {}).items() if (e := _escolha(v))}


def validar_escolhas(escolhas: dict) -> dict[str, dict]:
    if not isinstance(escolhas, dict):
        raise ValueError('As transições são um dicionário plano → transição')
    out = {}
    for k, v in escolhas.items():
        if not isinstance(k, str) or len(k) > 40 or v is None:
            continue
        e = _escolha(v)
        if e is None:
            raise ValueError('Escolha inválida')
        if not (e['id'] == 'seco' or existe(e['id'])):
            raise ValueError(f"Transição desconhecida: {e['id']}")
        if 'par' in e and not _PAR.fullmatch(e['par']):
            raise ValueError('Par inválido')
        out[k] = e
    return out


# ---------------------------------------------------------------- exportação (pós-montagem)

def _curva(t0: float, t1: float, subir: bool, var: str = 'T') -> str:
    """Uma rampa suave (smoothstep) de 0 a 1 entre t0 e t1 (ou de 1 a 0), em expressão do ffmpeg sobre o tempo `var`
    (`T` no geq, `t` no scale)."""
    u = f'clip(({var}-{t0:.4f})/{max(t1 - t0, 1e-3):.4f},0,1)'
    s = f'({u}*{u}*(3-2*{u}))'
    return s if subir else f'(1-{s})'


def _janela(t: float, antes: float, depois: float, pico: float = 1.0, var: str = 'T') -> str:
    """O envelope de um efeito em volta do corte `t`: sobe até o corte (em `antes` s) e desce depois (em `depois` s).
    Sem `antes`, nada antes do corte; sem `depois`, nada depois (igual a `envelope` em transicoes.ts)."""
    sobe = _curva(t - antes, t, True, var) if antes > 0 else '0'
    desce = _curva(t, t + depois, False, var) if depois > 0 else '0'
    return f'({pico:.3f}*if(lt({var},{t:.4f}),{sobe},{desce}))'


def envelope(antes: float, depois: float, t_corte: float, t: float) -> float:
    """O mesmo envelope em número (para os comandos do desfoque, quadro a quadro)."""
    def suave(u: float) -> float:
        x = min(max(u, 0.0), 1.0)
        return x * x * (3 - 2 * x)
    if t < t_corte:
        return suave((t - (t_corte - antes)) / antes) if antes > 0 else 0.0
    return 1 - suave((t - t_corte) / depois) if depois > 0 else 0.0


def _janela_em_quadros(x: dict, fps: int) -> tuple[int, int]:
    """O primeiro e o último quadro (do vídeo final) que a transição toca (nunca antes do começo do vídeo)."""
    return max(math.floor((x['t'] - x['antes']) * fps + 1e-6), 0), max(math.ceil((x['t'] + x['depois']) * fps - 1e-6), 0)


def _quadros(x: dict, fps: int) -> range:
    q0, q1 = _janela_em_quadros(x, fps)
    return range(q0, q1 + 1)


def filtros(transicoes: list[dict] | None, rotulo_in: str, saida: str, w: int, h: int, primeira_entrada: int,
            fps: int = 30) -> tuple[list[str], list[str]]:
    """Os filtros das transições sobre o quadro já montado (SPEC §13), de `[rotulo_in]` para `[saida]`, e as entradas que
    elas pedem (o vídeo da luz, uma vez por uso). Cada transição: `{t, tipo, antes, depois, forca}` (t no vídeo final).
    Fora das janelas das transições o quadro passa intocado e quase de graça (medido em 4K: o custo é o das janelas,
    não o da duração do vídeo):
    - zoom: o quadro aproxima até o corte e chega aproximado depois, voltando (`scale` com `eval=frame` + recorte
      central; com o tamanho igual, o `scale` só repassa), e desfoca pela mesma curva — o σ do `gblur` muda quadro a
      quadro por `sendcmd` e o `gblur` só liga na janela (como o `blur()` da prévia, que cresce com a curva);
    - brilho: um branco (uma fonte `color` só do tamanho da janela, com a transparência pela curva) por cima, por
      `overlay`; o vídeo fora da janela não passa por conversão nenhuma;
    - luz: o vídeo da luz colorida (com transparência) sobreposto, começando `antes` s antes do corte."""
    ts = [x for x in (transicoes or []) if x.get('tipo') in ('luz', 'brilho', 'zoom')]
    if not ts:
        return [], [f'[{rotulo_in}]null[{saida}]']
    entradas: list[str] = []
    # o quadro montado já no formato de saída: sem isso o ffmpeg podia negociar yuva420p na saída das sobreposições e o
    # `scale` do zoom convertia (refazendo o conversor a cada quadro, por causa do `eval=frame`) o vídeo inteiro. As cores:
    # só bt709 (aceitar também `unknown`/bt601 deixava a negociação escolher outra matriz, e com o look ligado o vídeo
    # inteiro saía ~3 níveis mais escuro em R e B); medido em vídeo sintético e no bruto real, com e sem look, para os três
    # efeitos: fora das janelas, o quadro sai idêntico ao de uma exportação sem transições
    f: list[str] = [f'[{rotulo_in}]format=pix_fmts=yuv420p:color_spaces=bt709:color_ranges=tv[tf]']
    atual = 'tf'
    k = 0
    sigma = max(w, h) / 120
    zooms = [x for x in ts if x['tipo'] == 'zoom']
    if zooms:
        z = '+'.join(_janela(x['t'], x['antes'], x['depois'], 0.22 * x.get('forca', 1), 't') for x in zooms)
        en = '+'.join(f"between(t,{x['t'] - x['antes']:.4f},{x['t'] + x['depois']:.4f})" for x in zooms)
        # o σ de cada quadro das janelas (o maior entre os zooms, como na prévia), mandado um pouco antes do quadro
        quadros = sorted({q for x in zooms for q in _quadros(x, fps)})
        cmds = ';'.join(f"{max(q - 0.25, 0) / fps:.4f} gblur@tz sigma "
                        f"{sigma * max(min(x.get('forca', 1) * envelope(x['antes'], x['depois'], x['t'], q / fps), 1) for x in zooms):.2f}"
                        for q in quadros)
        f.append(f"[{atual}]scale=w='trunc(iw*(1+{z})/2)*2':h='trunc(ih*(1+{z})/2)*2':eval=frame,crop={w}:{h},setsar=1,"
                 f"sendcmd=c='{cmds}',gblur@tz=sigma=0:enable='{en}'[tz]")
        atual = 'tz'
    for x in [x for x in ts if x['tipo'] == 'brilho']:
        # a fonte começa num quadro inteiro (sem arredondar o começo) e a curva corre no relógio dela (T local)
        q0, q1 = _janela_em_quadros(x, fps)
        t0 = q0 / fps
        a = _janela(x['t'] - t0, x['antes'], x['depois'], 0.85 * x.get('forca', 1))
        f.append(f"color=c=white:s=16x16:r={fps}:d={(q1 - q0 + 1) / fps:.4f},format=yuva420p,"
                 f"geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*{a}',scale={w}:{h}:flags=neighbor,"
                 f"setpts=PTS-STARTPTS+{q0}/({fps}*TB)[tw{k}]")
        f.append(f'[{atual}][tw{k}]overlay=0:0:format=auto:eof_action=pass[tb{k}]')
        atual = f'tb{k}'
        k += 1
    for x in [x for x in ts if x['tipo'] == 'luz']:
        idx = primeira_entrada + entradas.count('-i')
        entradas += ['-c:v', 'libvpx-vp9', '-i', str(EFEITOS / 'luz.webm')]
        t0 = x['t'] - x['antes']
        # o webm não diz o espaço de cor: marcado bt709 como o quadro (senão o overlay negociava outro e o vídeo inteiro
        # mudava de cor com o look ligado)
        f.append(f'[{idx}:v]scale={w}:{h},format=yuva420p,setparams=colorspace=bt709:range=tv,setpts=PTS-STARTPTS+{t0:.4f}/TB[tl{k}]')
        f.append(f'[{atual}][tl{k}]overlay=0:0:format=auto:eof_action=pass[to{k}]')
        atual = f'to{k}'
        k += 1
    f.append(f'[{atual}]null[{saida}]')
    return entradas, f
