"""Os presets recomendados de cada insert, aplicados de uma vez (docs/editor-claude.md, E3): a lista do insert na tela
(`presets/presets.ts`: presetsPara, serve, usosDe, comRecomendados; `ajustes.ts`: ajustesAoTrocar), trazida para o
backend para o Claude (pela CLI) e a tela usarem a mesma lógica. Portado do 19 (`ferramentas/presets.py escolher`), com
o rodízio entre vizinhos (um aprendizado do 19: "9 de 12 inserts com o mesmo preset") e respeitando as marcas de mão.

Cada pedido de insert com mídia e sem preset recebe o 1º favorito da sua situação (tela × nº de mídias × proporção, a
ordem de `dados/presets/ordem.json`) entre os aprovados que servem a ele; se o insert anterior já usa esse preset, o
próximo favorito que serve.
"""
from . import banco, inserts, presets, projeto

NOME_TELA = {'vertical': 'tela cheia', 'dividida': 'tela dividida', 'atras': 'ator embaixo'}


def n_midias(r: dict) -> int:
    return max((c['midia'] if c.get('midia') is not None else k) + 1 for k, c in enumerate(r['cards']))


def chave_midias(n: int) -> str:
    return '1' if n <= 1 else '2' if n == 2 else '2+'


def chave_proporcao(a: float) -> str:
    return 'pe' if a < 0.8 else 'quadrada' if a <= 1.2 else 'deitada'


def usos_de(p: dict) -> dict:
    if p.get('usos'):
        return p['usos']
    telas = p.get('formatos') or ['dividida', 'vertical']
    return {'telas': [*telas, 'atras'] if 'dividida' in telas else telas,
            'midias': ['2', '2+'] if p['receita'].get('repete') else [chave_midias(n_midias(p['receita']))]}


def serve(p: dict, n: int, tela: str | None = None, aspectos: list[float] | None = None) -> bool:
    u = usos_de(p)
    r = p['receita']
    cabe = n >= 1 if r.get('repete') else 1 <= n <= n_midias(r)
    props = not aspectos or not u.get('proporcoes') or all(chave_proporcao(a) in u['proporcoes'] for a in aspectos)
    return cabe and props and chave_midias(n) in u['midias'] and (not tela or tela in u['telas'])


def situacao(tela: str, aspectos: list[float]) -> str:
    n = len(aspectos)
    prop = (':pe' if chave_proporcao(aspectos[0]) == 'pe' else ':deitada') if n == 1 else ''
    return f'{tela}:{chave_midias(n)}{prop}'


def presets_para(lista: list[dict], formato: str, aspectos: list[float], atras: bool) -> list[dict]:
    ok = [p for p in lista if p.get('aprovado') and serve(p, len(aspectos), 'atras' if atras else formato, aspectos)]
    return sorted(ok, key=lambda p: p['formato'] != formato)


def com_recomendados(lista: list[dict], o: dict | None) -> tuple[list[dict], list[dict]]:
    if not o or not o.get('ids'):
        return [], lista
    pos = {pid: k for k, pid in enumerate(o['ids'])}
    todos = sorted(lista, key=lambda p: (pos.get(p['id'], len(o['ids'])), not p.get('aprovado')))
    fav = set(o['ids'][:o.get('favoritos', 0)])
    return [p for p in todos if p['id'] in fav], [p for p in todos if p['id'] not in fav]


def _estado(m: dict) -> dict:
    return m['de'] if 'de' in m else m['para']


