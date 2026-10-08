"""Motions (SPEC §8.5; docs/motions.md): dois jeitos de preencher um plano de motion (decisão de Rodrigo, out/2026).
- **Preset:** uma animação pronta em HTML + CSS + GSAP (`frontend/public/motion/presets/<id>.html`, escrita à mão), em
  que o criador troca só os campos (textos, imagem do banco) e escolhe o fundo.
- **Vídeo:** um vídeo do banco feito fora, que entra e sai seco, como um insert.
Os dois tocam pela mesma página (palco + GSAP + runtime): ao vivo na prévia e fotografados quadro a quadro na exportação.
(A 1ª versão, em que a IA escrevia cada motion, saiu: o fluxo ficava complexo demais para o app.)"""
import json
import re
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

from . import inserts, projeto

PRESETS = Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'motion' / 'presets'
FORMATOS = {'vertical': (1080, 1920), 'dividida': (1080, 960)}  # tela cheia 9:16; tela dividida: a metade de cima
TIPOS_CAMPO = ('texto', 'cor', 'imagem')


def _item_banco(bid) -> dict:
    """Um item do banco pelo id (10 caracteres hex): um valor qualquer vindo da tela nunca vira caminho."""
    if not isinstance(bid, str) or not re.fullmatch(r'[0-9a-f]{10}', bid):
        raise FileNotFoundError(bid)
    return inserts.ler_item(bid)


# ---------------------------------------------------------------- presets

def _json_do_script(fragmento: str, sid: str) -> dict:
    m = re.search(rf'<script[^>]*id=["\']{sid}["\'][^>]*>(.*?)</script>', fragmento, re.S)
    try:
        d = json.loads(m.group(1)) if m else {}
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def campos_de(fragmento: str) -> dict:
    """Os campos que o preset declara (`<script type="application/json" id="campos">`)."""
    return {k: {'tipo': v.get('tipo') if v.get('tipo') in TIPOS_CAMPO else 'texto', 'rotulo': str(v.get('rotulo') or k), 'padrao': v.get('padrao', '')}
            for k, v in _json_do_script(fragmento, 'campos').items() if isinstance(v, dict)}


def html_do_preset(pid: str) -> str:
    if not re.fullmatch(r'[a-z0-9-]{1,40}', pid or ''):
        raise FileNotFoundError(pid)
    return (PRESETS / f'{pid}.html').read_text(encoding='utf-8')


def ler_preset(pid: str) -> dict:
    frag = html_do_preset(pid)
    info = _json_do_script(frag, 'preset')
    return {'id': pid, 'nome': str(info.get('nome') or pid), 'descricao': str(info.get('descricao') or ''), 'fundo': info.get('fundo') or 'gradiente',
            'duracao': float(info.get('duracao') or 3), 'miniatura': float(info.get('miniatura') or 0.8), 'campos': campos_de(frag)}


def listar_presets() -> list[dict]:
    return [ler_preset(a.stem) for a in sorted(PRESETS.glob('*.html'))]


# ---------------------------------------------------------------- a página (prévia e exportação)

def _url_banco(bid: str, exportacao: bool) -> str:
    return f'/api/banco/{bid}/arquivo' + ('?qualidade=exportacao' if exportacao else '')


def documento(fragmento: str, formato: str, duracao: float, campos: dict, fala: list[dict] | None = None) -> str:
    """O HTML completo: o palco no tamanho do formato, as fontes, o GSAP, os dados (`MOTION`) e o runtime. O fundo da
    página é transparente: o fundo escolhido é desenhado atrás, pelo app (o mesmo dos inserts)."""
    w, h = FORMATOS.get(formato, FORMATOS['vertical'])
    dados = {'duracao': duracao, 'largura': w, 'altura': h, 'campos': campos, 'fala': fala or []}
    js = json.dumps(dados, ensure_ascii=False).replace('</', '<\\/')
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="/motion/fonts.css">
<style>html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}#palco{{position:relative;width:{w}px;height:{h}px;overflow:hidden;font-family:Inter,sans-serif}}</style>
<script>window.MOTION={js}</script>
<script src="/motion/gsap.min.js"></script>
<script src="/motion/runtime.js"></script>
</head><body><div id="palco">
{fragmento}
</div></body></html>"""


def valores_completos(pid: str, valores: dict, exportacao: bool) -> dict:
    """Os valores de cada campo do preset (o padrão onde o criador não mexeu); um campo de imagem vira a URL do banco."""
    out = {}
    for k, c in campos_de(html_do_preset(pid)).items():
        v = valores.get(k, c['padrao'])
        if c['tipo'] == 'imagem':
            try:
                _item_banco(v)
                v = _url_banco(v, exportacao)
            except (FileNotFoundError, ValueError):
                v = ''
        out[k] = v
    return out


def pagina_do_preset(pid: str, formato: str, duracao: float | None, valores: dict, fala: list[dict] | None = None, exportacao: bool = False) -> str:
    return documento(html_do_preset(pid), formato, duracao or ler_preset(pid)['duracao'], valores_completos(pid, valores, exportacao), fala)


def _fragmento_video(bid: str, exportacao: bool) -> str:
    """O vídeo do banco ocupando o palco, parado no quadro que o runtime pedir (um trecho começa no ponto dele)."""
    i = _item_banco(bid)
    desde = i.get('inicio') or 0
    return f"""<video data-inicio="0" data-desde="{desde}" muted playsinline preload="auto" src="{_url_banco(bid, exportacao)}"
 style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000"></video>
