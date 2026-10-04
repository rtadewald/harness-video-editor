"""API do Harness Video Editor."""
import json
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import cortes, midia, mocks, motores, pipeline, projeto, referencias

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


class Config(BaseModel):
    motor_padrao: str | None = None
    antes_do_corte_ms: int | None = Field(default=None, ge=0, le=1000)
    depois_do_corte_ms: int | None = Field(default=None, ge=0, le=1000)
    pausa_max_ms: int | None = Field(default=None, ge=0, le=30000)  # 0 = nunca encurtar pausas
    respiro_ms: int | None = Field(default=None, ge=0, le=5000)


def _config_completa() -> dict:
    load_dotenv(pipeline.ENV, override=True)
    return {**projeto.ler_config(), 'motores': {
        vid: {'nome': m['nome'], 'familia': m['familia'], 'chave': (bool(os.getenv(m['chave'])) if m.get('chave') else None)}
        for vid, m in projeto.MOTORES.items()}}


@app.get('/api/config')
def ler_config():
    """Preferências do app e os motores de transcrição disponíveis (chave: se a API key está no .env, ou null se não precisa)."""
    return _config_completa()


class Renomear(BaseModel):
    nome: str


@app.put('/api/projetos/{id}/nome')
def renomear(id: str, r: Renomear):
    """Muda só o nome exibido; o id (e a pasta) do projeto continuam os mesmos."""
    nome = r.nome.strip()
    if not nome:
        raise HTTPException(422, 'Dê um nome ao projeto')
    _ler(id)
    return projeto.atualizar(id, lambda p: p.update(nome=nome[:120]))


