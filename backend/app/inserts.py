"""Inserts (SPEC §8.3): o criador liga, a cada plano com insert da direção, as mídias (vídeos e imagens) do BANCO.

Decisão de Rodrigo (out/2026): a captura automática (agente que buscava na web e gravava sites) saiu; por ora os inserts
são manuais. A direção diz o que acontece em cada insert e quais mídias ele pede (vídeo ou imagem, formato); aqui o
criador sobe os arquivos ou escolhe do banco, várias mídias por insert. Como elas aparecem (zoom, lado a lado, uma depois
da outra, destaques) é do Enriquecimento.

O banco de mídias fica em `banco.py`."""
import uuid


from . import banco, direcao, direcao_projeto, projeto

# ---------------------------------------------------------------- pedidos (a partir da direção)

def formato_do_plano(tipo: str) -> str:
    return 'vertical' if tipo == 'insert_tela_cheia' else 'dividida'


def chave(pl: dict) -> str:
    """Identidade de um pedido: mesmo tipo, mesmas palavras e mesma marcação = mesmo insert (sobrevive a versões novas)."""
    return '|'.join(str(pl.get(k) or '') for k in ('tipo', 'conteudo', 'palavra_ini', 'palavra_fim', 'descricao'))


def pedidos_da_direcao(itens: list[dict], saida: list[dict]) -> list[dict]:
    """Os planos com insert, em ordem, com a fala do bloco, a duração (do começo do plano ao começo do seguinte) e o
    insert da direção (narrativa e mídias pedidas)."""
    idx = {w['id']: k for k, w in enumerate(saida)}
    planos = sorted((i for i in itens if i['camada'] == 'plano' and i['palavra_ini'] in idx), key=lambda i: idx[i['palavra_ini']])
    fim_video = saida[-1]['saida_fim'] if saida else 0.0
    pedidos = []
    for n, pl in enumerate(planos):
        if not direcao.tem_insert(pl['tipo'], pl.get('conteudo')):
            continue
        k0 = idx[pl['palavra_ini']]
        k1 = (idx[planos[n + 1]['palavra_ini']] - 1) if n + 1 < len(planos) else len(saida) - 1
        t0 = 0.0 if n == 0 else saida[k0]['saida_ini']
        t1 = saida[idx[planos[n + 1]['palavra_ini']]]['saida_ini'] if n + 1 < len(planos) else fim_video
        pedidos.append({'plano': pl['id'], 'chave': chave(pl), 'tipo': pl['tipo'], 'conteudo': pl.get('conteudo'),
                        'palavra_ini': pl['palavra_ini'], 'palavra_fim': saida[k1]['id'], 'descricao': pl.get('descricao') or '',
                        'texto': pl.get('texto'), 'formato': formato_do_plano(pl['tipo']),
                        'fala': ' '.join(w['texto'] for w in saida[k0:k1 + 1]), 'inicio': round(t0, 3), 'duracao': round(max(t1 - t0, 0.3), 3)})
    return pedidos


def _midias_antigas(x: dict) -> list[dict]:
    """Pedidos do tempo do agente automático: o candidato escolhido de cada take vira uma mídia ligada."""
    out = []
    for tk in x.get('takes') or []:
        c = next((c for c in tk.get('candidatos') or [] if c['id'] == tk.get('escolhido')), None)
        if c and (banco.pasta_item(c['banco']) / 'item.json').exists():
            out.append({'id': uuid.uuid4().hex[:8], 'banco': c['banco']})
    return out


def sincronizar(id: str) -> dict:
    """Os pedidos da versão aberta da direção; os que já existiam (mesma chave) continuam com as suas mídias."""
    p = projeto.ler(id)
    d = p.get('direcao') or {}
    if not d.get('itens'):
        raise ValueError('Gere a direção visual antes dos inserts')
    saida = direcao_projeto._palavras_mantidas(id, p)
    novos = pedidos_da_direcao(d['itens'], saida)

    def aplicar(p):
        lista = (p.get('inserts') or {}).get('pedidos', [])
        antigos = {x['chave']: x for x in lista}
        # sem a mesma chave (o plano mudou de categoria ou foi dividido), o do mesmo plano: as mídias continuam com ele
        por_plano = {x.get('plano'): x for x in lista}
        usados: set[str] = set()
        pedidos = []
        for n in novos:
            velho = antigos.get(n['chave'])
            if velho is None or velho['id'] in usados:
                velho = por_plano.get(n['plano'])
                if velho is not None and velho['id'] in usados:
                    velho = None
            if velho is not None:
                usados.add(velho['id'])
            midias = (velho['midias'] if 'midias' in velho else _midias_antigas(velho)) if velho else []
            pedidos.append({'id': velho['id'] if velho else uuid.uuid4().hex[:8], **n, 'midias': midias,
                            **{k: velho[k] for k in ('capturas', 'captura', 'enriquecimento', 'comentario') if velho and velho.get(k)}})
        p['inserts'] = {**(p.get('inserts') or {}), 'versao': d.get('ativa'), 'pedidos': pedidos}
    return projeto.atualizar(id, aplicar)['inserts']


