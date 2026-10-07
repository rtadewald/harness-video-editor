"""API do Harness Video Editor."""
import json
import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import calibragem, captura_site, comum, cortes, direcao, direcao_projeto, inserts, midia, mocks, motores, pipeline, projeto, referencias

comum.carregar_env()


@asynccontextmanager
async def ciclo(_app):
    pipeline.retomar_interrompidos()
    direcao.retomar_interrompidas()
    direcao_projeto.retomar_interrompidas()
    inserts.retomar_interrompidos()
    inserts.atualizar_proxies()
    captura_site.retomar_interrompidas()
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
    for r in criadas:
        direcao.enfileirar(r['id'])
    return {'criadas': [referencias.ler(r['id']) for r in criadas], 'recusadas': recusadas}


@app.get('/api/referencias/clipes')
def clipes_referencias():
    """Todos os planos-base das referências já analisadas, para a galeria de Referências: cada um com os seus dados
    (posição, como entra na fala, vizinhos, elementos) e, por vídeo de origem, um resumo com todos os planos."""
    todos, origens = [], {}
    for r in referencias.listar():
        if r['status'] not in ('a_revisar', 'revisado'):
            continue
        base = referencias.pasta(r['id'])
        try:
            itens = json.loads((base / 'direcao.json').read_text())['itens']
            palavras = json.loads((base / 'palavras.json').read_text())['palavras']
        except FileNotFoundError:
            continue
        lista, origens[r['id']] = direcao.clipes(r, itens, palavras)
        todos += lista
    favoritos = referencias.ler_favoritos()
    for c in todos:
        c['favorito'] = any(referencias.mesmo_trecho(f, c['ref'], c['inicio'], c['fim']) for f in favoritos)
    return {'clipes': todos, 'origens': origens, 'categorias': direcao.PLANOS, 'elementos': direcao.ELEMENTOS}


class Favorito(BaseModel):
    inicio: float
    fim: float
    favorito: bool


@app.put('/api/referencias/{id}/favorito')
def favoritar(id: str, f: Favorito):
    """Marca ou desmarca um trecho como favorito (preferência para guiar as IAs depois)."""
    _ler_referencia(id)
    base = referencias.pasta(id)
    itens = json.loads((base / 'direcao.json').read_text())['itens'] if (base / 'direcao.json').exists() else []
    plano = next((i for i in itens if i['camada'] == 'plano' and abs(i['inicio'] - f.inicio) < 0.05 and abs(i['fim'] - f.fim) < 0.05), None)
    if f.favorito and plano is None:
        raise HTTPException(404, 'Trecho não encontrado nesta referência')
    dados = {k: plano.get(k) for k in ('tipo', 'conteudo', 'descricao', 'texto')} if plano else {}
    referencias.marcar_favorito(id, f.inicio, f.fim, f.favorito, dados)
    return {'favorito': f.favorito}


@app.get('/api/referencias/{id}/roteiro')
def roteiro_referencia(id: str):
    """O roteiro dirigido de um vídeo da Calibragem: uma linha por corte de cena, com a marcação e a fala."""
    r = _ler_referencia(id)
    lista = calibragem.videos_da_calibragem(ref=id)
    if not lista:
        raise HTTPException(409, 'A análise ainda não terminou')
    return {'referencia': r, 'linhas': calibragem.roteiro(*lista[0])}


def _heuristica() -> dict:
    h = calibragem.ler_heuristica()
    return {'regras': h['regras'], 'gerado_em': h.get('gerado_em'), 'videos': h.get('videos'), 'tem_anterior': bool(h.get('anterior')),
            'roteiros': calibragem.roteiros()}


@app.get('/api/referencias/heuristica')
def ler_heuristica():
    """As regras (Markdown editável) e os roteiros de exemplo (montados da análise)."""
    return _heuristica()


class RegrasHeuristica(BaseModel):
    regras: str = Field(max_length=20000)


@app.put('/api/referencias/heuristica')
def salvar_heuristica(h: RegrasHeuristica):
    calibragem.salvar_heuristica({**calibragem.ler_heuristica(), 'regras': h.regras})
    return _heuristica()


