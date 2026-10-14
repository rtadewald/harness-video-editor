"""Os aprendizados do editor por Claude (docs/editor-claude.md §7, E9; Q17, Q22): um Markdown por área na skill
(`.claude/skills/editor/aprendizados/<área>.md`, no git). O Claude os lê antes de cada etapa e propõe novos na
aprovação; só grava o que Rodrigo confirma. A página Aprendizados do app lê e edita os mesmos arquivos."""
import re
from datetime import datetime
from pathlib import Path

PASTA = Path(__file__).resolve().parents[2] / '.claude' / 'skills' / 'editor' / 'aprendizados'
NOMES = {'cortes': 'Cortes', 'inserts': 'Inserts', 'enriquecimento': 'Enriquecimento', 'motions': 'Motions', 'elementos': 'Elementos',
         'transicoes': 'Transições', 'audio': 'Áudio', 'legenda': 'Legenda', 'render': 'Checagem e entrega'}


def _arquivo(area: str) -> Path:
    if not re.fullmatch(r'[a-z0-9-]{1,40}', area or ''):
        raise FileNotFoundError(area)
    return PASTA / f'{area}.md'


def listar() -> list[dict]:
    """As áreas (na ordem das etapas), cada uma com o texto e quando mudou."""
    arqs = {a.stem: a for a in PASTA.glob('*.md')} if PASTA.exists() else {}
    ordem = [*(k for k in NOMES if k in arqs), *sorted(k for k in arqs if k not in NOMES)]
    return [{'area': k, 'nome': NOMES.get(k, k.capitalize()), 'texto': arqs[k].read_text(encoding='utf-8'),
             'atualizado': datetime.fromtimestamp(arqs[k].stat().st_mtime).isoformat(timespec='seconds')} for k in ordem]


def salvar(area: str, texto: str) -> dict:
    arq = _arquivo(area)
    if not arq.exists():
        raise FileNotFoundError(area)
    arq.write_text(texto.rstrip() + '\n', encoding='utf-8')
    return next(x for x in listar() if x['area'] == area)
