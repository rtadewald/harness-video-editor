"""Rotas dos presets de enriquecimento (SPEC §8.4) e das transições globais dos inserts."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import presets, transicoes
from .rotas_comum import Campos

rotas = APIRouter()


# ---------------------------------------------------------------- transições globais (entrada e saída dos inserts)

@rotas.get('/api/transicoes')
def ler_transicoes():
    """A configuração global de cada entrada e saída dos inserts."""
    return transicoes.ler()


@rotas.put('/api/transicoes/{lado}/{tipo}')
def definir_transicao_global(lado: str, tipo: str, c: Campos):
    try:
        return transicoes.definir(lado, tipo, c.campos)
    except ValueError as e:
        raise HTTPException(422, str(e))


# ---------------------------------------------------------------- presets de enriquecimento (SPEC §8.4)

def _preset(pid: str) -> dict:
    try:
        return presets.ler(pid)
    except FileNotFoundError:
        raise HTTPException(404, 'Preset não encontrado')


@rotas.get('/api/presets')
def listar_presets():
    return presets.listar()


@rotas.get('/api/presets/fontes')
def fontes_presets():
    """Os trechos de referência que já viraram preset."""
    return presets.fontes()


@rotas.patch('/api/presets/{pid}')
def editar_preset(pid: str, e: Campos):
    """Nome, aprovação e a receita (vale para todos os inserts que usam o preset)."""
    _preset(pid)
    try:
        return presets.editar(pid, e.campos)
    except (ValueError, KeyError, TypeError) as erro:
        raise HTTPException(422, str(erro) or 'Receita inválida')


@rotas.delete('/api/presets/{pid}')
def apagar_preset(pid: str):
    _preset(pid)
    presets.apagar(pid)
    return {'ok': True}


@rotas.get('/api/presets/{pid}/amostra/{k}')
def amostra_preset(pid: str, k: int):
    """O card `k` parado na referência de onde o preset veio (para a revisão lado a lado)."""
    p = _preset(pid)
    if not p.get('fontes') or not 0 <= k < max(len(p['receita']['cards']), len(p.get('recortes') or [])):
        raise HTTPException(404, 'Sem amostra')
    try:
        return FileResponse(presets.amostra(pid, k))
    except Exception as erro:
        raise HTTPException(404, str(erro)[:200])


@rotas.get('/api/presets/externa/{nome}')
def video_externo(nome: str):
    """Um vídeo de referência de fora das Referências (presets/externas)."""
    try:
        arq = presets.video_da_fonte(f'externa:{nome}')
    except FileNotFoundError:
        raise HTTPException(404, 'Sem vídeo')
    if not arq.exists():
        raise HTTPException(404, 'Sem vídeo')
    return FileResponse(arq)


@rotas.get('/api/presets/quadro/{ref}')
def quadro_referencia(ref: str, t: float):
    """Um quadro parado da referência (a foto da revisão enquanto o vídeo não toca)."""
    try:
        return FileResponse(presets.quadro(ref, t), headers={'Cache-Control': 'max-age=86400'})
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, 'Sem quadro')

