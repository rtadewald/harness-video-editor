"""O que as rotas de vários assuntos compartilham."""
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from . import projeto


def ler_projeto(id: str) -> dict:
    try:
        return projeto.ler(id)
    except FileNotFoundError:
        raise HTTPException(404, 'Projeto não encontrado')


class Campos(BaseModel):
    """Uma edição parcial (os campos que mudam), validada pelo módulo dono do dado."""
    campos: dict[str, Any]
