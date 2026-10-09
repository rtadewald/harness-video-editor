"""Ferramenta do Claude: grava as transições entre planos recriadas das referências (docs/transicoes.md) em
`transicoes/` e as favoritas de cada par (`transicoes/ordem.json`), pela frequência em `transicoes/pares.json`
(`transicoes_analisar.py`).

O que as referências mostram (out/2026, 294 cortes entre planos, 30 pares): a grande maioria é corte seco; os sons de
corte caem sobre cortes secos — o Click Classic no corte (~8 dB abaixo da voz: Médio), a Instant Camera no corte para
um insert de tela cheia e o Riser 07 terminando no corte para o ator (os dois ~15–20 dB abaixo: Baixo); os efeitos
visuais de verdade são poucos e foram conferidos quadro a quadro: a luz colorida (com o clique), o zoom com desfoque e
o brilho branco (com o riser). As favoritas de cada par: a 1ª é a mais comum (quase sempre o corte seco) e a 2ª, a mais
comum com efeito ou som no par; sem nenhuma no par, a da família do destino.

Refazível sem perder a curadoria da página Transições: de quem já existe, guarda o nome, o som (e a intensidade) e o
"aprovado", e não mexe na ordem nem nas favoritas dos pares que já têm a sua em `ordem.json` (só grava os que faltam).
Com `--refazer`, volta tudo ao que a análise das referências diz (nada aprovado).

    uv run --project backend python ferramentas/transicoes_semear.py [--refazer]
"""
import collections
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / 'backend'))
from app import transicoes  # noqa: E402

BIBLIOTECA = [
    {'id': 'corte-seco', 'nome': 'Corte seco', 'descricao': 'Troca de plano direto, sem efeito nem som: o mais comum nas referências.',
     'efeito': {'tipo': 'seco'}, 'som': None},
    {'id': 'corte-clique', 'nome': 'Corte com clique', 'descricao': 'Corte seco com o Click Classic exatamente no corte (comum ao entrar num motion ou num insert de tela cheia).',
     'efeito': {'tipo': 'seco'}, 'som': {'som': 'click-classic-01', 'intensidade': 'medio', 'atraso': 0}},
    {'id': 'corte-camera', 'nome': 'Corte com câmera', 'descricao': 'Corte seco com o clique de câmera (Instant Camera) no corte, ao entrar num insert de tela cheia.',
     'efeito': {'tipo': 'seco'}, 'som': {'som': 'instant-camera-01', 'intensidade': 'baixo', 'atraso': 0}},
    {'id': 'subida-ao-corte', 'nome': 'Subida até o corte', 'descricao': 'Corte seco com o Riser 07 subindo e terminando no corte (comum ao voltar para o ator).',
     'efeito': {'tipo': 'seco'}, 'som': {'som': 'riser-07', 'intensidade': 'baixo', 'atraso': 0}},
    {'id': 'luz-colorida', 'nome': 'Luz colorida', 'descricao': 'Uma luz colorida (azul-esverdeado, limão, cinza) varre o quadro, cobre tudo no corte e some; com o clique.',
     'efeito': {'tipo': 'luz', 'antes': 0.22, 'depois': 0.23, 'forca': 1}, 'som': {'som': 'click-classic-01', 'intensidade': 'medio', 'atraso': 0},
     'fontes': [{'ref': '48-image-to-html-manychat', 't': 6.9}, {'ref': '48-image-to-html-manychat', 't': 55.2}]},
    {'id': 'zoom-desfoque', 'nome': 'Zoom com desfoque', 'descricao': 'O quadro aproxima rápido e desfoca até o corte; o plano novo chega aproximado e desfocado e assenta.',
     'efeito': {'tipo': 'zoom', 'antes': 0.18, 'depois': 0.25, 'forca': 1}, 'som': None,
     'fontes': [{'ref': '48-image-to-html-manychat', 't': 2.0}, {'ref': '48-image-to-html-manychat', 't': 13.63}]},
    {'id': 'brilho-branco', 'nome': 'Brilho branco', 'descricao': 'O quadro clareia até quase branco no corte e o plano novo aparece; com o riser subindo.',
     'efeito': {'tipo': 'brilho', 'antes': 0.22, 'depois': 0.1, 'forca': 1}, 'som': {'som': 'riser-07', 'intensidade': 'baixo', 'atraso': 0},
     'fontes': [{'ref': 'cursor-free-v2', 't': 4.43}]},
]
DO_SOM = {'click-classic-01': 'corte-clique', 'instant-camera-01': 'corte-camera', 'riser-07': 'subida-ao-corte'}
# a 2ª favorita quando o par não tem nenhuma com som ou efeito: pela família do plano que entra
RESERVA = {'ator': 'subida-ao-corte', 'insert': 'corte-camera', 'motion': 'corte-clique'}