@app.put('/api/config')
def salvar_config(c: Config):
    if c.motor_padrao is not None and c.motor_padrao not in projeto.MOTORES:
        raise HTTPException(422, 'Motor de transcrição desconhecido')
    mudancas = {k: v for k, v in c.model_dump().items() if v is not None}
    nova = {**projeto.ler_config(), **mudancas}
    if nova['pausa_max_ms'] and nova['respiro_ms'] > nova['pausa_max_ms']:
        raise HTTPException(422, 'O que sobra de uma pausa cortada não pode ser maior que a pausa a partir da qual se corta.')
    projeto.salvar_config(nova)
    return _config_completa()


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
    motor: Annotated[str, Form()] = '',
):
    nome = nome.strip()
    if not nome:
        raise HTTPException(422, 'Dê um nome ao projeto')
    if motor and motor not in projeto.MOTORES:
        raise HTTPException(422, 'Motor de transcrição desconhecido')
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

        novo = projeto.criar(id, nome, fontes, briefing, motor or None)
    except Exception as e:
        shutil.rmtree(base, ignore_errors=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(422, f'Não consegui ler um dos arquivos: {e}')
    pipeline.enfileirar(id)
    return projeto.ler(novo['id'])


def _ler_referencia(id: str) -> dict:
    try:
        return referencias.ler(id)
    except FileNotFoundError:
        raise HTTPException(404, 'Referência não encontrada')


@app.get('/api/referencias')
def listar_referencias():
    return referencias.listar()


@app.post('/api/referencias')
def criar_referencias(videos: Annotated[list[UploadFile], File()]):
    """Vários MP4 de uma vez. Cada um vira uma referência na fila; os que não servem voltam em `recusadas` com o motivo
    (só vídeos verticais por enquanto, SPEC §8.2.1)."""
    criadas, recusadas = [], []
    for v in videos:
        nome = v.filename or 'video.mp4'
        id = referencias.novo_id(nome)
        base = referencias.RAIZ / id
        destino = base / f'video{_extensao(v) or ".mp4"}'
        try:
            _guardar(v, destino)
            info = midia.inspecionar(destino)
            if 'largura' not in info:
                raise ValueError('não tem imagem')
            if referencias.formato(info['largura'], info['altura']) != 'vertical':
                raise ValueError(f"é {info['largura']}×{info['altura']}; por enquanto só vídeos verticais")
            midia.miniatura(destino, base / 'miniatura.jpg', info['duracao'])
            criadas.append(referencias.criar(id, Path(nome).stem, {'arquivo': destino.name, 'nome_original': nome, **info}))
        except Exception as e:
            shutil.rmtree(base, ignore_errors=True)
            motivo = str(e) if isinstance(e, ValueError) else 'não consegui ler o arquivo'
            recusadas.append({'nome': nome, 'motivo': motivo})
    return {'criadas': criadas, 'recusadas': recusadas}


@app.get('/api/referencias/{id}')
def abrir_referencia(id: str):
    return _ler_referencia(id)


@app.delete('/api/referencias/{id}')
def apagar_referencia(id: str):
    _ler_referencia(id)
    referencias.apagar(id)
    return {'ok': True}


@app.get('/api/referencias/{id}/arquivos/{caminho:path}')
def arquivo_referencia(id: str, caminho: str):
    _ler_referencia(id)
    base = referencias.pasta(id)
    alvo = (base / caminho).resolve()
    if not alvo.is_relative_to(base) or not alvo.is_file() or alvo.name == 'referencia.json':
        raise HTTPException(404, 'Arquivo não encontrado')
    return FileResponse(alvo)


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


@app.post('/api/projetos/{id}/cortes/recalcular')
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


@app.get('/api/projetos/{id}/editor')
def editor(id: str):
    """Transcrição e V1 reais (quando prontas); V2, V3 e LEG ainda simuladas."""
    p = _ler(id)
    if 'cortes' not in p:
        return {'projeto': p, 'palavras': [], 'timeline': {'V1': [], 'V2': [], 'V3': [], 'LEG': [], 'DIR': []}, 'duvidas': []}
    palavras = projeto.ler_palavras(id)
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


@app.get('/api/projetos/{id}/transcricoes/{vid}')
def transcricao_de(id: str, vid: str):
    """Palavras de uma transcrição (para comparar com a que está sendo vista)."""
    t = _ler(id)['transcricoes'].get(vid)
    if t is None or t['status'] != 'pronto':
        raise HTTPException(404, 'Essa transcrição não está pronta')
    return {'id': vid, 'nome': t['nome'], 'familia': t['familia'], 'palavras': projeto.ler_palavras(id, vid)}


@app.post('/api/projetos/{id}/transcricoes/{vid}/ativar')
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


@app.post('/api/projetos/{id}/transcricoes/rodar')
def rodar_motores(id: str, vid: str | None = None):
    """Roda os motores que faltam (ou só `vid`, de novo): útil depois de pôr a chave de API em backend/.env."""
    p = _ler(id)
    if vid is not None and (vid not in p['transcricoes'] or vid not in motores.EXTRAS):
        raise HTTPException(404, 'Motor desconhecido')
    pendentes = [vid] if vid else [v for v in motores.EXTRAS if p['transcricoes'][v]['status'] != 'pronto']
    if pendentes:
        pipeline.enfileirar_motores(id, pendentes)
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


@app.post('/api/projetos/{id}/cortes/faixa')
def alterar_faixa(id: str, f: Faixa):
    """Cria um corte novo no intervalo (mesmo no meio de um trecho mantido) ou devolve um intervalo ao vídeo."""
    _com_cortes(id, lambda clipes, palavras, fica, _auto, duracao: cortes.alterar_faixa(clipes, palavras, fica, f.inicio, f.fim, f.manter, duracao))
    return {'ok': True}


@app.post('/api/projetos/{id}/clipes/{cid}/ajustar')
def ajustar_clipe(id: str, cid: str, a: Ajuste):
    """Arrastar uma borda de corte: move o início ou o fim de um trecho mantido."""
    _com_cortes(id, lambda clipes, palavras, fica, _auto, duracao: cortes.ajustar_borda(clipes, palavras, fica, cid, a.lado, a.t, duracao))
    return {'ok': True}


@app.post('/api/projetos/{id}/clipes/{cid}/restaurar')
def restaurar(id: str, cid: str):
    _com_cortes(id, lambda clipes, palavras, fica, fica_auto, _d: cortes.restaurar_clipe(clipes, palavras, fica, fica_auto, cid))
    return {'ok': True}


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