@app.post('/api/referencias/heuristica/sugerir')
def sugerir_regras():
    """A IA lê os roteiros e refaz a seção "Regras sugeridas pela IA"; as regras do criador ficam como estão."""
    try:
        calibragem.sugerir_regras()
    except ValueError as e:
        raise HTTPException(409, str(e))
    return _heuristica()


@app.post('/api/referencias/heuristica/voltar')
def voltar_heuristica():
    """Desfaz a última sugestão: volta para as regras de antes."""
    h = calibragem.ler_heuristica()
    if not h.get('anterior'):
        raise HTTPException(409, 'Não há versão anterior')
    calibragem.salvar_heuristica({**h, 'regras': h['anterior'], 'anterior': h['regras']})
    return _heuristica()


@app.get('/api/referencias/{id}')
def abrir_referencia(id: str):
    return _ler_referencia(id)


@app.post('/api/referencias/{id}/analisar')
def reanalisar_referencia(id: str, refazer: bool = False):
    """Põe a referência de novo na fila. Por padrão reaproveita o que já foi feito (proxy, transcrição, trechos já
    analisados com o mesmo modelo); `refazer` apaga a análise da LLM e a revisão e pede tudo de novo."""
    r = _ler_referencia(id)
    if r['status'] in ('na_fila', 'analisando'):
        raise HTTPException(409, 'Essa referência já está na fila')
    if refazer:
        referencias.atualizar(id, lambda x: x.update(status='na_fila'))  # sai de "revisado": a revisão vai ser refeita
        base = referencias.pasta(id)
        shutil.rmtree(base / 'trechos', ignore_errors=True)
        if (base / 'direcao.json').exists():  # a análise anterior fica guardada para comparar
            (base / 'direcao.json').replace(base / 'direcao.anterior.json')
        for nome in ('analise.json', 'cenas.json'):
            (base / nome).unlink(missing_ok=True)
    direcao.enfileirar(id)
    return referencias.ler(id)


@app.get('/api/referencias/{id}/revisao')
def revisao_referencia(id: str):
    r = _ler_referencia(id)
    base = referencias.pasta(id)
    if not (base / 'direcao.json').exists():
        raise HTTPException(409, 'A análise ainda não terminou')
    dados = json.loads((base / 'direcao.json').read_text())
    return {'referencia': r, 'palavras': json.loads((base / 'palavras.json').read_text())['palavras'],
            'itens': dados['itens'], 'cortes': dados['cortes'], 'categorias': {'planos': direcao.PLANOS, 'elementos': direcao.ELEMENTOS}}


class EdicaoDirecao(BaseModel):
    itens: list[dict]


@app.put('/api/referencias/{id}/direcao')
def salvar_direcao(id: str, e: EdicaoDirecao):
    r = _ler_referencia(id)
    if r['status'] not in ('a_revisar', 'revisado'):
        raise HTTPException(409, 'A análise ainda não terminou')
    try:
        dados = direcao.salvar_edicao(id, e.itens)
    except ValueError as erro:
        raise HTTPException(422, str(erro))
    return {'itens': dados['itens']}


class StatusRevisao(BaseModel):
    revisado: bool


@app.put('/api/referencias/{id}/status')
def marcar_revisada(id: str, s: StatusRevisao):
    r = _ler_referencia(id)
    if r['status'] not in ('a_revisar', 'revisado'):
        raise HTTPException(409, 'A análise ainda não terminou')
    return referencias.atualizar(id, lambda x: x.update(status='revisado' if s.revisado else 'a_revisar'))


class NomeReferencia(BaseModel):
    nome: str = Field(min_length=1, max_length=120)


@app.put('/api/referencias/{id}/nome')
def renomear_referencia(id: str, n: NomeReferencia):
    """Renomeia o vídeo da Calibragem (o nome aparece nos roteiros de exemplo e nas Referências)."""
    _ler_referencia(id)
    nome = n.nome.strip()
    if not nome:
        raise HTTPException(422, 'Nome vazio')
    return referencias.atualizar(id, lambda r: r.update(nome=nome))


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
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})


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
        return {'projeto': p, 'palavras': [], 'timeline': {'V1': [], 'V2': [], 'V3': [], 'LEG': []}, 'duvidas': []}
    palavras = projeto.ler_palavras(id)
    for w, fica in zip(palavras, cortes.mantidas_por_indice(palavras, p['cortes']['mantidas'])):
        w['mantida'] = fica
    silencios = json.loads((projeto.pasta(id) / 'silencios.json').read_text())['silencios']
    return {'projeto': p, 'palavras': palavras, 'silencios': silencios, 'duvidas': p['cortes']['duvidas'],
            'timeline': {'V1': p['timeline']['V1'], **mocks.trilhas(palavras, p)}}


