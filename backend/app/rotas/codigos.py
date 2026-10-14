"""Os códigos copiáveis (docs/editor-claude.md, Q18): o mapa {tipo: {id: código}} para a tela e o resolver."""
from fastapi import APIRouter, HTTPException

from .. import codigos

rotas = APIRouter()


@rotas.get('/api/codigos')
def mapa():
    return codigos.mapa()


@rotas.get('/api/codigos/{texto}')
def resolver(texto: str):
    try:
        return codigos.resolver(texto)
    except ValueError as e:
        raise HTTPException(404, str(e))