TOLERANCIA = 0.2  # s: um corte da análise é a fonte de um efeito se estiver a menos disso dela (o corte medido quadro a
# quadro pode cair alguns quadros antes do da direção: o brilho em 4,43 s, o corte da análise em 4,54 s)


def _de_efeito(c: dict, efeitos: dict[str, list[tuple[str, float]]]) -> str | None:
    """A transição com efeito de que este corte das referências é fonte (pela referência e pelo instante)."""
    return next((i for i, fs in efeitos.items() if any(r == c['ref'] and abs(x - c['t']) < TOLERANCIA for r, x in fs)), None)


def main(refazer: bool = False) -> None:
    pares = json.loads((transicoes.RAIZ / 'pares.json').read_text())
    # de onde vem cada transição de som: os cortes com aquele som
    fontes = collections.defaultdict(list)
    for p in pares.values():
        for c in p['cortes']:
            for s in c['sons']:
                if s in DO_SOM:
                    fontes[DO_SOM[s]].append({'ref': c['ref'], 't': c['t']})
    efeitos = {t['id']: [(f['ref'], f['t']) for f in t.get('fontes', [])] for t in BIBLIOTECA}
    for t in BIBLIOTECA:
        antigo = transicoes.ler(t['id']) if transicoes.existe(t['id']) and not refazer else {}
        guardado = {k: antigo[k] for k in ('nome', 'som') if k in antigo}  # o que se muda na página Transições
        transicoes.salvar({**t, **guardado, 'fontes': t.get('fontes') or fontes[t['id']][:8] or [], 'aprovado': antigo.get('aprovado', False)})
    # as contagens de cada transição em cada par (e na família)
    contagem: dict = collections.defaultdict(collections.Counter)
    for k, p in pares.items():
        de, para = k.split('>')
        fam = f'familia:{transicoes.familia(de)}>{transicoes.familia(para)}'
        for c in p['cortes']:
            com_efeito = _de_efeito(c, efeitos)
            som = next((DO_SOM[s] for s in c['sons'] if s in DO_SOM), None)
            ident = com_efeito or som or 'corte-seco'
            contagem[k][ident] += 1
            contagem[fam][ident] += 1
    ja = {} if refazer else transicoes.ordem()
    novos = 0
    for k, cont in contagem.items():
        if k in ja:
            continue  # a ordem e as favoritas deste par já existem (talvez mexidas na página): ficam
        novos += 1
        ordem = [i for i, _ in cont.most_common()]
        if len(ordem) < 2:
            destino = k.split('>')[1]
            reserva = RESERVA[destino if k.startswith('familia:') else transicoes.familia(destino)]
            ordem.append(reserva if reserva not in ordem else 'corte-clique')
        resto = [t['id'] for t in BIBLIOTECA if t['id'] not in ordem]
        transicoes.definir_ordem(k, ordem + resto, 2)
    print(f'{len(BIBLIOTECA)} transições; ordem gravada em {novos} de {len(contagem)} pares e famílias')
    for k in list(contagem)[:8]:
        print(' ', k, transicoes.ordem()[k]['ids'][:2], dict(contagem[k]))


if __name__ == '__main__':
    main(refazer='--refazer' in sys.argv[1:])
