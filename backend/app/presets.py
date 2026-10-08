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
           'raio': (0, 30), 'z': (0, 9), 'dx': (-200, 200), 'dy': (-200, 200), 'escala': (0.05, 3), 'opacidade': (0, 1),
           'desfoque': (0, 80), 'duracao': (0.04, 5), 'inicio_frac': (0, 0.95), 'sai_antes_do_fim': (0, 10)}


def validar_receita(r: dict) -> dict:
    """A receita limpa (números nos limites, curvas válidas); levanta ValueError se a forma estiver errada."""
    if r.get('formato') not in ('vertical', 'dividida') or not isinstance(r.get('cards'), list) or not r['cards']:
        raise ValueError('Receita inválida')
    cards = []
    for c in r['cards']:
        rep = {k: _numero(c['repouso'].get(k, d), *LIMITES[k]) for k, d in (('cx', 50), ('cy', 50), ('w', 80), ('h', 45), ('rot', 0), ('rx', 0), ('ry', 0), ('raio', 3), ('z', 1))}
        rep['sombra'] = bool(c['repouso'].get('sombra', True))
        novo = {'inicio_frac': _numero(c.get('inicio_frac', 0), *LIMITES['inicio_frac']), 'sai_antes_do_fim': _numero(c.get('sai_antes_do_fim', 0), *LIMITES['sai_antes_do_fim']),
                'repouso': rep, 'ajuste': c.get('ajuste') if c.get('ajuste') in ('cover', 'contain', 'topo') else 'cover'}
        for lado, chave in (('entrada', 'de'), ('saida', 'para')):
            t = c.get(lado)
            if not t:
                novo[lado] = None
                continue
            estado = {k: _numero(t.get(chave, {}).get(k, d), *LIMITES[k]) for k, d in (('dx', 0), ('dy', 0), ('escala', 1), ('rot', 0), ('rx', 0), ('ry', 0), ('opacidade', 1), ('desfoque', 0))}
            novo[lado] = {'duracao': _numero(t.get('duracao', 0.5), *LIMITES['duracao']), chave: estado,
                          'curvas': {k: _curva(v) for k, v in (t.get('curvas') or {}).items() if k in PROPRIEDADES},
                          'atraso': {k: _numero(v, 0, 3) for k, v in (t.get('atraso') or {}).items() if k in PROPRIEDADES},
                          'dur': {k: _numero(v, 0.04, 5) for k, v in (t.get('dur') or {}).items() if k in PROPRIEDADES}}
        cards.append(novo)
    return {'formato': r['formato'], 'fundo': r.get('fundo') if r.get('fundo') in ('proprio', 'nenhum') else 'proprio',
            'duracao_ref': _numero(r.get('duracao_ref', 2.5), 0.2, 30), 'cards': cards}


def editar(pid: str, campos: dict) -> dict:
    """Nome, aprovação e a receita (inteira, validada). Vale para todos os inserts que usam o preset."""
    with _trava:
        p = ler(pid)
        if 'nome' in campos and str(campos['nome']).strip():
            p['nome'] = str(campos['nome']).strip()[:80]
        if 'aprovado' in campos:
            p['aprovado'] = bool(campos['aprovado'])
        if 'receita' in campos:
            p['receita'] = validar_receita(campos['receita'])
        return salvar(p)


def apagar(pid: str) -> None:
    _arq(pid).unlink(missing_ok=True)


# ---------------------------------------------------------------- criação

def criar(nome: str, receita: dict, fontes: list[dict]) -> dict:
    """Um preset novo, feito à mão (pelo Claude, olhando a referência que o criador mandou): a receita validada e de
    onde ela veio (`fontes`: ref, início e fim do trecho), para a revisão lado a lado e a marcação nas Referências."""
    r = validar_receita(receita)
    fontes = [{'ref': f['ref'], 'inicio': float(f['inicio']), 'fim': float(f['fim'])} for f in fontes]
    return salvar({'id': uuid.uuid4().hex[:10], 'nome': nome.strip() or 'Preset', 'formato': r['formato'], 'receita': r,
                   'fontes': fontes, 'aprovado': False, 'criado_em': datetime.now().isoformat(timespec='seconds')})


def fontes() -> list[dict]:
    """Os trechos de referência que já viraram preset (para marcar nas Referências)."""
    return [{**f, 'preset': p['id'], 'nome': p['nome'], 'aprovado': p.get('aprovado', False)} for p in listar() for f in p.get('fontes', [])]


def amostra(pid: str, k: int) -> Path:
    """Um recorte do card `k` parado na primeira referência do preset (para a prévia lado a lado)."""
    p = ler(pid)
    fonte = p['fontes'][0]
    card = p['receita']['cards'][k]
    # o nome muda quando o trecho ou a posição do card muda (o recorte antigo deixa de valer)
    chave = hashlib.sha1(json.dumps([fonte, card['repouso'], card['inicio_frac'], card['entrada'], p['formato']], sort_keys=True).encode()).hexdigest()[:8]
    destino = RAIZ / 'amostras' / f'{pid}_{k}_{chave}.jpg'
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
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
    from . import midia
    midia.ffmpeg('-ss', f'{max(t, 0):.3f}', '-i', str(referencias.RAIZ / fonte['ref'] / 'proxy.mp4'), '-frames:v', '1',
                 '-vf', f'crop={max(x1 - x0, 8):.0f}:{max(y1 - y0, 8):.0f}:{x0:.0f}:{y0:.0f}', '-q:v', '3', str(destino))
    return destino