def definir_midias(id: str, pid: str, midias: list[dict]) -> dict:
    """A lista de mídias de um insert, em ordem: cada uma é um item do banco (original ou trecho)."""
    limpas = []
    for m in midias[:12]:
        bid = str(m.get('banco') or '')
        if not bid or not (banco.pasta_item(bid) / 'item.json').exists():
            raise LookupError(f'Mídia não encontrada no banco: {bid}')
        limpas.append({'id': str(m.get('id') or uuid.uuid4().hex[:8]), 'banco': bid})

    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                x['midias'] = limpas
                return
        raise LookupError('Pedido não encontrado')
    return projeto.atualizar(id, aplicar)['inserts']


# ---------------------------------------------------------------- enriquecimento (mock; SPEC §8.3)
# Como cada insert aparece: layout, entrada, como as mídias se combinam, movimento e saída. Cada plano vem com o ESTILO do
# tipo dele; o criador muda só o que quiser (o pedido guarda só o que difere do estilo). Por ora, a prévia aproxima o
# que é barato com CSS; o resto fica escolhido para o Enriquecimento de verdade.
OPCOES_ENRIQUECIMENTO = {
    'layout': {'vertical': ('tela_cheia', 'card', 'janela_3d', 'inclinado', 'destaque'),
               'dividida': ('metade', 'card_metade', 'janela_3d_metade', 'mesclada')},
    # deslizar, mola e girar saíram; "seca + zoom leve" entrou (Rodrigo, out/2026)
    'entrada': ('sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom'),
    'entrada_2': ('sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom'),  # a da 2ª mídia (insert com 2)
    # como 2 mídias convivem (decisão de Rodrigo, out/2026); 3 ou mais ficam em sequência, divididas igualmente
    'entre': ('sequencia', 'empilhadas', 'lado_a_lado'),  # cascata e picture-in-picture saíram (Rodrigo, out/2026)
    'movimento': ('parado', 'zoom_lento', 'zoom_ponto', 'rolagem'),
    'saida': ('corte', 'sumir', 'deslizar', 'voo_3d', 'zoom_borrado'),  # a configuração de cada uma é global (transicoes.py)
    'saida_2': ('corte', 'sumir', 'deslizar', 'voo_3d', 'zoom_borrado'),
}
ESTILO = {
    'vertical': {'layout': 'card', 'entrada': 'surgir', 'entrada_2': 'surgir', 'entre': 'sequencia', 'movimento': 'zoom_lento', 'saida': 'corte', 'saida_2': 'corte'},
    'dividida': {'layout': 'metade', 'entrada': 'surgir', 'entrada_2': 'surgir', 'entre': 'sequencia', 'movimento': 'zoom_lento', 'saida': 'corte', 'saida_2': 'corte'},
}


# onde a 2ª mídia começa, em fração do insert (0 a 0,95; padrão: no meio; 0 = junto com a 1ª, nos layouts juntos). A curva,
# a duração e os detalhes de cada entrada e saída não são mais por insert: são globais, por tipo (transicoes.py)
# divisão da tela (só tela dividida): automática pela mídia, fração do insert em cima (o ator embaixo) ou o insert atrás
# com o ator numa janela embaixo
DIVISOES = ('auto', '50', '56', '42', '32', 'atras')
AJUSTES = ('corte', 'preset', 'divisao', 'ajustes')  # preset: o id de um preset da biblioteca (presets.py), que manda em layout, entrada e saída


def _validar_enriquecimento(formato: str, campos: dict) -> dict:
    limpo = {}
    for k, v in campos.items():
        if k == 'preset' and v is not None:
            from . import presets
            if not isinstance(v, str) or not presets.existe(v):
                raise ValueError('Preset não encontrado')
            limpo[k] = v
            continue
        if k == 'corte' and v is not None:
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                raise ValueError('O corte é uma fração do insert')
            limpo[k] = round(max(0.0, min(0.95, float(v))), 3)  # 0: a 2ª começa junto (layouts em que as duas aparecem juntas)
            continue
        if k == 'ajustes':  # os ajustes rápidos do preset neste insert: {id: opção}
            if v is not None and not (isinstance(v, dict) and all(isinstance(a, str) and isinstance(b, str) and len(a) < 20 and len(b) < 20 for a, b in v.items())):
                raise ValueError('Ajustes inválidos')
            limpo[k] = v or None
            continue
        if k == 'divisao':
            if v is not None and v not in DIVISOES:
                raise ValueError('Divisão inválida')
            limpo[k] = None if v == 'auto' else v
            continue
        if k in AJUSTES:
            limpo[k] = None
            continue
        if k not in OPCOES_ENRIQUECIMENTO:
            raise ValueError(f'Categoria desconhecida: {k}')
        opcoes = OPCOES_ENRIQUECIMENTO[k][formato] if k == 'layout' else OPCOES_ENRIQUECIMENTO[k]
        if v is not None and v not in opcoes:
            raise ValueError(f'Opção inválida para {k}: {v}')
        limpo[k] = v
    return limpo


