"""Projetos em disco: uma pasta por projeto, com projeto.json como fonte de verdade (SPEC §5)."""
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2] / 'projetos'
SAIDA = {'largura': 1080, 'altura': 1920}
ETAPAS = ['cortes', 'inserts', 'motion', 'legenda']


def slug(nome: str) -> str:
    s = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or 'projeto'


def pasta(id: str) -> Path:
    p = (RAIZ / id).resolve()
    if p.parent != RAIZ.resolve() or not (p / 'projeto.json').exists():
        raise FileNotFoundError(id)
    return p


def novo_id(nome: str) -> str:
    base, n = slug(nome), 1
    id = base
    while (RAIZ / id).exists():
        n += 1
        id = f'{base}-{n}'
    return id


def criar(id: str, nome: str, fontes: list[dict], briefing: dict) -> dict:
    projeto = {
        'id': id,
        'nome': nome,
        'criado_em': datetime.now().isoformat(timespec='seconds'),
        'saida': SAIDA,
        'fontes': fontes,
        'briefing': briefing,
        'enquadramento': {'x': 0.5},
        'timeline': {'trilhas': {'V1': [], 'V2': [], 'V3': [], 'LEG': []}},
        'etapas': {e: 'pendente' for e in ETAPAS},
        'chats': {e: [] for e in ETAPAS},
        'historico': [],
        'versoes': [],
    }
    salvar(projeto)
    return projeto


def salvar(projeto: dict) -> None:
    arquivo = RAIZ / projeto['id'] / 'projeto.json'
    tmp = arquivo.with_suffix('.tmp')
    tmp.write_text(json.dumps(projeto, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(arquivo)


def ler(id: str) -> dict:
    return json.loads((pasta(id) / 'projeto.json').read_text(encoding='utf-8'))


def listar() -> list[dict]:
    if not RAIZ.exists():
        return []
    projetos = [json.loads(p.read_text(encoding='utf-8')) for p in RAIZ.glob('*/projeto.json')]
    resumo = [
        {'id': p['id'], 'nome': p['nome'], 'criado_em': p['criado_em'],
         'duracao': next((f['duracao'] for f in p['fontes'] if f['papel'] == 'bruto'), None)}
        for p in projetos
    ]
    return sorted(resumo, key=lambda p: p['criado_em'], reverse=True)
