"""Rotas dos projetos: a configuração, criar, abrir e processar, o editor, as transcrições e os arquivos."""
import json
import os
import shutil
import traceback
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import (
    comum,
    cortes,
    midia,
    motores,
    pipeline,
    projeto,
)
from .rotas_comum import extensao_do_upload as _extensao
from .rotas_comum import guardar_upload as _guardar
from .rotas_comum import ler_projeto as _ler

rotas = APIRouter()


class Config(BaseModel):
    motor_padrao: str | None = None
    antes_do_corte_ms: int | None = Field(default=None, ge=0, le=1000)
    depois_do_corte_ms: int | None = Field(default=None, ge=0, le=1000)
    pausa_max_ms: int | None = Field(default=None, ge=0, le=30000)  # 0 = nunca encurtar pausas
    modelo_direcao: str | None = Field(default=None, min_length=3, max_length=120)
    quadros_por_segundo: int | None = Field(default=None, ge=1, le=4)
    formato_analise: Literal['video', 'mosaico'] | None = None
    grade_mosaico: Literal['3x2', '3x1'] | None = None
    perfil_criador: str | None = Field(default=None, max_length=1000)
    modelo_direcao_projeto: str | None = Field(default=None, min_length=3, max_length=120)
    modelo_diretora: str | None = Field(default=None, min_length=3, max_length=120)  # quem escreve o roteiro dirigido
    raciocinio_diretora: Literal['low', 'medium', 'high'] | None = None


def _config_completa() -> dict:
    comum.carregar_env()
    return {**projeto.ler_config(), 'motores': {
        vid: {'nome': m['nome'], 'familia': m['familia'], 'chave': (bool(os.getenv(m['chave'])) if m.get('chave') else None)}
        for vid, m in projeto.MOTORES.items()}}


@rotas.get('/api/config')
def ler_config():
    """Preferências do app e os motores de transcrição disponíveis (chave: se a API key está no .env, ou null se não precisa)."""
    return _config_completa()


class Renomear(BaseModel):
    nome: str


@rotas.put('/api/projetos/{id}/nome')
def renomear(id: str, r: Renomear):
    """Muda só o nome exibido; o id (e a pasta) do projeto continuam os mesmos."""
    nome = r.nome.strip()
    if not nome:
        raise HTTPException(422, 'Dê um nome ao projeto')
    _ler(id)
    return projeto.atualizar(id, lambda p: p.update(nome=nome[:120]))


@rotas.put('/api/config')
def salvar_config(c: Config):
    if c.motor_padrao is not None and c.motor_padrao not in projeto.MOTORES:
        raise HTTPException(422, 'Motor de transcrição desconhecido')
    mudancas = {k: v for k, v in c.model_dump().items() if v is not None}
    nova = {**projeto.ler_config(), **mudancas}
    projeto.salvar_config(nova)
    return _config_completa()


@rotas.get('/api/projetos')
def listar():
    return projeto.listar()


@rotas.post('/api/projetos')
def criar(
    nome: Annotated[str, Form()],
    bruto: Annotated[UploadFile, File()],
    briefing_texto: Annotated[str, Form()] = '',
    briefing_audio: Annotated[UploadFile | None, File()] = None,
    apoios: Annotated[list[UploadFile], File()] = [],
    motor: Annotated[str, Form()] = '',
    formato: Annotated[str, Form()] = 'reels',
):
    """A tela de criação manda nome, motor, formato e o vídeo (SPEC §6); o briefing e os vídeos de apoio ainda são aceitos
    (clientes antigos), mas não vêm mais da tela."""
    nome = nome.strip()
    if not nome:
        raise HTTPException(422, 'Dê um nome ao projeto')
    if motor and motor not in projeto.MOTORES:
        raise HTTPException(422, 'Motor de transcrição desconhecido')
    if formato not in projeto.FORMATOS:
        raise HTTPException(422, 'Formato desconhecido')
    if not projeto.FORMATOS[formato]:
        raise HTTPException(422, 'Esse formato ainda não está disponível (em breve)')
    id = projeto.novo_id(nome)
    base = projeto.RAIZ / id
    try:
        fontes = []
        destino = base / 'midia' / f'bruto{_extensao(bruto)}'
        _guardar(bruto, destino)
        info = midia.inspecionar(destino)
        if 'largura' not in info:
            raise HTTPException(422, 'Este arquivo não tem imagem: escolha um vídeo.')
        if not info['tem_audio']:
            raise HTTPException(422, 'Este vídeo não tem áudio: o editor precisa da fala para transcrever e cortar.')
        fontes.append({'id': 'f1', 'papel': 'bruto', 'arquivo': str(destino.relative_to(base)),
                       'nome_original': bruto.filename, **info})

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

        novo = projeto.criar(id, nome, fontes, briefing, motor or None, formato)
    except Exception as e:
        shutil.rmtree(base, ignore_errors=True)
        if isinstance(e, HTTPException):
            raise
        if isinstance(e, midia.ErroMidia):
            raise HTTPException(422, str(e))
        traceback.print_exc()
        raise HTTPException(422, f'Não consegui ler um dos arquivos: {midia.legivel(e)}')
    pipeline.enfileirar(id)
    return projeto.ler(novo['id'])


