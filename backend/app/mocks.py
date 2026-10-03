"""Dados falsos da fase 2 (SPEC §15): transcrição, timeline multitrilha e respostas do agente.
Sai inteiro quando cada etapa ganhar lógica real."""
from datetime import datetime
from itertools import count

# (frase, fica?) — retomadas e tentativas abandonadas saem, como faria a etapa de Cortes.
ROTEIRO = [
    ('Qual é a melhor IA do mundo para design?', True),
    ('A galera fala muito do', False),
    ('A galera fala muito do GPT, do Gemini, do Claude.', True),
    ('Só que na minha opinião isso é uma', False),
    ('Só que na minha opinião isso é uma bobagem.', True),
    ('Muito mais importante do que usar uma boa IA é dominar um bom processo de design.', True),
    ('Olha só esses dois sites aqui.', True),
    ('O primeiro eu fiz com um prompt', False),
    ('O primeiro eu fiz com um prompt genérico, sem referência nenhuma.', True),
    ('O segundo eu fiz seguindo um processo, com referências e um design system.', True),
    ('E a diferença é absurda.', True),
    ('Se tu quiser entender melhor', False),
    ('Se você quiser entender melhor esse processo, comenta design aqui embaixo que eu te mando.', True),
]

RESPOSTAS = {
    'cortes': ('Troquei a abertura pela última tentativa completa e encurtei a pausa antes de "Olha só".',
               ['ver_transcricao()', 'remover_palavras(w00009–w00014)', 'ajustar_respiro(c3→c4, −0.4 s)']),
    'inserts': ('Sugeri a gravação do site genérico no trecho "O primeiro eu fiz…" e o site com processo logo depois.',
                ['buscar_apoio("site gerado")', 'inserir_apoio(V2, w00052–w00061)']),
    'motion': ('Criei um motion comparando "prompt genérico × processo" sobre a frase da diferença.',
               ['criar_motion("comparativo")', 'encaixar_motion(V3, w00078–w00081)']),
    'legenda': ('Quebrei as legendas em blocos de até 4 palavras e destaquei "processo".',
                ['gerar_legendas()', 'destacar_palavra("processo")']),
}


def _palavras(duracao: float) -> list[dict]:
    """Espalha o roteiro pela duração do bruto, com pausas maiores entre tentativas."""
    brutas, t = [], 0.6
    for frase, fica in ROTEIRO:
        for texto in frase.split():
            fim = t + 0.12 + 0.045 * len(texto)
            brutas.append({'texto': texto, 'inicio': t, 'fim': fim, 'fica': fica})
            t = fim + 0.06
        t += 0.5 if fica else 1.4
    escala = max(duracao, 1) * 0.95 / t
    return [
        {'id': f'w{i:05d}', 'texto': p['texto'], 'inicio': round(p['inicio'] * escala, 3),
         'fim': round(p['fim'] * escala, 3), 'fica': p['fica']}
        for i, p in enumerate(brutas)
    ]


def _trechos(palavras: list[dict]) -> list[tuple[int, int]]:
    """Índices (primeiro, último) de cada sequência contínua de palavras mantidas."""
    trechos, ini = [], None
    for i, p in enumerate(palavras):
        if p['fica'] and ini is None:
            ini = i
        if not p['fica'] and ini is not None:
            trechos.append((ini, i - 1))
            ini = None
    if ini is not None:
        trechos.append((ini, len(palavras) - 1))
    return trechos


def _achar(palavras: list[dict], trecho: str) -> tuple[str, str]:
    """IDs da primeira e da última palavra da ocorrência MANTIDA de `trecho`."""
    alvo = trecho.split()
    for i in range(len(palavras) - len(alvo) + 1):
        janela = palavras[i:i + len(alvo)]
        if all(p['fica'] for p in janela) and [p['texto'] for p in janela] == alvo:
            return janela[0]['id'], janela[-1]['id']
    raise ValueError(trecho)


def editor(projeto: dict) -> dict:
    bruto = next(f for f in projeto['fontes'] if f['papel'] == 'bruto')
    palavras = _palavras(bruto['duracao'])
    # folga de respiro nas bordas, sem invadir a palavra vizinha
    v1 = [{'id': f'c{n}', 'fonte': bruto['id'],
           'inicio': round(max(palavras[a]['inicio'] - 0.08, palavras[a - 1]['fim'] if a else 0), 3),
           'fim': round(min(palavras[b]['fim'] + 0.12,
                            palavras[b + 1]['inicio'] if b + 1 < len(palavras) else bruto['duracao']), 3),
           'palavra_ini': palavras[a]['id'], 'palavra_fim': palavras[b]['id']}
          for n, (a, b) in enumerate(_trechos(palavras), 1)]

    apoios = [f['nome_original'] for f in projeto['fontes'] if f['papel'] == 'apoio']
    apoios += ['site_prompt_generico.mp4', 'site_com_processo.mp4'][len(apoios):]
    v2 = [
        {'id': 'i1', 'rotulo': apoios[0], 'trecho': 'O primeiro eu fiz com um prompt genérico, sem referência nenhuma.'},
        {'id': 'i2', 'rotulo': apoios[1], 'trecho': 'O segundo eu fiz seguindo um processo, com referências e um design system.'},
    ]
    v3 = [
        {'id': 'm1', 'rotulo': 'Ferramenta < processo', 'trecho': 'é dominar um bom processo de design.'},
        {'id': 'm2', 'rotulo': 'Comparativo lado a lado', 'trecho': 'E a diferença é absurda.'},
    ]
    for item in v2 + v3:
        item['palavra_ini'], item['palavra_fim'] = _achar(palavras, item.pop('trecho'))

    mantidas = [p for p in palavras if p['fica']]
    ids = count(1)
    leg = [{'id': f'l{next(ids)}', 'texto': ' '.join(p['texto'] for p in bloco),
            'palavra_ini': bloco[0]['id'], 'palavra_fim': bloco[-1]['id']}
           for bloco in (mantidas[i:i + 4] for i in range(0, len(mantidas), 4))]

    for p in palavras:
        del p['fica']  # a seleção vive só na V1, como na etapa real
    return {'mock': True, 'palavras': palavras, 'timeline': {'V1': v1, 'V2': v2, 'V3': v3, 'LEG': leg}}


def mensagem(autor: str, texto: str, ferramentas: list[str] | None = None) -> dict:
    return {'autor': autor, 'texto': texto, 'ferramentas': ferramentas or [], 'mock': autor == 'agente',
            'criado_em': datetime.now().isoformat(timespec='seconds')}


def responder(etapa: str) -> dict:
    texto, ferramentas = RESPOSTAS[etapa]
    return mensagem('agente', texto, ferramentas)
