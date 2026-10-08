"""Rotas da direção visual do projeto (SPEC §8.2.2): gerar, corrigir, as versões, os comentários e o registro."""
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import direcao_projeto, projeto
from .rotas_comum import ler_projeto as _ler

rotas = APIRouter()


@rotas.post('/api/projetos/{id}/direcao/gerar')
def gerar_direcao(id: str):
    """Pede à IA a direção visual do vídeo cortado (em segundo plano; a tela acompanha `projeto.direcao.status`)."""
    p = _ler(id)
    if 'cortes' not in p or not p['timeline']['V1']:
        raise HTTPException(409, 'Os cortes ainda não estão prontos')
    if p.get('direcao', {}).get('status') == 'rodando':
        raise HTTPException(409, 'A direção já está sendo gerada')
    direcao_projeto.gerar(id)
    return projeto.ler(id)


class Correcao(BaseModel):
    geral: str | None = Field(default=None, max_length=4000)


@rotas.post('/api/projetos/{id}/direcao/corrigir')
def corrigir_direcao(id: str, c: Correcao):
    """Gera a próxima versão (v2, v3…) a partir da aberta: a corretora aplica os comentários dela."""
    p = _ler(id)
    d = p.get('direcao') or {}
    if not d.get('versoes'):
        raise HTTPException(409, 'A direção ainda não foi gerada')
    if d.get('status') == 'rodando':
        raise HTTPException(409, 'A direção já está sendo gerada')
    try:
        direcao_projeto.pedir_correcao(id, c.geral)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return projeto.ler(id)


class Versao(BaseModel):
    n: int


@rotas.put('/api/projetos/{id}/direcao/versao')
def abrir_versao_direcao(id: str, v: Versao):
    """Abre outra versão da direção (é nela que se edita e comenta)."""
    def abrir(p):
        d = p.get('direcao') or {}
        if not any(x['n'] == v.n for x in d.get('versoes', [])):
            raise ValueError('Versão não encontrada')
        d['ativa'] = v.n
        projeto.espelhar_direcao(d)
    try:
        return projeto.atualizar(id, abrir)['direcao']
    except ValueError as e:
        raise HTTPException(404, str(e))


class Comentario(BaseModel):
    palavra: str
    off: float = Field(ge=-10, le=10)
    texto: str = Field(min_length=1, max_length=2000)


class TextoComentario(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)


def _na_versao_aberta(id: str, mudar) -> dict:
    """Aplica uma mudança nos comentários da versão aberta e devolve a direção."""
    def aplicar(p):
        d = p.get('direcao') or {}
        if not d.get('versoes'):
            raise LookupError('A direção ainda não foi gerada')
        v = projeto.versao_ativa(d)
        v['comentarios'] = mudar(list(v.get('comentarios') or []))
        projeto.espelhar_direcao(d)
    try:
        return projeto.atualizar(id, aplicar)['direcao']
    except LookupError as e:
        raise HTTPException(404, str(e))


@rotas.post('/api/projetos/{id}/direcao/comentarios')
def comentar_direcao(id: str, c: Comentario):
    if c.palavra not in {w['id'] for w in projeto.ler_palavras(id)}:
        raise HTTPException(422, 'Comentário preso a uma palavra que não existe')
    novo = {'id': uuid.uuid4().hex[:8], 'palavra': c.palavra, 'off': round(c.off, 3), 'texto': c.texto.strip(),
            'criado_em': datetime.now().isoformat(timespec='seconds')}
    return _na_versao_aberta(id, lambda cs: [*cs, novo])


@rotas.put('/api/projetos/{id}/direcao/comentarios/{cid}')
def editar_comentario_direcao(id: str, cid: str, c: TextoComentario):
    def mudar(cs):
        if not any(x['id'] == cid for x in cs):
            raise LookupError('Comentário não encontrado')
        return [{**x, 'texto': c.texto.strip()} if x['id'] == cid else x for x in cs]
    return _na_versao_aberta(id, mudar)


@rotas.delete('/api/projetos/{id}/direcao/comentarios/{cid}')
def excluir_comentario_direcao(id: str, cid: str):
    return _na_versao_aberta(id, lambda cs: [x for x in cs if x['id'] != cid])


@rotas.get('/api/projetos/{id}/direcao/registro')
def registro_direcao(id: str, versao: int | None = None):
    """O prompt enviado e as respostas de uma versão (sem `versao`, a aberta; o histórico fica em projetos/<id>/direcao_log/)."""
    p = _ler(id)
    d = p.get('direcao') or {}
    n = d.get('ativa') if versao is None else versao
    nome = next((v.get('registro') for v in d.get('versoes', []) if v['n'] == n), None)
    r = direcao_projeto.ler_registro(id, nome) if nome else direcao_projeto.ler_registro(id)
    if r is None:
        raise HTTPException(404, 'Nenhuma geração registrada ainda')
    return r


class EdicaoDirecaoProjeto(BaseModel):
    itens: list[dict]


@rotas.put('/api/projetos/{id}/direcao')
def salvar_direcao_projeto(id: str, e: EdicaoDirecaoProjeto):
    p = _ler(id)
    if not (p.get('direcao') or {}).get('versoes'):
        raise HTTPException(409, 'A direção ainda não foi gerada')
    try:
        itens = direcao_projeto.validar(e.itens, {w['id'] for w in projeto.ler_palavras(id)})
    except ValueError as erro:
        raise HTTPException(422, str(erro))

    def salvar(x):  # os ajustes ficam na versão aberta
        projeto.versao_ativa(x['direcao'])['itens'] = itens
        projeto.espelhar_direcao(x['direcao'])
    return projeto.atualizar(id, salvar)['direcao']
