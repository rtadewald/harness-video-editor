"""Partes ainda simuladas (SPEC §15): trilhas V2, V3 e LEG e as respostas do agente.
As trilhas ficam ancoradas nas palavras reais mantidas, então acompanham os cortes de verdade."""
from datetime import datetime

RESPOSTAS = {
    'cortes': ('Troquei a abertura pela última tentativa completa e encurtei a pausa antes da segunda frase.',
               ['ver_transcricao()', 'remover_palavras(w00009–w00014)', 'ajustar_respiro(c3→c4, −0.4 s)']),
    'inserts': ('Sugeri a gravação do primeiro site no trecho em que você o cita e o segundo logo depois.',
                ['buscar_apoio("site")', 'inserir_apoio(V2, …)']),
    'motion': ('Criei um motion comparativo sobre a frase de virada.',
               ['criar_motion("comparativo")', 'encaixar_motion(V3, …)']),
    'legenda': ('Quebrei as legendas em blocos de até 4 palavras.',
                ['gerar_legendas()', 'destacar_palavra(…)']),
}


def trilhas(palavras: list[dict], projeto: dict) -> dict:
    """V2, V3 e LEG falsas, presas a palavras mantidas (campo `mantida`)."""
    mantidas = [p for p in palavras if p.get('mantida')]
    n = len(mantidas)
    if not n:
        return {'V2': [], 'V3': [], 'LEG': []}

    def faixa(a: float, b: float) -> dict:
        i = min(int(a * n), n - 1)
        j = max(min(int(b * n), n - 1), i)
        return {'palavra_ini': mantidas[i]['id'], 'palavra_fim': mantidas[j]['id']}

    apoios = [f['nome_original'] for f in projeto['fontes'] if f['papel'] == 'apoio']
    apoios += ['apoio_exemplo_1.mp4', 'apoio_exemplo_2.mp4'][len(apoios):]
    return {
        'V2': [{'id': 'i1', 'rotulo': apoios[0], **faixa(0.30, 0.38)},
               {'id': 'i2', 'rotulo': apoios[1], **faixa(0.55, 0.63)}],
        'V3': [{'id': 'm1', 'rotulo': 'Motion de abertura', **faixa(0.12, 0.17)},
               {'id': 'm2', 'rotulo': 'Comparativo lado a lado', **faixa(0.78, 0.84)}],
        'LEG': [{'id': f'l{k + 1}', 'texto': ' '.join(p['texto'] for p in bloco),
                 'palavra_ini': bloco[0]['id'], 'palavra_fim': bloco[-1]['id']}
                for k, bloco in enumerate(mantidas[i:i + 4] for i in range(0, n, 4))],
    }


def mensagem(autor: str, texto: str, ferramentas: list[str] | None = None) -> dict:
    return {'autor': autor, 'texto': texto, 'ferramentas': ferramentas or [], 'mock': autor == 'agente',
            'criado_em': datetime.now().isoformat(timespec='seconds')}


def responder(etapa: str) -> dict:
    texto, ferramentas = RESPOSTAS[etapa]
    return mensagem('agente', texto, ferramentas)