@rotas.get('/api/projetos/{id}')
def abrir(id: str):
    return _ler(id)


@rotas.post('/api/projetos/{id}/processar')
def processar(id: str):
    """Roda de novo o pipeline inteiro (ex.: depois de um erro). Não durante um Reenquadrar (os dois mexem no 9:16 e no proxy)."""
    p = _ler(id)
    if (p.get('enquadramento') or {}).get('estado') in ('fila', 'rodando'):
        raise HTTPException(409, 'O vídeo está sendo reenquadrado: espere terminar')
    pipeline.enfileirar(id)
    return projeto.ler(id)


@rotas.get('/api/projetos/{id}/editor')
def editor(id: str):
    """A transcrição e a V1 (quando prontas). O resto (direção, inserts, motions…) vem das rotas de cada área."""
    p = _ler(id)
    if 'cortes' not in p:
        return {'projeto': p, 'palavras': [], 'timeline': {'V1': []}, 'duvidas': []}
    palavras = projeto.ler_palavras(id)
    for w, fica in zip(palavras, cortes.mantidas_por_indice(palavras, p['cortes']['mantidas'])):
        w['mantida'] = fica
    silencios = json.loads((projeto.pasta(id) / 'silencios.json').read_text())['silencios']
    return {'projeto': p, 'palavras': palavras, 'silencios': silencios, 'duvidas': p['cortes']['duvidas'],
            'timeline': {'V1': p['timeline']['V1']}}


@rotas.get('/api/projetos/{id}/transcricoes/{vid}')
def transcricao_de(id: str, vid: str):
    """Palavras de uma transcrição (para comparar com a que está sendo vista)."""
    t = _ler(id)['transcricoes'].get(vid)
    if t is None or t['status'] != 'pronto':
        raise HTTPException(404, 'Essa transcrição não está pronta')
    return {'id': vid, 'nome': t['nome'], 'familia': t['familia'], 'palavras': projeto.ler_palavras(id, vid)}


@rotas.post('/api/projetos/{id}/transcricoes/{vid}/ativar')
def ativar_transcricao(id: str, vid: str):
    """Troca a transcrição vista. Se for de outra família (texto diferente) e ainda sem cortes, a IA os faz."""
    _ler(id)
    precisa = [False]
    try:
        projeto.atualizar(id, lambda p: precisa.__setitem__(0, projeto.ativar_variante(p, vid)))
    except ValueError as e:
        raise HTTPException(422, str(e))
    if precisa[0]:
        pipeline.enfileirar(id, ['cortes'])
    return projeto.ler(id)


@rotas.post('/api/projetos/{id}/transcricoes/rodar')
def rodar_motores(id: str, vid: str | None = None):
    """Roda os motores que faltam (ou só `vid`, de novo): útil depois de pôr a chave de API em backend/.env."""
    p = _ler(id)
    if vid is not None and (vid not in p['transcricoes'] or vid not in motores.EXTRAS):
        raise HTTPException(404, 'Motor desconhecido')
    pendentes = [vid] if vid else [v for v in motores.EXTRAS if p['transcricoes'][v]['status'] != 'pronto']
    if pendentes:
        pipeline.enfileirar_motores(id, pendentes)
    return projeto.ler(id)


@rotas.get('/api/projetos/{id}/miniatura')
def miniatura(id: str):
    """Gerada no primeiro pedido e guardada na pasta do projeto."""
    p = _ler(id)
    destino = projeto.pasta(id) / 'miniatura.jpg'
    if not destino.exists():
        bruto = next(f for f in p['fontes'] if f['papel'] == 'bruto')
        midia.miniatura(projeto.pasta(id) / bruto['arquivo'], destino, bruto['duracao'])
    return FileResponse(destino)


@rotas.get('/api/projetos/{id}/arquivos/{caminho:path}')
def arquivo(id: str, caminho: str):
    _ler(id)
    base = projeto.pasta(id)
    alvo = (base / caminho).resolve()
    if not alvo.is_relative_to(base) or not alvo.is_file():
        raise HTTPException(404, 'Arquivo não encontrado')
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})
