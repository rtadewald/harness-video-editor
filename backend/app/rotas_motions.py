"""Rotas dos motions (SPEC §8.5; ver docs/motions.md): a biblioteca e o uso nos planos de um projeto."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from . import motions
from .rotas_comum import Campos, ler_projeto

rotas = APIRouter()


# ---------------------------------------------------------------- motions (SPEC §8.5)

def _motion(mid: str) -> dict:
    try:
        return motions.ler(mid)
    except FileNotFoundError:
        raise HTTPException(404, 'Motion não encontrado')


@rotas.get('/api/motions')
def listar_motions():
    return motions.listar()


@rotas.post('/api/motions')
def criar_motion(pedido: motions.Pedido):
    """Um motion novo: a IA escreve a v1 em segundo plano (o status diz em que etapa está)."""
    try:
        return motions.criar(pedido)
    except ValueError as e:
        raise HTTPException(422, str(e))


@rotas.get('/api/motions/{mid}')
def ler_motion(mid: str):
    return _motion(mid)


@rotas.patch('/api/motions/{mid}')
def editar_motion(mid: str, e: Campos):
    """Nome, favorito, versão aberta e valores dos campos."""
    _motion(mid)
    return motions.editar(mid, e.campos)


class NovaVersao(BaseModel):
    de: int
    comentario: str = Field(min_length=1, max_length=3000)


@rotas.post('/api/motions/{mid}/versoes')
def corrigir_motion(mid: str, v: NovaVersao):
    """A próxima versão, a partir da `de`, com o comentário."""
    _motion(mid)
    try:
        return motions.corrigir(mid, v.de, v.comentario)
    except ValueError as e:
        raise HTTPException(409, str(e))


@rotas.delete('/api/motions/{mid}')
def apagar_motion(mid: str):
    _motion(mid)
    motions.apagar(mid)
    return {'ok': True}


@rotas.get('/api/motions/{mid}/pagina')
def pagina_motion(mid: str, n: int | None = None, exportacao: bool = False):
    """O motion como página (o iframe da prévia e da exportação)."""
    _motion(mid)
    try:
        return HTMLResponse(motions.pagina(mid, n, exportacao), headers={'Cache-Control': 'no-cache'})
    except (LookupError, FileNotFoundError) as e:
        raise HTTPException(404, str(e))


@rotas.get('/api/motions/{mid}/miniatura')
def miniatura_motion(mid: str, n: int | None = None):
    m = _motion(mid)
    arq = motions.pasta(mid) / f"v{n or m.get('ativa')}.jpg"
    if not arq.is_file():
        raise HTTPException(404, 'Sem miniatura')
    return FileResponse(arq, headers={'Cache-Control': 'no-cache'})


@rotas.get('/api/projetos/{id}/motions')
def motions_do_projeto(id: str):
    """O motion de cada plano (a cópia guardada no projeto)."""
    return ler_projeto(id).get('motions') or {}


class UsoMotion(BaseModel):
    motion: str
    versao: int | None = None
    valores: dict[str, str] | None = None


@rotas.put('/api/projetos/{id}/motions/{plano}')
def usar_motion(id: str, plano: str, u: UsoMotion):
    """Copia a versão do motion (e os valores dos campos) para o plano."""
    ler_projeto(id)
    _motion(u.motion)
    try:
        return motions.usar(id, plano, u.motion, u.versao, u.valores)
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(422, str(e))


class ValoresMotion(BaseModel):
    valores: dict[str, str]


@rotas.patch('/api/projetos/{id}/motions/{plano}')
def valores_motion_do_plano(id: str, plano: str, v: ValoresMotion):
    ler_projeto(id)
    try:
        return motions.valores_no_plano(id, plano, v.valores)
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.delete('/api/projetos/{id}/motions/{plano}')
def tirar_motion_do_plano(id: str, plano: str):
    ler_projeto(id)
    motions.tirar_do_plano(id, plano)
    return {'ok': True}


@rotas.get('/api/projetos/{id}/motions/{plano}/pagina')
def pagina_motion_do_plano(id: str, plano: str, duracao: float | None = None, exportacao: bool = False):
    ler_projeto(id)
    try:
        return HTMLResponse(motions.pagina_do_plano(id, plano, duracao, exportacao), headers={'Cache-Control': 'no-cache'})
    except (LookupError, FileNotFoundError) as e:
        raise HTTPException(404, str(e))


@rotas.get('/api/projetos/{id}/motions/{plano}/miniatura')
def miniatura_motion_do_plano(id: str, plano: str):
    arq = motions.pasta_plano(id) / f'{plano}.jpg'
    if not arq.is_file():
        raise HTTPException(404, 'Sem miniatura')
    return FileResponse(arq, headers={'Cache-Control': 'no-cache'})
