"""Presets de enriquecimento (SPEC §8.4): cada preset é uma **receita** completa de como as mídias de um insert aparecem —
quantas, onde fica cada card (posição, tamanho, inclinação, perspectiva, cantos, sombra), como cada uma entra e sai e a
**curva de cada propriedade** (posição, escala, giro, opacidade, desfoque). São feitos à mão pelo Claude a partir dos
trechos de referência que o criador manda (cada preset guarda de que trecho veio, e o trecho fica marcado nas
Referências). Ficam numa biblioteca global (`presets/<id>.json`) e só valem no Enriquecimento depois de aprovados na página Presets. Editar um preset vale para todos os inserts que o usam."""
import hashlib
import json
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path

from . import comum, referencias

RAIZ = Path(__file__).resolve().parents[2] / 'presets'
EXTERNAS = RAIZ / 'externas'  # vídeos de referência de fora das Referências (um post do Instagram): `externa:<nome>`


def video_da_fonte(ref: str) -> Path:
    """O vídeo de uma fonte: o de uma referência, ou um vídeo externo (`externa:<nome>` → presets/externas/<nome>.mp4)."""
    if ref.startswith('externa:'):
        nome = ref.split(':', 1)[1]
        if not re.fullmatch(r'[A-Za-z0-9_-]+', nome):
            raise FileNotFoundError(ref)
        return EXTERNAS / f'{nome}.mp4'
    return referencias.RAIZ / ref / 'proxy.mp4'


