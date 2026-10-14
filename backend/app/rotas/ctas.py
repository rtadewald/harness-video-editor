"""Os CTAs (docs/editor-claude.md, E10)."""
import shutil
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import ctas
from .comum import guardar_upload

rotas = APIRouter()


def _cta(cid: str) -> dict:
    try:
        return ctas.ler(cid)
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.get('/api/ctas')
def listar():
    return {'ctas': ctas.todos(), 'categorias': ctas.categorias(), 'produtos': ctas.produtos()}


@rotas.post('/api/ctas')
def subir(arquivos: Annotated[list[UploadFile], File()], categoria: Annotated[str | None, Form()] = None):
    """Vídeos editados: cada um vira um CTA (o vídeo todo, até marcar onde o CTA começa)."""
    novos = []
    for a in arquivos:
        tmp = Path(tempfile.mkdtemp()) / Path(a.filename or 'cta.mp4').name
        guardar_upload(a, tmp)
        try:
            novos.append(ctas.adicionar(tmp, tmp.stem, categoria))
        except ValueError as e:
            raise HTTPException(422, f'{a.filename}: {e}')
        finally:
            shutil.rmtree(tmp.parent, ignore_errors=True)
    return novos


class EdicaoCta(BaseModel):
    nome: str | None = Field(default=None, max_length=200)
    categoria: str | None = None
    produto: str | None = None
    inicio: float | None = Field(default=None, ge=0)
    fim: float | None = Field(default=None, ge=0)
    favorito: bool | None = None


@rotas.put('/api/ctas/{cid}')
def editar(cid: str, e: EdicaoCta):
    _cta(cid)
    try:
        return ctas.editar(cid, e.model_dump(exclude_unset=True))
    except ValueError as erro:
        raise HTTPException(422, str(erro))


@rotas.delete('/api/ctas/{cid}')
def apagar(cid: str):
    _cta(cid)
    ctas.apagar(cid)
    return {'ok': True}


class Produtos(BaseModel):
    produtos: list[dict] = Field(max_length=100)


@rotas.put('/api/ctas-produtos')
def salvar_produtos(p: Produtos):
    return {'produtos': ctas.salvar_produtos(p.produtos)}


@rotas.get('/api/ctas/{cid}/{arquivo}')
def arquivo(cid: str, arquivo: str):
    """A versão leve (`proxy.mp4`), a miniatura e a tira de quadros."""
    _cta(cid)
    if arquivo == 'tira.jpg':
        return FileResponse(ctas.tira(cid), headers={'Cache-Control': 'no-cache'})
    if arquivo not in ('proxy.mp4', 'miniatura.jpg'):
        raise HTTPException(404, 'Arquivo não encontrado')
    return FileResponse(ctas.pasta(cid) / arquivo, headers={'Cache-Control': 'no-cache'})
