"""Rotas da exportação (SPEC §13): iniciar, acompanhar, cancelar e abrir o vídeo pronto."""
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import exportacao
from .comum import ler_projeto as _ler

rotas = APIRouter()


class Exportar(BaseModel):
    resolucao: Literal['720p', '1080p', '4k'] = '4k'
    fps: Literal[24, 30, 60] = 24
    codec: Literal['hevc', 'h264'] = 'hevc'
    navegadores: int = Field(default=6, ge=1, le=8)
    nome: str | None = None


@rotas.get('/api/projetos/{id}/exportacao')
def ver_exportacao(id: str):
    """A última exportação do projeto (com o progresso ao vivo)."""
    _ler(id)
    return {'atual': exportacao.estado(id)}


@rotas.post('/api/projetos/{id}/exportacao')
def exportar(id: str, e: Exportar):
    """Começa a exportação em segundo plano (SPEC §13)."""
    _ler(id)
    try:
        return exportacao.exportar(id, e.resolucao, e.fps, e.codec, e.nome, e.navegadores)
    except ValueError as erro:
        raise HTTPException(409, str(erro))


@rotas.post('/api/projetos/{id}/exportacao/cancelar')
def cancelar_exportacao(id: str):
    exportacao.cancelar(id)
    return {'ok': True}


def _exportado(id: str) -> Path:
    e = exportacao.estado(id) or {}
    arq = exportacao.pasta_exports(id) / e['arquivo'] if e.get('arquivo') else None
    if not arq or not arq.is_file():
        raise HTTPException(404, 'Arquivo exportado não encontrado')
    return arq


@rotas.get('/api/projetos/{id}/exportacao/arquivo')
def baixar_exportacao(id: str):
    arq = _exportado(id)
    return FileResponse(arq, filename=arq.name)


@rotas.post('/api/projetos/{id}/exportacao/finder')
def mostrar_exportacao(id: str):
    """Abre o Finder com o arquivo exportado selecionado."""
    import subprocess
    subprocess.run(['open', '-R', str(_exportado(id))], check=False)
    return {'ok': True}
