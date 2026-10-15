"""Os aprendizados do editor por Claude (docs/editor-claude.md §7, E9; Q17, Q22): um Markdown por área na biblioteca
(`biblioteca/aprendizados/<área>.md`, fora do git: cada pessoa evolui os seus). O Claude os lê antes de cada etapa
(`A aprendizados <área>`) e anota os que o criador confirma (`A aprender <área> …`). A página Aprendizados do app lê e
edita os mesmos arquivos."""
import re
from datetime import datetime

from . import comum

PASTA = comum.BIBLIOTECA / 'aprendizados'
NOMES = {'cortes': 'Cortes', 'inserts': 'Inserts', 'enriquecimento': 'Enriquecimento', 'motions': 'Motions', 'elementos': 'Elementos',
         'transicoes': 'Transições', 'audio': 'Áudio', 'legenda': 'Legenda', 'render': 'Checagem e entrega'}
SECAO_CRIADOR = '## Do criador'
SECAO_TECNICA = '## Técnicos (do editor)'


def _arquivo(area: str):
    if not re.fullmatch(r'[a-z0-9-]{1,40}', area or ''):
        raise FileNotFoundError(area)
    return PASTA / f'{area}.md'


def _item(arq) -> dict:
    return {'area': arq.stem, 'nome': NOMES.get(arq.stem, arq.stem.capitalize()), 'texto': arq.read_text(encoding='utf-8'),
            'atualizado': datetime.fromtimestamp(arq.stat().st_mtime).isoformat(timespec='seconds')}


def listar() -> list[dict]:
    """As áreas (na ordem das etapas), cada uma com o texto e quando mudou."""
    arqs = {a.stem: a for a in PASTA.glob('*.md')} if PASTA.exists() else {}
    ordem = [*(k for k in NOMES if k in arqs), *sorted(k for k in arqs if k not in NOMES)]
    return [_item(arqs[k]) for k in ordem]


def ler(area: str) -> dict:
    arq = _arquivo(area)
    if not arq.exists():
        raise FileNotFoundError(area)
    return _item(arq)


def salvar(area: str, texto: str) -> dict:
    arq = _arquivo(area)
    if not arq.exists():
        raise FileNotFoundError(area)
    arq.write_text(texto.rstrip() + '\n', encoding='utf-8')
    return _item(arq)


def anotar(area: str, texto: str, criador: bool = False) -> dict:
    """Um aprendizado novo (um item `- …`) no fim da seção dele: "Do criador" (um gosto confirmado) ou "Técnicos". A seção
    que falta é criada; uma área nova nasce com o título."""
    linhas = [x.rstrip() for x in texto.strip().splitlines() if x.strip()]
    if not linhas:
        raise ValueError('O aprendizado veio vazio')
    item = '\n'.join([f'- {linhas[0].removeprefix("- ")}', *(f"  {x.strip()}" for x in linhas[1:])])
    arq = _arquivo(area)
    doc = arq.read_text(encoding='utf-8') if arq.exists() else f'# Aprendizados · {NOMES.get(area, area.capitalize())}\n'
    titulo = SECAO_CRIADOR if criador else SECAO_TECNICA
    m = re.search(rf'^{re.escape(titulo)}[ \t]*\n(.*?)(?=^## |\Z)', doc, re.M | re.S)
    if m:
        fim = m.start(1) + len(m.group(1).rstrip())
        antes, depois = doc[:fim].rstrip(), doc[fim:].lstrip('\n')
        doc = f'{antes}\n{chr(10) if antes.endswith(titulo) else ""}{item}\n' + (f'\n{depois}' if depois else '')
    else:
        doc = f'{doc.rstrip()}\n\n{titulo}\n\n{item}\n'
    PASTA.mkdir(parents=True, exist_ok=True)
    arq.write_text(doc.rstrip() + '\n', encoding='utf-8')
    return _item(arq)
