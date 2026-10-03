"""API do Harness Video Editor."""
import json
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import cortes, midia, mocks, pipeline, projeto

load_dotenv(Path(__file__).resolve().parents[1] / '.env')


@asynccontextmanager
async def ciclo(_app):
    pipeline.retomar_interrompidos()
    yield


app = FastAPI(title='Harness Video Editor', lifespan=ciclo)


def _guardar(upload: UploadFile, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open('wb') as f:
        shutil.copyfileobj(upload.file, f, length=8 * 1024 * 1024)


def _extensao(upload: UploadFile) -> str:
    return Path(upload.filename or '').suffix.lower()


def _ler(id: str) -> dict:
    try:
        return projeto.ler(id)
    except FileNotFoundError:
        raise HTTPException(404, 'Projeto não encontrado')


@app.get('/api/projetos')
def listar():
    return projeto.listar()


@app.post('/api/projetos')
def criar(
    nome: Annotated[str, Form()],
    bruto: Annotated[UploadFile, File()],
    briefing_texto: Annotated[str, Form()] = '',
    briefing_audio: Annotated[UploadFile | None, File()] = None,
    apoios: Annotated[list[UploadFile], File()] = [],
):
    nome = nome.strip()
    if not nome:
        raise HTTPException(422, 'Dê um nome ao projeto')
    id = projeto.novo_id(nome)
    base = projeto.RAIZ / id
    try:
        fontes = []
        destino = base / 'midia' / f'bruto{_extensao(bruto)}'
        _guardar(bruto, destino)
        fontes.append({'id': 'f1', 'papel': 'bruto', 'arquivo': str(destino.relative_to(base)),
                       'nome_original': bruto.filename, **midia.inspecionar(destino)})

        for i, apoio in enumerate(apoios, 1):
            destino = base / 'midia' / 'apoio' / f'a{i}{_extensao(apoio)}'
            _guardar(apoio, destino)
            fontes.append({'id': f'a{i}', 'papel': 'apoio', 'arquivo': str(destino.relative_to(base)),
                           'nome_original': apoio.filename, **midia.inspecionar(destino)})

        briefing = {'texto': briefing_texto.strip(), 'audio': None}
        if briefing_texto.strip():
            (base / 'briefing').mkdir(parents=True, exist_ok=True)
            (base / 'briefing' / 'briefing.txt').write_text(briefing_texto.strip(), encoding='utf-8')
        if briefing_audio and briefing_audio.filename:
            destino = base / 'briefing' / f'audio{_extensao(briefing_audio)}'
            _guardar(briefing_audio, destino)
            briefing['audio'] = str(destino.relative_to(base))

        novo = projeto.criar(id, nome, fontes, briefing)
    except Exception as e:
        shutil.rmtree(base, ignore_errors=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(422, f'Não consegui ler um dos arquivos: {e}')
    pipeline.enfileirar(id)
    return projeto.ler(novo['id'])


@app.get('/api/projetos/{id}')
def abrir(id: str):
    return _ler(id)


@app.post('/api/projetos/{id}/processar')
def processar(id: str):
    """Roda de novo o pipeline inteiro (ex.: depois de um erro)."""
    _ler(id)
    pipeline.enfileirar(id)
    return projeto.ler(id)


@app.post('/api/projetos/{id}/cortes/refazer')
def refazer_cortes(id: str):
    """Pede à IA uma nova seleção de palavras, sem retranscrever."""
    p = _ler(id)
    if p.get('pipeline', {}).get('passos', {}).get('alinhamento', {}).get('status') != 'pronto':
        raise HTTPException(409, 'A transcrição ainda não terminou')
    pipeline.enfileirar(id, ['cortes'])
    return projeto.ler(id)


@app.get('/api/projetos/{id}/editor')
def editor(id: str):
    """Transcrição e V1 reais (quando prontas); V2, V3 e LEG ainda simuladas."""
    p = _ler(id)
    if 'cortes' not in p:
        return {'projeto': p, 'palavras': [], 'timeline': {'V1': [], 'V2': [], 'V3': [], 'LEG': []}, 'duvidas': []}
    palavras = json.loads((projeto.pasta(id) / 'transcricao.json').read_text(encoding='utf-8'))['palavras']
    for w, fica in zip(palavras, cortes.mantidas_por_indice(palavras, p['cortes']['mantidas'])):
        w['mantida'] = fica
    silencios = json.loads((projeto.pasta(id) / 'silencios.json').read_text())['silencios']
    return {'projeto': p, 'palavras': palavras, 'silencios': silencios, 'duvidas': p['cortes']['duvidas'],
            'timeline': {'V1': p['timeline']['V1'], **mocks.trilhas(palavras, p)}}


class Mensagem(BaseModel):
    texto: str


@app.post('/api/projetos/{id}/chat/{etapa}')
def conversar(id: str, etapa: str, msg: Mensagem):
    """Agente fictício: guarda a fala de Rodrigo e uma resposta pronta da etapa."""
    _ler(id)
    if etapa not in projeto.ETAPAS:
        raise HTTPException(404, 'Etapa não existe')
    if not msg.texto.strip():
        raise HTTPException(422, 'Mensagem vazia')
    novas = [mocks.mensagem('rodrigo', msg.texto.strip()), mocks.responder(etapa)]
    projeto.atualizar(id, lambda p: p['chats'][etapa].extend(novas))
    return novas


@app.get('/api/projetos/{id}/miniatura')
def miniatura(id: str):
    """Gerada no primeiro pedido e guardada na pasta do projeto."""
    p = _ler(id)
    destino = projeto.pasta(id) / 'miniatura.jpg'
    if not destino.exists():
        bruto = next(f for f in p['fontes'] if f['papel'] == 'bruto')
        midia.miniatura(projeto.pasta(id) / bruto['arquivo'], destino, bruto['duracao'])
    return FileResponse(destino)


@app.get('/api/projetos/{id}/arquivos/{caminho:path}')
def arquivo(id: str, caminho: str):
    _ler(id)
    base = projeto.pasta(id)
    alvo = (base / caminho).resolve()
    if not alvo.is_relative_to(base) or not alvo.is_file():
        raise HTTPException(404, 'Arquivo não encontrado')
    return FileResponse(alvo)
