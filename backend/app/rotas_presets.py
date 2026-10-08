"""Rotas dos presets de enriquecimento (SPEC §8.4) e das transições globais dos inserts."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import presets, sons, transicoes
from .rotas_comum import Campos, ler_projeto

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


# ---------------------------------------------------------------- sons de apoio (SPEC §8.6)

@rotas.get('/api/sons')
def catalogo_sons():
    """A biblioteca de sons (id, nome, família, duração, ataque) e o ganho de cada intensidade."""
    return {'sons': sons.catalogo(), 'intensidades': sons.INTENSIDADES}


@rotas.get('/api/projetos/{id}/sons/fator')
def fator_dos_sons(id: str):
    """Quanto os sons sobem ou descem neste projeto (pelo nível da voz do bruto), para a prévia soar como a exportação."""
    ler_projeto(id)
    return {'fator': sons.fator_do_projeto(id)}


@rotas.get('/api/sons/{sid}.m4a')
def arquivo_som(sid: str):
    try:
        return FileResponse(sons.arquivo(sid), media_type='audio/mp4', headers={'Cache-Control': 'no-cache'})
    except FileNotFoundError:
        raise HTTPException(404, 'Som não encontrado')


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


@rotas.get('/api/presets/ordem')
def ordem_presets():
    """A ordem dos presets por situação (tela:mídias) e quantos dos primeiros são favoritos (os recomendados)."""
    return presets.ordem()


@rotas.put('/api/presets/ordem/{situacao}')
def definir_ordem_presets(situacao: str, c: Campos):
    try:
        return presets.definir_ordem(situacao, c.campos.get('ids'), c.campos.get('favoritos', 0))
    except ValueError as e:
        raise HTTPException(422, str(e))


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
        return FileResponse(presets.quadro(ref, t), headers={'Cache-Control': 'no-cache'})
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, 'Sem quadro')



# ---------------------------------------------------------------- recorte do ator (divisão da tela)

@rotas.get('/api/projetos/{id}/recorte')
def estado_recorte(id: str):
    from .rotas_comum import ler_projeto
    return ler_projeto(id).get('recorte') or {'estado': 'nenhum'}


@rotas.post('/api/projetos/{id}/recorte')
def pedir_recorte(id: str):
    from . import recorte_ator
    from .rotas_comum import ler_projeto
    ler_projeto(id)
    return recorte_ator.pedir(id)
