"""Rotas das transições entre planos (SPEC §8.8; docs/transicoes.md): a biblioteca, os pares com a ordem e as favoritas,
os efeitos em vídeo e as escolhas de cada projeto."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import projeto, transicoes
from .rotas_comum import Campos, ler_projeto

rotas = APIRouter()


@rotas.get('/api/transicoes')
def biblioteca():
    """As transições, os pares vistos nas referências e a ordem e as favoritas de cada par."""
    return {'transicoes': transicoes.listar(), **transicoes.pares()}


@rotas.patch('/api/transicoes/{tid}')
def editar(tid: str, c: Campos):
    if not transicoes.existe(tid):
        raise HTTPException(404, 'Transição não encontrada')
    try:
        return transicoes.editar(tid, c.campos)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


@rotas.put('/api/transicoes/ordem/{par}')
def ordem(par: str, c: Campos):
    try:
        return transicoes.definir_ordem(par, c.campos.get('ids'), c.campos.get('favoritas', 0))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


@rotas.get('/api/transicoes/efeitos/{nome}.webm')
def efeito(nome: str):
    arq = transicoes.EFEITOS / f'{nome}.webm'
    if not nome.isalnum() or not arq.exists():
        raise HTTPException(404, 'Efeito não encontrado')
    return FileResponse(arq, media_type='video/webm', headers={'Cache-Control': 'max-age=3600'})


@rotas.get('/api/projetos/{id}/transicoes')
def escolhas(id: str):
    """As transições trocadas à mão no projeto (o id do plano que entra → `{id, par}`; uma escolha cujo par não bate mais
    com o corte, depois de outra direção, é ignorada pelo front); os outros cortes seguem a 1ª favorita do par."""
    return transicoes.do_projeto(ler_projeto(id))


@rotas.put('/api/projetos/{id}/transicoes')
def escolher(id: str, c: Campos):
    """Troca a transição de cortes do projeto: `{plano: {id, par}}` (ou só o id; null volta ao padrão do par)."""
    ler_projeto(id)
    try:
        novas = {k: v for k, v in c.campos.items()}
        limpas = transicoes.validar_escolhas({k: v for k, v in novas.items() if v is not None})
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))

    def mudar(p):
        atual = transicoes.do_projeto(p)
        for k, v in novas.items():
            if v is None:
                atual.pop(k, None)
        atual.update(limpas)
        p['transicoes'] = atual
    return transicoes.do_projeto(projeto.atualizar(id, mudar))
