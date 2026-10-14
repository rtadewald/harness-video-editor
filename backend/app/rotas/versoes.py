"""Versões do projeto, a trava "Claude editando", a atividade e as marcas de mão (docs/editor-claude.md, E2)."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import versoes
from .comum import ler_projeto

rotas = APIRouter()


def autor(request: Request) -> str:
    """Quem fez: o Claude manda `X-Autor: claude` (a CLI do app); o resto é Rodrigo, pela tela."""
    return 'claude' if request.headers.get('x-autor') == 'claude' else 'rodrigo'


class NovaVersao(BaseModel):
    resumo: str = Field(default='', max_length=2000)


class Trava(BaseModel):
    editando: bool
    etapa: str | None = Field(default=None, max_length=40)


class Atividade(BaseModel):
    etapa: str = Field(max_length=40)
    texto: str = Field(max_length=500)
    segundos: float | None = None


@rotas.get('/api/projetos/{id}/versoes')
def listar(id: str):
    p = ler_projeto(id)
    return {'versoes': versoes.listar(id), 'atual': p.get('versao') or 0}


@rotas.post('/api/projetos/{id}/versoes')
def marcar(id: str, v: NovaVersao, request: Request):
    ler_projeto(id)
    return versoes.marcar(id, autor(request), v.resumo)


@rotas.post('/api/projetos/{id}/versoes/{n}/restaurar')
def restaurar(id: str, n: int):
    ler_projeto(id)
    try:
        return versoes.restaurar(id, n)
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.get('/api/projetos/{id}/manuais')
def manuais(id: str):
    ler_projeto(id)
    return versoes.manuais(id)


@rotas.put('/api/projetos/{id}/claude')
def travar(id: str, t: Trava):
    """Trava (o Claude começou a editar) ou destrava; a tela também pode destravar (um Claude que parou no meio)."""
    ler_projeto(id)
    return versoes.travar(id, t.editando, t.etapa)


@rotas.get('/api/projetos/{id}/atividade')
def atividade(id: str):
    p = ler_projeto(id)
    return {'claude': p.get('claude') or {'editando': False}, 'atividade': p.get('atividade') or []}


@rotas.post('/api/projetos/{id}/atividade')
def registrar(id: str, a: Atividade, request: Request):
    ler_projeto(id)
    return versoes.registrar_atividade(id, a.etapa, a.texto, a.segundos, autor(request))
