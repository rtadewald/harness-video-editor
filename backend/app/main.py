"""API do Harness Video Editor."""
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import midia, mocks, projeto

app = FastAPI(title='Harness Video Editor')


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

        return projeto.criar(id, nome, fontes, briefing)
    except Exception as e:
        shutil.rmtree(base, ignore_errors=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(422, f'Não consegui ler um dos arquivos: {e}')


@app.get('/api/projetos/{id}')
def abrir(id: str):
    return _ler(id)


@app.get('/api/projetos/{id}/editor')
def editor(id: str):
    """Tudo que o editor precisa. Na fase 2, transcrição e timeline são mock."""
    p = _ler(id)
    return {'projeto': p, **mocks.editor(p)}


class Mensagem(BaseModel):
    texto: str


@app.post('/api/projetos/{id}/chat/{etapa}')
def conversar(id: str, etapa: str, msg: Mensagem):
    """Agente fictício: guarda a fala de Rodrigo e uma resposta pronta da etapa."""
    p = _ler(id)
    if etapa not in projeto.ETAPAS:
        raise HTTPException(404, 'Etapa não existe')
    if not msg.texto.strip():
        raise HTTPException(422, 'Mensagem vazia')
    novas = [mocks.mensagem('rodrigo', msg.texto.strip()), mocks.responder(etapa)]
    p['chats'][etapa] += novas
    projeto.salvar(p)
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