def enriquecer(id: str, pid: str, campos: dict) -> dict:
    """Muda o enriquecimento de um insert. `None` numa categoria volta ao estilo; o pedido guarda só o que difere."""
    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                novos = _validar_enriquecimento(x['formato'], campos)
                atual = {**(x.get('enriquecimento') or {}), **novos}
                # categorias e opções que não existem mais (o fundo por insert, entradas que saíram) caem fora
                validas = lambda k, v: v in (OPCOES_ENRIQUECIMENTO[k][x['formato']] if k == 'layout' else OPCOES_ENRIQUECIMENTO[k])  # noqa: E731
                x['enriquecimento'] = {k: v for k, v in atual.items()
                                       if v is not None and (k in AJUSTES or (k in ESTILO[x['formato']] and validas(k, v) and v != ESTILO[x['formato']][k]))}
                return
        raise LookupError('Pedido não encontrado')
    return projeto.atualizar(id, aplicar)['inserts']


def enriquecer_tipo(id: str, pid: str) -> dict:
    """Copia o enriquecimento deste insert para todos os inserts do mesmo tipo."""
    def aplicar(p):
        pedidos = (p.get('inserts') or {}).get('pedidos', [])
        x = next((x for x in pedidos if x['id'] == pid), None)
        if x is None:
            raise LookupError('Pedido não encontrado')
        for y in pedidos:
            if y['tipo'] == x['tipo']:
                y['enriquecimento'] = dict(x.get('enriquecimento') or {})
    return projeto.atualizar(id, aplicar)['inserts']


# ---------------------------------------------------------------- card de comentário (Comentário + insert + ator)
# Igual ao comentário do Instagram: foto, usuário e tempo borrados; o texto, "Responder" e (opcional) "Ver tradução".
# O texto padrão é o da direção; o pedido guarda só o que o criador mudou.
COMENTARIO_PADRAO = {'texto': None, 'avatar': 0, 'usuario': 'usuario.do.ig', 'tempo': '4 sem', 'traducao': True, 'x': 50.0, 'y': 50.0, 'escala': 1.0}


def configurar_comentario(id: str, pid: str, campos: dict) -> dict:
    """Muda o card de comentário de um insert. `None` num campo volta ao padrão."""
    limpo = {}
    for k, v in campos.items():
        if k not in COMENTARIO_PADRAO:
            raise ValueError(f'Campo desconhecido: {k}')
        if v is None:
            limpo[k] = None
        elif k in ('texto', 'usuario', 'tempo'):
            limpo[k] = str(v).strip()[:500 if k == 'texto' else 40]
        elif k == 'avatar':
            limpo[k] = max(0, min(4, int(v)))
        elif k == 'traducao':
            limpo[k] = bool(v)
        elif k in ('x', 'y'):
            limpo[k] = round(max(5.0, min(95.0, float(v))), 1)
        else:
            limpo[k] = round(max(0.6, min(1.6, float(v))), 2)

    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                if x['tipo'] != 'comentario_insert_ator':
                    raise ValueError('Este insert não tem comentário')
                atual = {**(x.get('comentario') or {}), **limpo}
                x['comentario'] = {k: v for k, v in atual.items() if v is not None and v != COMENTARIO_PADRAO[k]}
                return
        raise LookupError('Pedido não encontrado')
    return projeto.atualizar(id, aplicar)['inserts']


# ---------------------------------------------------------------- fundo (do projeto inteiro)
FUNDOS = ('verde_claro', 'papel', 'nevoa', 'chuva', 'gradiente')
FUNDO_PADRAO = 'gradiente'


def definir_fundo(id: str, fundo: str) -> dict:
    """O fundo atrás dos inserts com moldura vale para o vídeo todo (decisão de Rodrigo, out/2026)."""
    if fundo not in FUNDOS:
        raise ValueError(f'Fundo desconhecido: {fundo}')

    def aplicar(p):
        p.setdefault('inserts', {'versao': None, 'pedidos': []})['fundo'] = fundo
    return projeto.atualizar(id, aplicar)['inserts']


# ---------------------------------------------------------------- transição entre os planos (do vídeo todo)
TRANSICOES = ('seca', 'zoom', 'piscada')  # corte seco · zoom com desfoque (ref. "cursor free") · piscada suave


def definir_transicao(id: str, transicao: str) -> dict:
    """A transição em cada troca de plano, para o vídeo todo."""
    if transicao not in TRANSICOES:
        raise ValueError(f'Transição desconhecida: {transicao}')

    def aplicar(p):
        p.setdefault('inserts', {'versao': None, 'pedidos': []})['transicao'] = transicao
    return projeto.atualizar(id, aplicar)['inserts']
