"""O que as rotas de vários assuntos compartilham."""
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
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


def guardar_upload(upload: UploadFile, destino: Path) -> None:
    """Grava um arquivo enviado (em pedaços de 8 MB: vídeos grandes não passam pela memória)."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open('wb') as f:
        shutil.copyfileobj(upload.file, f, length=8 * 1024 * 1024)


def extensao_do_upload(upload: UploadFile) -> str:
    return Path(upload.filename or '').suffix.lower()
