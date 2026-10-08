"""Rotas dos motions (SPEC §8.5; ver docs/motions.md): os presets e o motion de cada plano de um projeto."""
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from . import motions
from .rotas_comum import ler_projeto

rotas = APIRouter()
_SEM_CACHE = {'Cache-Control': 'no-cache'}


# as fontes da Apple que os presets usam, lidas do próprio Mac (não vão para o git; o Chromium não as acha pelo nome)
FONTES_DO_MAC = {'pro': 'SFNS.ttf', 'rounded': 'SFNSRounded.ttf', 'mono': 'SFNSMono.ttf'}


@rotas.get('/api/motions/fonte/{nome}')
def fonte_do_mac(nome: str):
    if nome not in FONTES_DO_MAC:
        raise HTTPException(404, 'Fonte desconhecida')
    return FileResponse(f'/System/Library/Fonts/{FONTES_DO_MAC[nome]}', media_type='font/ttf', headers={'Cache-Control': 'max-age=86400'})


@rotas.get('/api/motions/presets')
def listar_presets():
    return motions.listar_presets()


@rotas.get('/api/motions/presets/{pid}/pagina')
def pagina_preset(pid: str, formato: str = 'vertical', duracao: float | None = None, valores: str = '{}', fala: str = '[]'):
    """Um preset com estes valores (as miniaturas da grade)."""
    try:
        v = json.loads(valores)
        return HTMLResponse(motions.pagina_do_preset(pid, formato, duracao, v if isinstance(v, dict) else {}, motions.ler_fala(fala)), headers=_SEM_CACHE)
    except FileNotFoundError:
        raise HTTPException(404, 'Preset não encontrado')
    except ValueError:
        raise HTTPException(422, 'Valores inválidos')


@rotas.get('/api/projetos/{id}/motions')
def motions_do_projeto(id: str):
    return ler_projeto(id).get('motions') or {}


@rotas.put('/api/projetos/{id}/motions/{plano}')
def usar_motion(id: str, plano: str, u: motions.UsoMotion):
    """Um preset ou um vídeo do banco no plano."""
    ler_projeto(id)
    try:
        return motions.usar(id, plano, u)
    except FileNotFoundError:
        raise HTTPException(404, 'Preset ou vídeo não encontrado')
    except ValueError as e:
        raise HTTPException(422, str(e))


class AjusteMotion(BaseModel):
    valores: dict[str, str] | None = None
    fundo: str | None = None
    sons: dict[str, dict] | None = None


@rotas.patch('/api/projetos/{id}/motions/{plano}')
def ajustar_motion(id: str, plano: str, a: AjusteMotion):
    ler_projeto(id)
    try:
        return motions.ajustar(id, plano, a.valores, a.fundo, a.sons)
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.delete('/api/projetos/{id}/motions/{plano}')
def tirar_motion_do_plano(id: str, plano: str):
    ler_projeto(id)
    motions.tirar_do_plano(id, plano)
    return {'ok': True}


@rotas.get('/api/projetos/{id}/motions/{plano}/pagina')
def pagina_motion_do_plano(id: str, plano: str, duracao: float | None = None, fala: str = '[]', exportacao: bool = False):
    ler_projeto(id)
    try:
        return HTMLResponse(motions.pagina_do_plano(id, plano, duracao, motions.ler_fala(fala), exportacao), headers=_SEM_CACHE)
    except (LookupError, FileNotFoundError) as e:
        raise HTTPException(404, str(e))
