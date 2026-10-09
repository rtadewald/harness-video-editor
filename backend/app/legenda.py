"""A legenda (SPEC §8.10; docs/legenda.md): gerada da fala já cortada, no estilo medido nas referências
(`ferramentas/legenda_analisar.py`): SF Pro Display Bold branca com sombra difusa, centralizada, uma palavra por vez (ou
frases curtas), na altura de cada tipo de plano.

Os blocos (quais palavras, o texto, quando e onde) são montados no navegador (`legenda/legenda.ts`, a mesma conta da
prévia) e chegam à exportação pela página de render (`__render.legenda`); aqui ficam as escolhas do projeto
(`projeto.legenda = { ligada, modo, ajustes }`, os ajustes presos às palavras) e o ASS que o libass desenha por cima de
tudo, no fim da montagem (SPEC §13)."""
import re
from pathlib import Path

MODOS = ('palavra', 'frase')
PADRAO = {'ligada': True, 'modo': 'palavra', 'ajustes': {}}
_PALAVRA = re.compile(r'[A-Za-z0-9_-]{1,40}')
# o tamanho: medido nas referências (OCR), 2,92% da altura no Chrome (56 px num 1080×1920) = 66 no libass (que mede a
# fonte de outro jeito); conferido pela largura de uma palavra lida pelo OCR nos dois
FONTE = 'SF Pro Display'
TAMANHO_ASS = 66 / 1920
SOMBRA_Y = 3 / 1920  # a sombra difusa: um pouco para baixo, borrada
SOMBRA_BLUR = 6 / 1920  # o blur em fração da altura (6 num 1080×1920, conferido lado a lado com a prévia; 12 em 4K)
SOMBRA_ALFA = 0x55  # 0 = opaca, 255 = invisível (ASS)
# o espaço entre as letras: a prévia aperta 0,01em; no libass, sem nada, a palavra sai 2 px mais larga num 1080×1920
# ("vulnerabilidades": 413 × 411 px); −0,13 px por letra (`\fsp`) iguala as duas
ESPACO = -0.13 / 1920


def do_projeto(p: dict) -> dict:
    lg = p.get('legenda') or {}
    ajustes = lg.get('ajustes') if isinstance(lg.get('ajustes'), dict) else {}
    return {'ligada': bool(lg.get('ligada', True)), 'modo': lg.get('modo') if lg.get('modo') in MODOS else 'palavra', 'ajustes': ajustes}


def validar(campos: dict, atual: dict) -> dict:
    """As escolhas novas por cima das atuais. `ajustes`: {id da palavra que começa o bloco: {fim?: id da última palavra,
    texto?: str ('' esconde o bloco)} | null (volta ao automático)}. Levanta ValueError se a forma estiver errada."""
    novo = {**atual, 'ajustes': dict(atual['ajustes'])}
    if 'ligada' in campos:
        novo['ligada'] = bool(campos['ligada'])
    if 'modo' in campos:
        if campos['modo'] not in MODOS:
            raise ValueError('Modo desconhecido')
        novo['modo'] = campos['modo']
    if campos.get('limpar'):
        novo['ajustes'] = {}
    for k, v in (campos.get('ajustes') or {}).items():
        if not _PALAVRA.fullmatch(str(k)):
            raise ValueError('Palavra inválida')
        if v is None:
            novo['ajustes'].pop(k, None)
            continue
        if not isinstance(v, dict):
            raise ValueError('Um ajuste é {fim, texto}')
        a = {}
        if v.get('fim') is not None:
            if not _PALAVRA.fullmatch(str(v['fim'])):
                raise ValueError('Palavra inválida')
            a['fim'] = str(v['fim'])
        if v.get('texto') is not None:
            a['texto'] = str(v['texto'])[:200]
        if a:
            novo['ajustes'][k] = a
        else:
            novo['ajustes'].pop(k, None)
    return novo


# ---------------------------------------------------------------- o ASS (a exportação)

def _tempo(t: float) -> str:
    cs = max(round(t * 100), 0)
    return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'


def _texto(s: str) -> str:
    """O texto num evento do ASS: sem chaves (abririam um bloco de tags) e com as quebras de linha do formato."""
    return s.replace('\\', '\\\\').replace('{', '(').replace('}', ')').replace('\n', '\\N')


def ass(blocos: list[dict], w: int, h: int) -> str:
    """O ASS dos blocos (`{ini, fim, texto, y}`, no tempo do vídeo final; `y`: o centro do texto, fração da altura).
    Cada bloco são dois eventos: a sombra (o texto em preto, borrado e um pouco abaixo) e o texto branco por cima."""
    tam = round(TAMANHO_ASS * h)
    esp = f'\\fsp{ESPACO * h:.2f}'  # no evento: o Spacing negativo do estilo o libass ignora
    cab = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,{FONTE},{tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,{round(w * 0.06)},{round(w * 0.06)},0,1
Style: Sombra,{FONTE},{tam},&H{SOMBRA_ALFA:02X}000000,&H{SOMBRA_ALFA:02X}000000,&H{SOMBRA_ALFA:02X}000000,&HFF000000,-1,0,0,0,100,100,0,0,1,0,0,5,{round(w * 0.06)},{round(w * 0.06)},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    linhas = []
    for b in blocos:
        texto = str(b.get('texto') or '').strip()
        if not texto or float(b['fim']) <= float(b['ini']):
            continue
        x, y = w / 2, float(b['y']) * h
        ini, fim = _tempo(float(b['ini'])), _tempo(float(b['fim']))
        linhas.append(f'Dialogue: 0,{ini},{fim},Sombra,,0,0,0,,{{\\pos({x:.0f},{y + SOMBRA_Y * h:.0f})\\blur{SOMBRA_BLUR * h:.1f}{esp}}}{_texto(texto)}')
        linhas.append(f'Dialogue: 1,{ini},{fim},Legenda,,0,0,0,,{{\\pos({x:.0f},{y:.0f}){esp}}}{_texto(texto)}')
    return cab + '\n'.join(linhas) + '\n'


def escrever(legenda: dict | None, w: int, h: int, destino: Path) -> Path | None:
    """Grava o ASS de `__render.legenda` (`{blocos}`) em `destino`; sem blocos (ou desligada), nada."""
    blocos = (legenda or {}).get('blocos') or []
    if not blocos:
        return None
    destino.write_text(ass(blocos, w, h), encoding='utf-8')
    return destino


def filtro(arquivo: Path) -> str:
    """O filtro do ffmpeg que desenha o ASS. O caminho vem do nome da exportação (texto do criador: espaços, apóstrofo,
    vírgula…), escapado nos dois níveis do ffmpeg, sem aspas (dentro delas um apóstrofo não tem escape): primeiro o
    valor da opção (`\\ ' :`), depois o grafo de filtros (`\\ ' [ ] , ;`)."""
    caminho = str(arquivo)
    for nivel in ("\\':", "\\'[],;"):
        for c in nivel:
            caminho = caminho.replace(c, '\\' + c)
    return f'ass=filename={caminho}'
