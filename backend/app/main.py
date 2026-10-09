"""API do Harness Video Editor: o app, o que recomeça quando o servidor sobe e as rotas de cada assunto (`rotas_*.py`)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import (banco, captura_site, comum, direcao, direcao_projeto, entradas, exportacao, pipeline, recorte_ator, rosto, rotas_cortes,
               rotas_direcao, rotas_exportacao, rotas_inserts, rotas_motions, rotas_presets, rotas_projetos, rotas_referencias,
               rotas_rosto)

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
    yield


app = FastAPI(title='Harness Video Editor', lifespan=ciclo)

for r in (rotas_projetos, rotas_referencias, rotas_cortes, rotas_direcao, rotas_inserts, rotas_exportacao, rotas_presets, rotas_motions, rotas_rosto):
    app.include_router(r.rotas)
