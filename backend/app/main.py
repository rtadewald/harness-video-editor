"""API do Harness Video Editor: o app, o que recomeça quando o servidor sobe e as rotas de cada assunto (`rotas/`)."""
from contextlib import asynccontextmanager


from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import audio, banco, versoes, captura_site, comum, direcao, direcao_projeto, enquadramento, entradas, exportacao, pipeline, recorte_ator, rosto
from .rotas import (aprovacao as r_aprovacao, audio as r_audio, ctas as r_ctas, codigos as r_codigos, versoes as r_versoes, cortes as r_cortes, direcao as r_direcao, exportacao as r_exportacao, inserts as r_inserts,
                    legenda as r_legenda, motions as r_motions, preprocessamento as r_preprocessamento, presets as r_presets,
                    projetos as r_projetos, referencias as r_referencias, revisoes as r_revisoes, rosto as r_rosto, transicoes as r_transicoes)

comum.carregar_env()


@asynccontextmanager
async def ciclo(_app):
    comum.preparar_pastas()  # uma instalação nova: a biblioteca inicial e a pasta dos projetos
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

for r in (r_codigos, r_versoes, r_projetos, r_referencias, r_cortes, r_direcao, r_inserts, r_exportacao, r_presets, r_motions, r_rosto, r_preprocessamento, r_transicoes, r_audio, r_legenda, r_revisoes, r_aprovacao, r_ctas):
    app.include_router(r.rotas)


@app.middleware('http')
async def autoria(request: Request, call_next):
    """Toda edição de uma etapa feita pela tela (sem `X-Autor: claude`) fica marcada como de Rodrigo, na versão em que
    foi feita; com o projeto travado ("Claude editando"), a tela não edita (docs/editor-claude.md, E2)."""
    if request.method not in ('PUT', 'POST', 'PATCH', 'DELETE') or not request.url.path.startswith('/api/projetos/'):
        return await call_next(request)
    do_claude = request.headers.get('x-autor') == 'claude'
    corpo = await request.body() if versoes.precisa_corpo(request.url.path) else b''
    alvo = versoes.alvos_da_rota(request.url.path, corpo)
    if alvo and not do_claude:
        try:
            t = await run_in_threadpool(versoes.trava, alvo[0])
        except FileNotFoundError:
            t = None
        if t:
            etapa = f' ({t["etapa"]})' if t.get('etapa') else ''
            return JSONResponse({'detail': f'O Claude está editando este projeto{etapa}: espere a versão chegar.'}, status_code=423)
    resposta = await call_next(request)
    if alvo and not do_claude and resposta.status_code < 400:
        try:
            await run_in_threadpool(versoes.marcar_manual, alvo[0], alvo[1], alvo[2], request.url.path)
        except FileNotFoundError:
            pass
    return resposta
