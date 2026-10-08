"""Entradas e saídas dos inserts (SPEC §8.4): cada tipo tem uma configuração **global** — curva, duração e os detalhes do
movimento (de onde vem, para onde vai, se tem fade…) —, que vale para todos os inserts de todos os projetos que o usam
(decisão de Rodrigo, out/2026: configurou uma vez, fica sendo o padrão daquele tipo). Fica nas Configurações (`transicoes`)."""
from . import comum, projeto

DIRECOES = ('cima', 'baixo', 'esquerda', 'direita')

# o padrão de fábrica de cada tipo; os números são % (posição, escala, deslocamento), graus, px (desfoque) e segundos
PADRAO = {
    'entrada': {
        'surgir': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.75, 'escala': 94},
        'subir': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.75, 'direcao': 'cima', 'distancia': 40, 'fim': 0, 'fade': True},  # "Deslizar"
        'voo_3d': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.9, 'angulo': 55, 'deslocamento': 30, 'fade': True},
        'zoom_borrado': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.75, 'escala': 125, 'desfoque': 14, 'fade': True},
        'seco_zoom': {'curva': [0.16, 1, 0.3, 1], 'zoom': 106},  # dura a mídia toda
    },
    'saida': {
        'sumir': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.4},
        'deslizar': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.5, 'direcao': 'baixo', 'distancia': 40, 'fade': True},
        'voo_3d': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.6, 'angulo': 55, 'deslocamento': 30, 'fade': True},
        'zoom_borrado': {'curva': [0.16, 1, 0.3, 1], 'duracao': 0.5, 'escala': 125, 'desfoque': 14, 'fade': True},
    },
}
# limites de cada campo numérico
LIMITES = {'duracao': (0.25, 5), 'escala': (50, 200), 'distancia': (0, 150), 'fim': (-50, 50), 'angulo': (0, 90),
           'deslocamento': (0, 100), 'desfoque': (0, 40), 'zoom': (100, 130)}


def ler() -> dict:
    """A configuração de cada tipo: o padrão de fábrica com o que o criador mudou por cima."""
    salvo = projeto.ler_config().get('transicoes') or {}
    return {lado: {tipo: {**cfg, **(salvo.get(lado, {}).get(tipo) or {})} for tipo, cfg in tipos.items()} for lado, tipos in PADRAO.items()}


def definir(lado: str, tipo: str, campos: dict) -> dict:
    """Muda a configuração global de um tipo (`None` num campo volta ao padrão de fábrica)."""
    if lado not in PADRAO or tipo not in PADRAO[lado]:
        raise ValueError('Transição desconhecida')
    base = PADRAO[lado][tipo]
    limpo: dict = {}
    for k, v in campos.items():
        if k not in base:
            raise ValueError(f'Campo desconhecido: {k}')
        if v is None:
            limpo[k] = None
        elif k == 'curva':
            limpo[k] = comum.curva(v, casas=3)
        elif k == 'direcao':
            if v not in DIRECOES:
                raise ValueError('Direção inválida')
            limpo[k] = v
        elif k == 'fade':
            limpo[k] = bool(v)
        else:
            n = comum.numero(v, *LIMITES[k])
            limpo[k] = round(n * 4) / 4 if k == 'duracao' else round(n, 1)
    config = projeto.ler_config()
    todas = config.get('transicoes') or {}
    atual = {**(todas.get(lado, {}).get(tipo) or {}), **limpo}
    todas.setdefault(lado, {})[tipo] = {k: v for k, v in atual.items() if v is not None and v != base[k]}
    config['transicoes'] = todas
    projeto.salvar_config(config)
    return ler()