@app.post('/api/projetos/{id}/direcao/gerar')
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


@app.post('/api/projetos/{id}/direcao/corrigir')
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


@app.put('/api/projetos/{id}/direcao/versao')
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


@app.post('/api/projetos/{id}/direcao/comentarios')
def comentar_direcao(id: str, c: Comentario):
    if c.palavra not in {w['id'] for w in projeto.ler_palavras(id)}:
        raise HTTPException(422, 'Comentário preso a uma palavra que não existe')
    novo = {'id': uuid.uuid4().hex[:8], 'palavra': c.palavra, 'off': round(c.off, 3), 'texto': c.texto.strip(),
            'criado_em': datetime.now().isoformat(timespec='seconds')}
    return _na_versao_aberta(id, lambda cs: [*cs, novo])


@app.put('/api/projetos/{id}/direcao/comentarios/{cid}')
def editar_comentario_direcao(id: str, cid: str, c: TextoComentario):
    def mudar(cs):
        if not any(x['id'] == cid for x in cs):
            raise LookupError('Comentário não encontrado')
        return [{**x, 'texto': c.texto.strip()} if x['id'] == cid else x for x in cs]
    return _na_versao_aberta(id, mudar)


@app.delete('/api/projetos/{id}/direcao/comentarios/{cid}')
def excluir_comentario_direcao(id: str, cid: str):
    return _na_versao_aberta(id, lambda cs: [x for x in cs if x['id'] != cid])


@app.get('/api/projetos/{id}/direcao/registro')
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


@app.put('/api/projetos/{id}/direcao')
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


class Mensagem(BaseModel):
    texto: str


@app.post('/api/projetos/{id}/chat/{etapa}')
def conversar(id: str, etapa: str, msg: Mensagem):
    """Agente fictício: guarda a mensagem do criador e uma resposta pronta da etapa."""
    _ler(id)
    if etapa not in projeto.ETAPAS:
        raise HTTPException(404, 'Etapa não existe')
    if not msg.texto.strip():
        raise HTTPException(422, 'Mensagem vazia')
    novas = [mocks.mensagem('criador', msg.texto.strip()), mocks.responder(etapa)]
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
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})


# ---------------------------------------------------------------- Inserts e banco (SPEC §8.3)

@app.get('/api/projetos/{id}/inserts')
def ler_inserts(id: str):
    """Os inserts da versão aberta da direção, com as mídias ligadas (sincroniza: os que não mudaram mantêm as mídias)."""
    _ler(id)
    try:
        return inserts.sincronizar(id)
    except ValueError as e:
        raise HTTPException(409, str(e))


class MidiasInsert(BaseModel):
    midias: list[dict] = Field(max_length=12)


@app.put('/api/projetos/{id}/inserts/{pid}/midias')
def definir_midias(id: str, pid: str, m: MidiasInsert):
    """A lista de mídias de um insert, em ordem (item do banco e início no vídeo)."""
    _ler(id)
    try:
        return inserts.definir_midias(id, pid, m.midias)
    except LookupError as e:
        raise HTTPException(404, str(e))


class PreviaSite(BaseModel):
    url: str = Field(max_length=2000)
    proporcao: Literal['16:9', '4:3', '1:1', '9:16']


@app.post('/api/projetos/{id}/inserts/captura/previa')
def previa_do_site(id: str, c: PreviaSite):
    """A página inteira numa imagem, para marcar as dobras (alguns segundos)."""
    _ler(id)
    try:
        return captura_site.previa(id, c.url, c.proporcao)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f'Não consegui abrir o site: {str(e)[:200]}')


