"""Rotas do rosto do ator (SPEC §8.7): o estado da medida e pedir de novo."""
from fastapi import APIRouter

from .. import rosto
from .comum import ler_projeto

rotas = APIRouter()


@rotas.get('/api/projetos/{id}/rosto')
def estado_rosto(id: str):
    """O estado da medida do rosto (`nenhum`, `fila`, `rodando`, `pronto`, `erro`), com o progresso."""
    ler_projeto(id)
    return rosto.estado(id)


@rotas.post('/api/projetos/{id}/rosto')
def pedir_rosto(id: str):
    """Mede (ou mede de novo) o rosto do ator, em segundo plano."""
    ler_projeto(id)
    return rosto.pedir(id, refazer=True)
