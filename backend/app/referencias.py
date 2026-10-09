"""Vídeos de referência já editados, usados para treinar a Direção visual (SPEC §8.2.1).

Uma pasta por referência em `referencias/`, com referencia.json como fonte de verdade. São do app, não de um projeto."""
import json
import shutil
import threading
from datetime import datetime
from pathlib import Path

from . import comum, projeto

RAIZ = comum.DADOS / 'referencias'
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


# Favoritos da galeria de Referências: trechos que o criador marcou como preferência (vão guiar as IAs depois).
# Identificados pela referência e pelo intervalo (não pelo id do plano, que muda quando o vídeo é reanalisado),
# com uma cópia dos dados do momento em que foram marcados.

def _arquivo_favoritos() -> Path:
    return RAIZ / '_favoritos.json'


def ler_favoritos() -> list[dict]:
    try:
        return json.loads(_arquivo_favoritos().read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return []


def mesmo_trecho(f: dict, ref: str, inicio: float, fim: float) -> bool:
    return f['ref'] == ref and abs(f['inicio'] - inicio) < 0.05 and abs(f['fim'] - fim) < 0.05


def marcar_favorito(ref: str, inicio: float, fim: float, favorito: bool, dados: dict) -> list[dict]:
    with _trava:
        favs = [f for f in ler_favoritos() if not mesmo_trecho(f, ref, inicio, fim)]
        if favorito:
            favs.append({'ref': ref, 'inicio': round(inicio, 3), 'fim': round(fim, 3), 'criado_em': datetime.now().isoformat(timespec='seconds'), **dados})
        RAIZ.mkdir(exist_ok=True)
        comum.salvar_json(_arquivo_favoritos(), favs)
        return favs