def rapidos_de(p: dict) -> list[str]:
    """Os ajustes rápidos que o preset mostra (os marcados ou, sem marca, os deduzidos da receita, até 4; e o Som)."""
    r = p['receita']
    cs = r['cards']
    cheio = lambda c: c['repouso']['w'] >= 99 and c['repouso']['h'] >= 99  # noqa: E731
    desliza = lambda c: c['repouso']['w'] > 100 and abs(((c.get('saida') or {}).get('para') or {}).get('dx', 0)) >= 5 \
        and (((c.get('saida') or {}).get('para') or {}).get('escala', 1)) <= 1.05  # noqa: E731
    mergulho = lambda c: bool(c.get('saida')) and _estado(c['saida']).get('escala', 1) > 1.05  # noqa: E731
    deduzidos = [
        any(desliza(c) for c in cs) and 'deslize',
        (len(cs) == 1 or r.get('repete')) and not any(c.get('quadros') for c in cs) and 'forma',
        any(c.get('entrada') for c in cs) and 'entrada',
        any(c.get('zoom') or mergulho(c) for c in cs) and 'zoom',
        any(mergulho(c) for c in cs) and 'zona',
        (len(cs) > 1 or r.get('repete')) and 'proximo',
        any(c.get('saida') for c in cs) and 'saida',
        any(c.get('entrada') and _estado(c['entrada']).get('desfoque', 0) > 2 for c in cs) and 'desfoque',
        'camera',
        any(not cheio(c) for c in cs) and 'tamanho',
    ]
    ids = [x for x in (p.get('rapidos') if p.get('rapidos') is not None else [x for x in deduzidos if x][:4]) if x != 'som']
    return ids + ['som'] if any(s.get('som') for s in r.get('sons') or []) else ids


def aspectos_de(midias: list[dict]) -> list[float]:
    """A proporção (largura ÷ altura) de cada mídia do banco (um trecho, a do original); sem medida, 16:9."""
    out = []
    for m in midias:
        try:
            i = banco.ler_item(m['banco'])
        except (FileNotFoundError, KeyError):
            i = {}
        out.append(i['largura'] / i['altura'] if i.get('largura') and i.get('altura') else 16 / 9)
    return out


def aplicar(id: str, refazer: bool = False) -> list[dict]:
    """Aplica os recomendados aos inserts sem preset (ou a todos, com `refazer`), menos os marcados à mão (versoes.py).
    Devolve uma linha por insert: {plano, preset, nome, motivo} ou {plano, pulado}."""
    from . import versoes
    p = projeto.ler(id)
    pedidos = sorted((p.get('inserts') or {}).get('pedidos') or [], key=lambda x: x.get('inicio') or 0)
    marcados = {m['alvo'] for m in versoes.manuais(id) if m['etapa'] == 'inserts'}
    lista = sorted((x for x in presets.listar() if x.get('receita')), key=lambda x: (x['formato'], len(x['receita']['cards']), x.get('nome', '')))
    o = presets.ordem()
    out, anterior = [], None
    for x in pedidos:
        e = x.get('enriquecimento') or {}
        linha = {'plano': x['plano'], 'pedido': x['id']}
        if not x.get('midias'):
            out.append({**linha, 'pulado': 'sem mídia'})
            anterior = None
            continue
        if x['id'] in marcados:
            out.append({**linha, 'pulado': 'mudado à mão por Rodrigo', 'preset': e.get('preset')})
            anterior = e.get('preset')
            continue
        if e.get('preset') and not refazer:
            out.append({**linha, 'pulado': 'já tem preset', 'preset': e['preset']})
            anterior = e['preset']
            continue
        aspectos = aspectos_de(x['midias'])
        atras = e.get('divisao') == 'atras'
        tela = 'atras' if atras else x['formato']
        sit = situacao(tela, aspectos)
        recomendados, outros = com_recomendados(presets_para(lista, x['formato'], aspectos, atras), o.get(sit))
        candidatos = recomendados or outros
        if not candidatos:
            out.append({**linha, 'pulado': f'nenhum preset aprovado serve ({sit})'})
            anterior = None
            continue
        escolhido = next((c for c in candidatos if c['id'] != anterior), candidatos[0])
        motivo = (f'favorito de {sit}' if escolhido in recomendados else f'o 1º aprovado que serve a {sit}') + \
            (' (o anterior já usava o 1º)' if escolhido is not candidatos[0] else '')
        novo: dict = {'preset': escolhido['id']}
        if e.get('ajustes'):
            fica = {k: v for k, v in e['ajustes'].items() if k in {*rapidos_de(escolhido), 'y', 'largura'}}
            novo['ajustes'] = fica or None
        inserts.enriquecer(id, x['id'], novo)
        out.append({**linha, 'preset': escolhido['id'], 'nome': escolhido.get('nome'), 'motivo': motivo})
        anterior = escolhido['id']
    return out
