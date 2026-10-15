"""A aprovação (docs/editor-claude.md §7, E9): o estado de agora × a versão aprovada, o projeto que vira referência e os
aprendizados (a página Aprendizados)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import aprendizados, aprovacao, referencias, versoes
from .comum import ler_projeto

rotas = APIRouter()


@rotas.get('/api/projetos/{id}/aprovacao')
def ver_aprovacao(id: str):
    """A versão aprovada, o que mudou desde ela (o 4K sai do estado de agora) e a referência, se já existe."""
    ler_projeto(id)
    n = versoes.aprovada(id)
    rid = f'prj-{id}-v{n}' if n else None
    return {'versao': n, 'difere': aprovacao.difere(id, n) if n else [],
            'referencia': rid if rid and (referencias.RAIZ / rid / 'referencia.json').exists() else None}


class DeProjeto(BaseModel):
    versao: int | None = Field(default=None, ge=1)


@rotas.post('/api/projetos/{id}/referencia')
def virar_referencia(id: str, d: DeProjeto):
    """A versão aprovada (ou a dada) vira a referência `prj-<id>-vN` da Calibragem, a revisar."""
    ler_projeto(id)
    try:
        return {'id': aprovacao.de_projeto(id, d.versao)}
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@rotas.get('/api/aprendizados')
def listar_aprendizados():
    return aprendizados.listar()


class Texto(BaseModel):
    texto: str = Field(max_length=200_000)


@rotas.get('/api/aprendizados/{area}')
def ler_aprendizado(area: str):
    try:
        return aprendizados.ler(area)
    except FileNotFoundError:
        raise HTTPException(404, 'Área desconhecida')


@rotas.put('/api/aprendizados/{area}')
def salvar_aprendizado(area: str, t: Texto):
    try:
        return aprendizados.salvar(area, t.texto)
    except FileNotFoundError:
        raise HTTPException(404, 'Área desconhecida')


class Aprendizado(BaseModel):
    texto: str = Field(max_length=5000)
    criador: bool = False


@rotas.post('/api/aprendizados/{area}')
def anotar_aprendizado(area: str, a: Aprendizado):
    """Um aprendizado novo no fim da seção dele (`criador`: um gosto confirmado; senão, técnico)."""
    try:
        return aprendizados.anotar(area, a.texto, a.criador)
    except FileNotFoundError:
        raise HTTPException(404, 'Área inválida')
    except ValueError as e:
        raise HTTPException(422, str(e))
