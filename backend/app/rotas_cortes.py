"""Rotas dos cortes (SPEC §8.1): refazer, recalcular, a faixa de silêncio e os ajustes de cada clipe."""
import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import (
    cortes,
    pipeline,
    projeto,
)
from .rotas_comum import ler_projeto as _ler

rotas = APIRouter()


@rotas.post('/api/projetos/{id}/cortes/refazer')
def refazer_cortes(id: str):
    """Pede à IA uma nova seleção de palavras, sem retranscrever."""
    p = _ler(id)
    if p.get('pipeline', {}).get('passos', {}).get('alinhamento', {}).get('status') != 'pronto':
        raise HTTPException(409, 'A transcrição ainda não terminou')
    pipeline.enfileirar(id, ['cortes'])
    return projeto.ler(id)


@rotas.post('/api/projetos/{id}/cortes/recalcular')
def recalcular_cortes(id: str):
    """Refaz os clipes a partir das palavras que já estão mantidas, com as margens vigentes em Configurações. Não chama a
    IA. Descarta os ajustes manuais de borda (as palavras ligadas ou desligadas à mão continuam)."""
    p = _ler(id)
    if 'cortes' not in p:
        raise HTTPException(409, 'Os cortes ainda não foram feitos')
    palavras = projeto.ler_palavras(id)
    silencios = json.loads((projeto.pasta(id) / 'silencios.json').read_text())['silencios']
    bruto = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    params = cortes.parametros(projeto.ler_config())
    clipes = cortes.montar_clipes(palavras, cortes.mantidas_por_indice(palavras, p['cortes']['mantidas']), silencios,
                                  bruto['duracao'], **params)

    def aplicar(p: dict) -> None:
        p['timeline']['V1'] = clipes
        p['cortes']['parametros'] = params
        p['cortes'].pop('mantidas_auto', None)  # clipes novos: não há mais o que restaurar
    projeto.atualizar(id, aplicar)
    return projeto.ler(id)


class Ajuste(BaseModel):
    lado: Literal['inicio', 'fim']
    t: float


def _com_cortes(id: str, mudar) -> None:
    """Aplica uma edição manual nos cortes (palavras e clipes) e salva; regras violadas viram 422."""
    p = _ler(id)
    if 'cortes' not in p:
        raise HTTPException(409, 'Os cortes ainda não foram feitos')
    palavras = projeto.ler_palavras(id)
    bruto = next(f for f in p['fontes'] if f['papel'] == 'bruto')

    def aplicar(p: dict) -> None:
        c = p['cortes']
        c.setdefault('mantidas_auto', c['mantidas'])  # o que a IA decidiu, para poder restaurar
        fica = cortes.mantidas_por_indice(palavras, c['mantidas'])
        fica_auto = cortes.mantidas_por_indice(palavras, c['mantidas_auto'])
        nova = mudar(p['timeline']['V1'], palavras, fica, fica_auto, bruto['duracao'])
        c['mantidas'] = cortes.faixas_de(palavras, nova)
        p['timeline']['V1'].sort(key=lambda x: x['inicio'])

    try:
        projeto.atualizar(id, aplicar)
    except ValueError as e:
        raise HTTPException(422, str(e))


class Faixa(BaseModel):
    inicio: float
    fim: float
    manter: bool = False  # False = cortar esse intervalo; True = devolvê-lo ao vídeo


@rotas.post('/api/projetos/{id}/cortes/faixa')
def alterar_faixa(id: str, f: Faixa):
    """Cria um corte novo no intervalo (mesmo no meio de um trecho mantido) ou devolve um intervalo ao vídeo."""
    _com_cortes(id, lambda clipes, palavras, fica, _auto, duracao: cortes.alterar_faixa(clipes, palavras, fica, f.inicio, f.fim, f.manter, duracao))
    return {'ok': True}


@rotas.post('/api/projetos/{id}/clipes/{cid}/ajustar')
def ajustar_clipe(id: str, cid: str, a: Ajuste):
    """Arrastar uma borda de corte: move o início ou o fim de um trecho mantido."""
    _com_cortes(id, lambda clipes, palavras, fica, _auto, duracao: cortes.ajustar_borda(clipes, palavras, fica, cid, a.lado, a.t, duracao))
    return {'ok': True}


@rotas.post('/api/projetos/{id}/clipes/{cid}/restaurar')
def restaurar(id: str, cid: str):
    _com_cortes(id, lambda clipes, palavras, fica, fica_auto, _d: cortes.restaurar_clipe(clipes, palavras, fica, fica_auto, cid))
    return {'ok': True}
