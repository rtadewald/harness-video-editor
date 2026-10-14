"""A revisão de Rodrigo e as respostas do Claude (docs/editor-claude.md §6, E8)."""
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import revisoes, versoes
from .comum import ler_projeto

rotas = APIRouter()


def _versao(id: str, versao: int | None) -> int:
    p = ler_projeto(id)
    n = versao if versao is not None else (p.get('versao') or 0)
    if n < 1:
        raise HTTPException(409, 'O projeto ainda não tem versão: marque uma (no topo do editor) para revisar.')
    try:
        versoes.ler(id, n)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return n


@rotas.get('/api/projetos/{id}/revisao')
def ler_revisao(id: str, versao: int | None = None):
    """A revisão de uma versão (a atual, sem `versao`): os comentários, as dúvidas do Claude e o texto do envio."""
    n = _versao(id, versao)
    return {'versao': n, 'revisao': revisoes.ler(id, n), 'duvidas': revisoes.duvidas(id, n), 'texto': revisoes.texto(id, n)}


class Comentarios(BaseModel):
    comentarios: list[dict] = Field(max_length=500)


@rotas.put('/api/projetos/{id}/revisao/{n}')
def salvar_revisao(id: str, n: int, c: Comentarios):
    """Os comentários da tela (o status e a resposta do Claude ficam como estão)."""
    _versao(id, n)
    try:
        return revisoes.salvar(id, n, c.comentarios)
    except ValueError as e:
        raise HTTPException(422, str(e))


@rotas.post('/api/projetos/{id}/revisao/{n}/enviar')
def enviar_revisao(id: str, n: int):
    """Marca a revisão como enviada e devolve o texto para colar no chat do Claude Code."""
    _versao(id, n)
    try:
        return revisoes.enviar(id, n)
    except ValueError as e:
        raise HTTPException(409, str(e))


@rotas.post('/api/projetos/{id}/revisao/{n}/aprovar')
def aprovar_versao(id: str, n: int):
    """Aprova a versão (a revisão e a versão guardada) e devolve o texto "Aprovado · PRJ-… · vN"."""
    _versao(id, n)
    return revisoes.aprovar(id, n)


class Resposta(BaseModel):
    comentario: str = Field(pattern=r'^c\d+$')
    status: Literal['aplicado', 'respondido', 'nao_aplicado']
    resposta: str = Field(default='', max_length=3000)


@rotas.post('/api/projetos/{id}/revisao/{n}/responder')
def responder(id: str, n: int, r: Resposta):
    """A resposta do Claude a um comentário (a tela mostra embaixo dele)."""
    _versao(id, n)
    try:
        return revisoes.responder(id, n, r.comentario, r.status, r.resposta)
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.post('/api/projetos/{id}/revisao/{n}/anexo')
async def anexar(id: str, n: int, comentario: str, request: Request):
    """Um print ou vídeo colado num comentário (o corpo é o arquivo, gravado enquanto chega; o tipo vem no
    Content-Type; até 500 MB)."""
    _versao(id, n)
    try:
        alvo = revisoes.reservar_anexo(id, comentario, request.headers.get('content-type', ''))
    except ValueError as e:
        raise HTTPException(422, str(e))
    total = 0
    try:
        with alvo.open('wb') as f:
            async for parte in request.stream():
                total += len(parte)
                if total > revisoes.MAX_ANEXO:
                    raise HTTPException(422, 'O anexo passa de 500 MB.')
                f.write(parte)
        if not total:
            raise HTTPException(422, 'O anexo veio vazio.')
    except BaseException:
        alvo.unlink(missing_ok=True)
        raise
    return {'caminho': f'revisoes/anexos/{alvo.name}'}


@rotas.delete('/api/projetos/{id}/revisao/{n}/anexo')
def apagar_anexo(id: str, n: int, caminho: str):
    _versao(id, n)
    try:
        revisoes.apagar_anexo(id, caminho)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {'ok': True}


class Duvida(BaseModel):
    palavra: str = Field(min_length=1, max_length=40)
    palavra_fim: str | None = Field(default=None, max_length=40)
    texto: str = Field(min_length=1, max_length=2000)
    fala: str = Field(default='', max_length=400)


@rotas.post('/api/projetos/{id}/duvidas')
def anotar_duvida(id: str, d: Duvida):
    """Uma dúvida do Claude para Rodrigo, presa às palavras; vai com a próxima versão marcada."""
    ler_projeto(id)
    return revisoes.anotar_duvida(id, d.palavra, d.palavra_fim, d.texto, d.fala)