def quadro_9x16(cap, t: float):
    """O quadro do vídeo no instante `t`, cortado no centro para 9:16 e em 720×1280 (vídeos de outro formato, como os
    3:4 do Instagram, aparecem assim na revisão)."""
    import cv2

    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, f = cap.read()
    if not ok:
        raise FileNotFoundError('quadro da referência')
    h, w = f.shape[:2]
    if abs(w / h - 9 / 16) > 0.01:
        if w / h > 9 / 16:
            nw = int(round(h * 9 / 16))
            f = f[:, (w - nw) // 2:(w - nw) // 2 + nw]
        else:
            nh = int(round(w * 16 / 9))
            f = f[(h - nh) // 2:(h - nh) // 2 + nh]
    return cv2.resize(f, (720, 1280))
PROPRIEDADES = ('pos', 'escala', 'rot', 'opacidade', 'desfoque')
_trava = threading.Lock()


def _arq(pid: str) -> Path:
    if not re.fullmatch(r'[0-9a-f]{10}', pid or ''):
        raise FileNotFoundError(pid)
    return RAIZ / f'{pid}.json'


def ler(pid: str) -> dict:
    return comum.ler_json(_arq(pid))


def salvar(p: dict) -> dict:
    comum.salvar_json(_arq(p['id']), p)
    return p


def listar() -> list[dict]:
    if not RAIZ.exists():
        return []
    out = []
    for arq in RAIZ.glob('*.json'):
        try:
            out.append(comum.ler_json(arq))
        except ValueError:
            continue
    return sorted(out, key=lambda p: (p['formato'], len(p['receita']['cards']), p.get('nome', '')))


def existe(pid: str) -> bool:
    try:
        return _arq(pid).exists()
    except FileNotFoundError:
        return False


# ---------------------------------------------------------------- edição

_numero = comum.numero
_curva = comum.curva


LIMITES = {'cx': (-50, 150), 'cy': (-50, 150), 'w': (5, 200), 'h': (5, 200), 'rot': (-45, 45), 'rx': (-80, 80), 'ry': (-80, 80),
           'raio': (0, 30), 'z': (0, 9), 'dx': (-200, 200), 'dy': (-200, 200), 'escala': (0.05, 5), 'altura': (0.05, 5), 'opacidade': (0, 1),
           'desfoque': (0, 80), 'duracao': (0.04, 5), 'inicio_frac': (0, 0.95), 'sai_antes_do_fim': (0, 10)}


def validar_receita(r: dict) -> dict:
    """A receita limpa (números nos limites, curvas válidas); levanta ValueError se a forma estiver errada."""
    if r.get('formato') not in ('vertical', 'dividida') or not isinstance(r.get('cards'), list) or not r['cards']:
        raise ValueError('Receita inválida')
    cards = []
    for c in r['cards']:
        rep = {k: _numero(c['repouso'].get(k, d), *LIMITES[k]) for k, d in (('cx', 50), ('cy', 50), ('w', 80), ('h', 45), ('rot', 0), ('rx', 0), ('ry', 0), ('raio', 3), ('z', 1))}
        rep['sombra'] = bool(c['repouso'].get('sombra', True))
        if c['repouso'].get('desfoque'):  # desfoque permanente (um fundo feito da própria mídia)
            rep['desfoque'] = _numero(c['repouso']['desfoque'], 0, 80)
        novo = {'inicio_frac': _numero(c.get('inicio_frac', 0), *LIMITES['inicio_frac']), 'sai_antes_do_fim': _numero(c.get('sai_antes_do_fim', 0), *LIMITES['sai_antes_do_fim']),
                'repouso': rep, 'ajuste': c.get('ajuste') if c.get('ajuste') in ('cover', 'contain', 'topo') else 'cover'}
        if isinstance(c.get('quadros'), list) and c['quadros']:  # o card pelos 4 cantos ao longo da vida (medidos)
            novo['quadros'] = [{'f': _numero(x['f'], 0, 1), 'q': [[_numero(a, -2000, 2000), _numero(b, -2000, 2000)] for a, b in x['q'][:4]]}
                               for x in c['quadros'] if len(x.get('q') or []) >= 4]
        if c.get('fim_frac') is not None:  # termina numa fração do insert (uma tomada que acaba no corte)
            novo['fim_frac'] = _numero(c['fim_frac'], 0.01, 1)
        if isinstance(c.get('midia'), int) and 0 <= c['midia'] < 9:  # o card mostra outra mídia (mosaico com repetição)
            novo['midia'] = c['midia']
        zm = c.get('zoom')  # zoom no conteúdo do card (a moldura fica igual)
        novo['zoom'] = {'inicio': _numero(zm.get('inicio', 0), 0, 30), 'duracao': _numero(zm.get('duracao', 0.8), 0.05, 10),
                        'escala': _numero(zm.get('escala', 1.5), 0.2, 5), 'ox': _numero(zm.get('ox', 50), 0, 100),
                        'oy': _numero(zm.get('oy', 50), 0, 100), 'curva': _curva(zm.get('curva') or [0.65, 0, 0.35, 1])} if isinstance(zm, dict) else None
        z = c.get('continuo')  # zoom/deslocamento/giro lento enquanto o card está na tela (fração, % e graus por segundo)
        novo['continuo'] = {'escala': _numero(z.get('escala', 0), -0.5, 1), 'dx': _numero(z.get('dx', 0), -50, 50),
                            'dy': _numero(z.get('dy', 0), -50, 50), 'rot': _numero(z.get('rot', 0), -45, 45)} if isinstance(z, dict) else None
        for lado, chave in (('entrada', 'de'), ('saida', 'para')):
            t = c.get(lado)
            if not t:
                novo[lado] = None
                continue
            estado = {k: _numero(t.get(chave, {}).get(k, d), *LIMITES[k]) for k, d in (('dx', 0), ('dy', 0), ('escala', 1), ('altura', 1), ('rot', 0), ('rx', 0), ('ry', 0), ('opacidade', 1), ('desfoque', 0))}
            novo[lado] = {'duracao': _numero(t.get('duracao', 0.5), *LIMITES['duracao']), chave: estado,
                          'curvas': {k: _curva(v) for k, v in (t.get('curvas') or {}).items() if k in PROPRIEDADES},
                          'atraso': {k: _numero(v, 0, 3) for k, v in (t.get('atraso') or {}).items() if k in PROPRIEDADES},
                          'dur': {k: _numero(v, 0.04, 5) for k, v in (t.get('dur') or {}).items() if k in PROPRIEDADES}}
        cards.append(novo)
    return {'formato': r['formato'], 'fundo': r.get('fundo') if r.get('fundo') in ('proprio', 'nenhum') else 'proprio',
            'duracao_ref': _numero(r.get('duracao_ref', 2.5), 0.2, 30), 'cards': cards, **({'repete': True} if r.get('repete') else {})}


def editar(pid: str, campos: dict) -> dict:
    """Nome, aprovação, formato e a receita (inteira, validada). Vale para todos os inserts que usam o preset."""
    with _trava:
        p = ler(pid)
        if 'nome' in campos and str(campos['nome']).strip():
            p['nome'] = str(campos['nome']).strip()[:80]
        if 'aprovado' in campos:
            p['aprovado'] = bool(campos['aprovado'])
        if 'receita' in campos:
            p['receita'] = validar_receita(campos['receita'])
            p['formato'] = p['receita']['formato']
        if campos.get('formato') in ('vertical', 'dividida'):  # o formato para o qual a receita foi desenhada
            p['formato'] = p['receita']['formato'] = campos['formato']
        if 'formatos' in campos:  # onde o preset aparece: um formato só, ou os dois (no outro, adaptado)
            fs = sorted({f for f in campos['formatos'] or [] if f in ('vertical', 'dividida')})
            if not fs:
                raise ValueError('Escolha ao menos um formato')
            p['formatos'] = fs
            if len(fs) == 1:
                p['formato'] = p['receita']['formato'] = fs[0]
        return salvar(p)


def apagar(pid: str) -> None:
    _arq(pid).unlink(missing_ok=True)


# ---------------------------------------------------------------- criação

def criar(nome: str, receita: dict, fontes: list[dict], recortes: list[dict] | None = None, descricao: str = '') -> dict:
    """Um preset novo, feito à mão (pelo Claude, olhando a referência que o criador mandou): a receita validada e de
    onde ela veio (`fontes`: ref, início e fim do trecho), para a revisão lado a lado e a marcação nas Referências.
    `recortes` (um por card, opcional): onde está a mídia de cada card num quadro da 1ª fonte — `t` (s desde o início do
    trecho) e os 4 cantos `quad` em px de 720×1280 (sup-esq, sup-dir, inf-dir, inf-esq) —, para a miniatura da revisão
    sair certa mesmo com o card em perspectiva ou passando da tela; ou `arquivo`, uma imagem pronta em presets/amostras
    (a mídia inteira de um vídeo de outro formato)."""
    r = validar_receita(receita)
    fontes = [{'ref': f['ref'], 'inicio': float(f['inicio']), 'fim': float(f['fim'])} for f in fontes]
    for f in fontes:
        if f['ref'].startswith('externa:') and not video_da_fonte(f['ref']).exists():
            raise ValueError(f"Vídeo da fonte não encontrado: {f['ref']}")
    p = {'id': uuid.uuid4().hex[:10], 'nome': nome.strip() or 'Preset', 'descricao': descricao.strip(), 'formato': r['formato'],
         'receita': r, 'fontes': fontes, 'aprovado': False, 'criado_em': datetime.now().isoformat(timespec='seconds')}
    if recortes:
        p['recortes'] = [{'t': float(x.get('t', 0)), 'arquivo': Path(x['arquivo']).name} if x.get('arquivo')
                         else {'t': float(x['t']), 'quad': [[float(a), float(b)] for a, b in x['quad']]} for x in recortes]
    return salvar(p)


def fontes() -> list[dict]:
    """Os trechos de referência que já viraram preset (para marcar nas Referências)."""
    return [{**f, 'preset': p['id'], 'nome': p['nome'], 'aprovado': p.get('aprovado', False)} for p in listar() for f in p.get('fontes', [])
            if not f['ref'].startswith('externa:')]


def amostra(pid: str, k: int) -> Path:
    """Um recorte do card `k` parado na primeira referência do preset (para a prévia lado a lado)."""
    p = ler(pid)
    fonte = p['fontes'][0]
    cards = p['receita']['cards']
    card = cards[min(k, len(cards) - 1)]  # numa receita que repete, o molde serve às mídias seguintes
    # o nome muda quando o trecho ou a posição do card muda (o recorte antigo deixa de valer)
    recortes = p.get('recortes') or []
    recorte = recortes[k] if k < len(recortes) else None
    chave = hashlib.sha1(json.dumps([fonte, card['repouso'], card['inicio_frac'], card['entrada'], p['formato'], recorte], sort_keys=True).encode()).hexdigest()[:8]
    destino = RAIZ / 'amostras' / f'{pid}_{k}_{chave}.jpg'
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    if recorte and recorte.get('arquivo'):  # a mídia já recortada (presets/amostras/<arquivo>)
        arq = RAIZ / 'amostras' / Path(recorte['arquivo']).name
        if arq.exists():
            return arq
    if recorte and recorte.get('quad'):
        return _recortar(fonte, recorte, destino)
    dur = fonte['fim'] - fonte['inicio']
    entra = card['inicio_frac'] * dur + ((card['entrada'] or {}).get('duracao') or 0)
    t = fonte['inicio'] + min(entra + 0.15, dur - (card['sai_antes_do_fim'] + ((card['saida'] or {}).get('duracao') or 0)) - 0.05)
    rep = card['repouso']
    area_h = 1280 if p['formato'] == 'vertical' else 640
    # o retângulo do card no quadro de 720 px, limitado às bordas (o card pode passar delas)
    x0 = max(rep['cx'] / 100 * 720 - rep['w'] / 100 * 720 / 2, 0)
    y0 = max(rep['cy'] / 100 * area_h - rep['h'] / 100 * area_h / 2, 0)
    x1 = min(rep['cx'] / 100 * 720 + rep['w'] / 100 * 720 / 2, 720)
    y1 = min(rep['cy'] / 100 * area_h + rep['h'] / 100 * area_h / 2, area_h)
    import cv2

    f = quadro_9x16(cv2.VideoCapture(str(video_da_fonte(fonte['ref']))), max(t, 0))
    cv2.imwrite(str(destino), f[int(y0):int(max(y1, y0 + 8)), int(x0):int(max(x1, x0 + 8))], [cv2.IMWRITE_JPEG_QUALITY, 90])
    return destino


def _recortar(fonte: dict, recorte: dict, destino: Path) -> Path:
    """A mídia do card pelos 4 cantos num quadro da referência, desentortada num retângulo."""
    import cv2
    import numpy as np

    f = quadro_9x16(cv2.VideoCapture(str(video_da_fonte(fonte['ref']))), fonte['inicio'] + recorte['t'])
    q = np.float32(recorte['quad'])
    w = int(round((np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2))
    h = int(round((np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2))
    H = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [w, 0], [w, h], [0, h]]))
    cv2.imwrite(str(destino), cv2.warpPerspective(f, H, (w, h)), [cv2.IMWRITE_JPEG_QUALITY, 90])
    return destino


def quadro(ref: str, t: float) -> Path:
    """Um quadro da referência no instante `t` (s do vídeo), em 360 px de largura: a foto parada da revisão (o vídeo só
    carrega quando toca)."""
    import cv2

    destino = RAIZ / 'amostras' / f'q_{re.sub(r"[^A-Za-z0-9_-]", "_", ref)}_{t:.3f}.jpg'
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    f = quadro_9x16(cv2.VideoCapture(str(video_da_fonte(ref))), t)
    cv2.imwrite(str(destino), cv2.resize(f, (360, 640)), [cv2.IMWRITE_JPEG_QUALITY, 85])
    return destino

