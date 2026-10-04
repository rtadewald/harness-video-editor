"""Vídeos de referência já editados, usados para treinar a Direção visual (SPEC §8.2.1).

Uma pasta por referência em `referencias/`, com referencia.json como fonte de verdade. São do app, não de um projeto."""
import json
import shutil
import threading
from datetime import datetime
from pathlib import Path

from . import projeto

RAIZ = Path(__file__).resolve().parents[2] / 'referencias'
STATUS = ['na_fila', 'analisando', 'a_revisar', 'revisado', 'erro']
_trava = threading.Lock()


def pasta(id: str) -> Path:
    p = (RAIZ / id).resolve()
    if p.parent != RAIZ.resolve() or not (p / 'referencia.json').exists():
        raise FileNotFoundError(id)
    return p


def novo_id(nome: str) -> str:
    base, n = projeto.slug(Path(nome).stem), 1
    id = base
    while (RAIZ / id).exists():
        n += 1
        id = f'{base}-{n}'
    return id


def formato(largura: int, altura: int) -> str:
    return 'vertical' if altura > largura else 'horizontal' if largura > altura else 'quadrado'


def criar(id: str, nome: str, video: dict) -> dict:
    ref = {
        'id': id,
        'nome': nome,
        'criado_em': datetime.now().isoformat(timespec='seconds'),
        'formato': formato(video['largura'], video['altura']),
        'video': video,
        'status': 'na_fila',
        'erro': None,
    }
    salvar(ref)
    return ref


def ler(id: str) -> dict:
    return json.loads((pasta(id) / 'referencia.json').read_text(encoding='utf-8'))


def salvar(ref: dict) -> None:
    arquivo = RAIZ / ref['id'] / 'referencia.json'
    tmp = arquivo.with_suffix('.tmp')
    tmp.write_text(json.dumps(ref, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(arquivo)


def atualizar(id: str, mudar) -> dict:
    with _trava:
        ref = ler(id)
        mudar(ref)
        salvar(ref)
        return ref


def listar() -> list[dict]:
    if not RAIZ.exists():
        return []
    refs = [json.loads(p.read_text(encoding='utf-8')) for p in RAIZ.glob('*/referencia.json')]
    return sorted(refs, key=lambda r: r['criado_em'], reverse=True)


def apagar(id: str) -> None:
    shutil.rmtree(pasta(id))
