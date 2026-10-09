"""Rotas da legenda (SPEC §8.10; docs/legenda.md): as escolhas do projeto (ligada, modo e os ajustes dos blocos, presos
às palavras). Os blocos são montados no navegador (a mesma conta da prévia e da página de render)."""
from fastapi import APIRouter, HTTPException

from . import legenda, projeto
from .rotas_comum import Campos, ler_projeto

rotas = APIRouter()


@rotas.get('/api/projetos/{id}/legenda')
def do_projeto(id: str):
    return legenda.do_projeto(ler_projeto(id))


@rotas.put('/api/projetos/{id}/legenda')
def definir(id: str, c: Campos):
    """Muda as escolhas: `ligada`, `modo`, `ajustes` ({palavra: {fim, texto} | null}) e `limpar` (volta tudo ao automático).
    A mescla com o que está gravado acontece dentro da trava do projeto: dois cliques seguidos (o front não espera um
    PUT para mandar o outro) não apagam o ajuste um do outro."""
    ler_projeto(id)

    def mudar(p):
        p['legenda'] = legenda.validar(c.campos, legenda.do_projeto(p))
    try:
        return legenda.do_projeto(projeto.atualizar(id, mudar))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