@app.get('/api/projetos/{id}/inserts/captura/previa/{cid}')
def imagem_da_previa(id: str, cid: str):
    _ler(id)
    arq = captura_site.arquivo_previa(id, cid)
    if not cid.isalnum() or not arq.exists():
        raise HTTPException(404, 'Prévia não encontrada')
    return FileResponse(arq)


class CapturaSite(PreviaSite):
    dobras: list[float] = Field(min_length=1, max_length=captura_site.MAX_DOBRAS)
    titulo: str | None = Field(default=None, max_length=200)
    duracao: float = Field(default=captura_site.DURACAO_PADRAO, ge=1, le=30)  # s por dobra


@app.post('/api/projetos/{id}/inserts/{pid}/captura')
def capturar_site(id: str, pid: str, c: CapturaSite):
    """Grava as dobras do site em segundo plano; cada uma vira uma mídia do banco ligada ao insert."""
    _ler(id)
    try:
        return captura_site.capturar(id, pid, c.url, c.proporcao, c.dobras, c.titulo, c.duracao)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.get('/api/inserts/enriquecimento')
def opcoes_de_enriquecimento():
    """O catálogo do enriquecimento (opções por categoria) e o estilo de cada formato de plano."""
    return {'opcoes': inserts.OPCOES_ENRIQUECIMENTO, 'estilo': inserts.ESTILO}


class Enriquecimento(BaseModel):
    campos: dict[str, str | float | list[float] | None]


@app.put('/api/projetos/{id}/inserts/{pid}/enriquecimento')
def enriquecer_insert(id: str, pid: str, e: Enriquecimento):
    """Muda layout, entrada, combinação, movimento ou saída de um insert (None volta ao estilo)."""
    _ler(id)
    try:
        return inserts.enriquecer(id, pid, e.campos)
    except LookupError as erro:
        raise HTTPException(404, str(erro))
    except ValueError as erro:
        raise HTTPException(422, str(erro))


@app.post('/api/projetos/{id}/inserts/{pid}/enriquecimento/tipo')
def enriquecer_tipo(id: str, pid: str):
    """Aplica o enriquecimento deste insert a todos os do mesmo tipo."""
    _ler(id)
    try:
        return inserts.enriquecer_tipo(id, pid)
    except LookupError as erro:
        raise HTTPException(404, str(erro))


class FundoInserts(BaseModel):
    fundo: str = Field(max_length=40)


@app.put('/api/projetos/{id}/inserts/fundo')
def definir_fundo(id: str, f: FundoInserts):
    """O fundo atrás dos inserts com moldura, para o vídeo todo."""
    _ler(id)
    try:
        return inserts.definir_fundo(id, f.fundo)
    except ValueError as e:
        raise HTTPException(422, str(e))


class TransicaoInserts(BaseModel):
    transicao: str = Field(max_length=40)


@app.put('/api/projetos/{id}/inserts/transicao')
def definir_transicao(id: str, t: TransicaoInserts):
    """A transição em cada troca de plano (seca, zoom com desfoque, piscada), para o vídeo todo."""
    _ler(id)
    try:
        return inserts.definir_transicao(id, t.transicao)
    except ValueError as e:
        raise HTTPException(422, str(e))


class CurvaPadrao(BaseModel):
    curva: list[float] | None = None
    duracao: float | None = None  # s


@app.put('/api/projetos/{id}/inserts/curva-padrao')
def definir_curva_padrao(id: str, c: CurvaPadrao):
    """A curva e a duração da entrada padrão do vídeo (para os inserts sem curva própria)."""
    _ler(id)
    try:
        return inserts.definir_curva_padrao(id, c.curva, c.duracao)
    except ValueError as e:
        raise HTTPException(422, str(e))


class ComentarioIG(BaseModel):
    campos: dict[str, str | float | int | bool | None]


@app.put('/api/projetos/{id}/inserts/{pid}/comentario')
def configurar_comentario(id: str, pid: str, c: ComentarioIG):
    """O card de comentário (texto, foto, usuário, tempo, "Ver tradução", posição e tamanho); None volta ao padrão."""
    _ler(id)
    try:
        return inserts.configurar_comentario(id, pid, c.campos)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


