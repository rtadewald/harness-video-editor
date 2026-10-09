"""API do Harness Video Editor: o app, o que recomeça quando o servidor sobe e as rotas de cada assunto (`rotas/`)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import audio, banco, captura_site, comum, direcao, direcao_projeto, enquadramento, entradas, exportacao, pipeline, recorte_ator, rosto
from .rotas import (audio as r_audio, cortes as r_cortes, direcao as r_direcao, exportacao as r_exportacao, inserts as r_inserts,
                    legenda as r_legenda, motions as r_motions, preprocessamento as r_preprocessamento, presets as r_presets,
                    projetos as r_projetos, referencias as r_referencias, rosto as r_rosto, transicoes as r_transicoes)

comum.carregar_env()


@asynccontextmanager
async def ciclo(_app):
    entradas.migrar()  # a chave antiga `transicoes` das Configurações vira `entradas` (o nome fica para a P2)
    pipeline.retomar_interrompidos()
    direcao.retomar_interrompidas()
    direcao_projeto.retomar_interrompidas()
    banco.retomar_interrompidos()
    banco.atualizar_proxies()
    captura_site.retomar_interrompidas()
    exportacao.retomar_interrompidas()
    recorte_ator.retomar_interrompidos()
    rosto.retomar_interrompidos()
    enquadramento.retomar_interrompidos()
    audio.retomar_interrompidos()
    yield


app = FastAPI(title='Harness Video Editor', lifespan=ciclo)

for r in (r_projetos, r_referencias, r_cortes, r_direcao, r_inserts, r_exportacao, r_presets, r_motions, r_rosto, r_preprocessamento, r_transicoes, r_audio, r_legenda):
    app.include_router(r.rotas)