<script>const tl = gsap.timeline({{ paused: true }}); tl.to({{}}, {{ duration: MOTION.duracao }}); motion.pronto(tl)</script>"""


# ---------------------------------------------------------------- o motion de um plano

class UsoMotion(BaseModel):
    tipo: str = Field(pattern='^(preset|video)$')
    formato: str = Field(pattern='^(vertical|dividida)$')
    preset: str | None = None
    banco: str | None = None
    valores: dict[str, str] = {}
    fundo: str | None = Field(default=None, max_length=40)


def usar(pid: str, plano: str, u: UsoMotion) -> dict:
    """Põe um preset (com os valores e o fundo) ou um vídeo do banco no plano."""
    if u.tipo == 'preset':
        p = ler_preset(u.preset or '')
        info = {'tipo': 'preset', 'preset': p['id'], 'nome': p['nome'], 'formato': u.formato,
                'valores': {k: v[:500] for k, v in u.valores.items() if k in p['campos']}, 'fundo': u.fundo or p['fundo']}
    else:
        i = _item_banco(u.banco)
        if i['tipo'] != 'video':
            raise ValueError('Escolha um vídeo')
        info = {'tipo': 'video', 'banco': u.banco, 'nome': i.get('nome') or 'Vídeo', 'formato': u.formato}
    info['usado_em'] = datetime.now().isoformat(timespec='seconds')
    projeto.atualizar(pid, lambda x: x.setdefault('motions', {}).__setitem__(plano, info))
    return info


def ajustar(pid: str, plano: str, valores: dict | None, fundo: str | None) -> dict:
    """Muda os valores dos campos e o fundo do preset de um plano (o que não vem fica)."""
    def mudar(p):
        x = (p.get('motions') or {}).get(plano)
        if not x or x['tipo'] != 'preset':
            raise LookupError('Este plano não tem preset')
        if valores is not None:
            x['valores'] = {k: str(v)[:500] for k, v in valores.items()}
        if fundo:
            x['fundo'] = fundo[:40]
    return projeto.atualizar(pid, mudar)['motions'][plano]


def tirar_do_plano(pid: str, plano: str) -> None:
    projeto.atualizar(pid, lambda p: (p.get('motions') or {}).pop(plano, None))


def pagina_do_plano(pid: str, plano: str, duracao: float | None, fala: list[dict] | None, exportacao: bool = False) -> str:
    """A página do motion do plano; `duracao` é a do plano agora e `fala`, as palavras dele (a digitação acompanha)."""
    x = (projeto.ler(pid).get('motions') or {}).get(plano)
    if not x:
        raise LookupError('Este plano não tem motion')
    if x['tipo'] == 'video':
        return documento(_fragmento_video(x['banco'], exportacao), x['formato'], duracao or 3, {})
    return pagina_do_preset(x['preset'], x['formato'], duracao, x.get('valores') or {}, fala, exportacao)


def ler_fala(texto: str | None) -> list[dict]:
    """A fala do plano vinda na URL: `[{texto, ini, fim}]`, em segundos desde o começo do plano."""
    try:
        lista = json.loads(texto or '[]')
        return [{'texto': str(w['texto'])[:80], 'ini': float(w['ini']), 'fim': float(w['fim'])} for w in lista[:200]]
    except (ValueError, TypeError, KeyError):
        return []