def _subir_no_banco(arquivos: list[UploadFile]) -> list[dict]:
    novos = []
    for a in arquivos:
        tmp = Path(tempfile.mkdtemp()) / 'arquivo'
        _guardar(a, tmp)
        try:
            novos.append(inserts.subir(tmp, a.filename or 'arquivo'))
        except ValueError as e:
            raise HTTPException(422, f'{a.filename}: {e}')
        finally:
            shutil.rmtree(tmp.parent, ignore_errors=True)
    return novos


@app.get('/api/banco')
def listar_banco(busca: str = '', tipo: Literal['video', 'imagem'] | None = None):
    return inserts.listar_banco(busca, tipo)


@app.post('/api/banco')
def subir_no_banco(arquivos: Annotated[list[UploadFile], File()]):
    """Sobe vídeos e imagens para o banco (a descrição por IA roda em segundo plano)."""
    return _subir_no_banco(arquivos)


def _item(bid: str) -> dict:
    try:
        return inserts.ler_item(bid)
    except FileNotFoundError:
        raise HTTPException(404, 'Mídia não encontrada')


@app.get('/api/banco/{bid}')
def ler_item_banco(bid: str):
    """A mídia, onde é usada e, num vídeo original, os trechos dele (cada um com os seus usos)."""
    item = _item(bid)
    trechos = [] if item.get('pai') else [{**inserts.ler_item(t['id']), 'usos': inserts.usos(t['id'])} for t in inserts.trechos_de(bid)]
    return {**item, 'usos': inserts.usos(bid), 'trechos': trechos}


class EdicaoItem(BaseModel):
    nome: str | None = Field(default=None, max_length=200)
    descricao: str | None = Field(default=None, max_length=2000)
    palavras: list[str] | None = Field(default=None, max_length=30)
    inicio: float | None = Field(default=None, ge=0)  # só trechos
    fim: float | None = Field(default=None, ge=0)


@app.put('/api/banco/{bid}')
def editar_item_banco(bid: str, e: EdicaoItem):
    _item(bid)
    try:
        return inserts.atualizar_item(bid, e.model_dump(exclude_none=True))
    except ValueError as erro:
        raise HTTPException(422, str(erro))


class Faixa(BaseModel):
    inicio: float = Field(ge=0)
    fim: float = Field(gt=0)
    nome: str | None = Field(default=None, max_length=200)


@app.post('/api/banco/{bid}/trechos')
def criar_trecho(bid: str, f: Faixa):
    """Um trecho do vídeo (sem arquivo próprio: toca o original)."""
    _item(bid)
    try:
        return inserts.criar_trecho(bid, f.inicio, f.fim, f.nome)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post('/api/banco/{bid}/cortar')
def cortar_original(bid: str, f: Faixa):
    """Corta as pontas do vídeo original (em segundo plano); os trechos acompanham."""
    _item(bid)
    try:
        return inserts.cortar_original(bid, f.inicio, f.fim)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.get('/api/banco/{bid}/tira')
def tira_do_banco(bid: str):
    """Tira de quadros do vídeo, para a timeline do editor."""
    item = _item(bid)
    if item['tipo'] != 'video':
        raise HTTPException(422, 'Só vídeos')
    return _no_banco(inserts.tira(item))


@app.delete('/api/banco/{bid}')
def apagar_item_banco(bid: str):
    """Apaga a mídia e a tira dos inserts que a usavam."""
    _item(bid)
    inserts.apagar_item(bid)
    return {'ok': True}


@app.post('/api/banco/{bid}/descrever')
def descrever_item_banco(bid: str):
    _item(bid)
    try:
        return inserts.pedir_descricao(bid)
    except ValueError as e:
        raise HTTPException(422, str(e))


def _no_banco(arq: Path) -> FileResponse:
    alvo = arq.resolve()
    if not alvo.is_relative_to(inserts.RAIZ_BANCO.resolve()) or not alvo.is_file():
        raise HTTPException(404, 'Arquivo não encontrado')
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})


@app.get('/api/banco/{bid}/arquivo')
def arquivo_do_banco(bid: str):
    """O que toca ou aparece: a versão leve do vídeo, ou a imagem original."""
    return _no_banco(inserts.arquivo_para_tocar(_item(bid)))


@app.get('/api/banco/{bid}/miniatura')
def miniatura_do_banco(bid: str):
    return _no_banco(inserts.miniatura(_item(bid)))
