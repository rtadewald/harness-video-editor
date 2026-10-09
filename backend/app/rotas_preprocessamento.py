"""Rotas do pré-processamento (SPEC §8.1; docs/preprocessamento.md): o look do ator (LUT + vinheta) e o enquadramento 16:9 → 9:16."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import enquadramento, look, projeto
from .rotas_comum import Campos, ler_projeto

rotas = APIRouter()


@rotas.get('/api/look')
def catalogo_look():
    """Os looks (LUTs), as vinhetas e a forma dela (a mesma fórmula do shader da prévia e da máscara da exportação)."""
    return look.catalogo()


@rotas.get('/api/look/{lut}.cube')
def arquivo_lut(lut: str):
    try:
        return FileResponse(look.arquivo_lut(lut), media_type='text/plain', headers={'Cache-Control': 'no-cache'})
    except FileNotFoundError:
        raise HTTPException(404, 'Look não encontrado')


@rotas.get('/api/projetos/{id}/look')
def look_do_projeto(id: str):
    return look.do_projeto(ler_projeto(id))


@rotas.put('/api/projetos/{id}/look')
def definir_look(id: str, c: Campos):
    """Muda o look do projeto (os campos que vierem: lut, intensidade, vinheta)."""
    ler_projeto(id)
    try:
        novo = look.validar(c.campos)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    p = projeto.atualizar(id, lambda x: x.__setitem__('look', {**look.do_projeto(x), **novo}))
    return look.do_projeto(p)


@rotas.get('/api/projetos/{id}/enquadramento')
def estado_enquadramento(id: str):
    """O enquadramento 16:9 → 9:16: a suavidade, o deslocamento, o estado e, num vídeo que veio 16:9, o caminho da câmera."""
    ler_projeto(id)
    return enquadramento.estado(id)


@rotas.put('/api/projetos/{id}/enquadramento')
def reenquadrar(id: str, c: Campos):
    """Refaz o bruto 9:16 com outra suavidade e/ou deslocamento (em segundo plano)."""
    ler_projeto(id)
    try:
        return enquadramento.reenquadrar(id, c.campos.get('suavidade'), c.campos.get('desloca'))
    except enquadramento.Ocupado as e:
        raise HTTPException(409, str(e))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
