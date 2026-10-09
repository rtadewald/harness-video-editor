"""Entradas e saídas dos inserts (SPEC §8.4): cada tipo tem uma configuração **global** — curva, duração e os detalhes do
movimento (de onde vem, para onde vai, se tem fade…) —, que vale para todos os inserts de todos os projetos que o usam
(decisão de Rodrigo, out/2026: configurou uma vez, fica sendo o padrão daquele tipo). Fica nas Configurações (`entradas`;
até out/2026 a chave era `transicoes`, que `migrar` passa para `entradas` quando o servidor sobe). O nome "transições"
ficou para as transições entre planos (SPEC §8.8)."""
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


def _antiga(config: dict) -> dict | None:
    """A configuração antiga (a chave `transicoes` no formato destas configurações, `{entrada, saida}`), se ainda está lá
    e a nova não existe."""
    antiga = config.get('transicoes')
    if 'entradas' in config or not isinstance(antiga, dict) or not antiga or not set(antiga) <= set(PADRAO):
        return None
    return antiga


def migrar() -> bool:
    """Passa a configuração antiga de `transicoes` para `entradas` e apaga a chave antiga, que fica livre para as
    transições entre planos. Roda quando o servidor sobe, antes de qualquer outra área gravar em `transicoes`."""
    config = projeto.ler_config()
    antiga = _antiga(config)
    if antiga is None:
        return False
    config['entradas'] = antiga
    del config['transicoes']
    projeto.salvar_config(config)
    return True


def _salvas(config: dict) -> dict:
    """O que o criador mudou: a chave `entradas` (ou a antiga, se ainda não foi migrada)."""
    return config.get('entradas') or _antiga(config) or {}


def ler() -> dict:
    """A configuração de cada tipo: o padrão de fábrica com o que o criador mudou por cima."""
    salvo = _salvas(projeto.ler_config())
    return {lado: {tipo: {**cfg, **(salvo.get(lado, {}).get(tipo) or {})} for tipo, cfg in tipos.items()} for lado, tipos in PADRAO.items()}


def definir(lado: str, tipo: str, campos: dict) -> dict:
    """Muda a configuração global de um tipo (`None` num campo volta ao padrão de fábrica)."""
    if lado not in PADRAO or tipo not in PADRAO[lado]:
        raise ValueError('Entrada ou saída desconhecida')
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
    migrar()
    config = projeto.ler_config()
    todas = _salvas(config)
    atual = {**(todas.get(lado, {}).get(tipo) or {}), **limpo}
    todas.setdefault(lado, {})[tipo] = {k: v for k, v in atual.items() if v is not None and v != base[k]}
    config['entradas'] = todas
    projeto.salvar_config(config)
    return ler()
