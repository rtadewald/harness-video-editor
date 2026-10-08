"""Rotas dos inserts (SPEC §8.3): as mídias de cada plano, a captura de sites, o enriquecimento, o comentário e o banco de mídias."""
import shutil
import tempfile
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import banco, captura_site, inserts
from .rotas_comum import guardar_upload as _guardar
from .rotas_comum import ler_projeto as _ler

rotas = APIRouter()


# ---------------------------------------------------------------- Inserts e banco (SPEC §8.3)

@rotas.get('/api/projetos/{id}/inserts')
def ler_inserts(id: str):
    """Os inserts da versão aberta da direção, com as mídias ligadas (sincroniza: os que não mudaram mantêm as mídias)."""
    _ler(id)
    try:
        return inserts.sincronizar(id)
    except ValueError as e:
        raise HTTPException(409, str(e))


class MidiasInsert(BaseModel):
    midias: list[dict] = Field(max_length=12)


@rotas.put('/api/projetos/{id}/inserts/{pid}/midias')
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


@rotas.post('/api/projetos/{id}/inserts/captura/previa')
def previa_do_site(id: str, c: PreviaSite):
    """A página inteira numa imagem, para marcar as dobras (alguns segundos)."""
    _ler(id)
    try:
        return captura_site.previa(id, c.url, c.proporcao)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(502, f'Não consegui abrir o site: {str(e)[:200]}')


@rotas.get('/api/projetos/{id}/inserts/captura/previa/{cid}')
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


@rotas.post('/api/projetos/{id}/inserts/{pid}/captura')
def capturar_site(id: str, pid: str, c: CapturaSite):
    """Grava as dobras do site em segundo plano; cada uma vira uma mídia do banco ligada ao insert."""
    _ler(id)
    try:
        return captura_site.capturar(id, pid, c.url, c.proporcao, c.dobras, c.titulo, c.duracao)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@rotas.get('/api/inserts/enriquecimento')
def opcoes_de_enriquecimento():
    """O catálogo do enriquecimento (opções por categoria) e o estilo de cada formato de plano."""
    return {'opcoes': inserts.OPCOES_ENRIQUECIMENTO, 'estilo': inserts.ESTILO}


class Enriquecimento(BaseModel):
    campos: dict[str, str | float | list[float] | dict[str, str] | None]


@rotas.put('/api/projetos/{id}/inserts/{pid}/enriquecimento')
def enriquecer_insert(id: str, pid: str, e: Enriquecimento):
    """Muda layout, entrada, combinação, movimento ou saída de um insert (None volta ao estilo)."""
    _ler(id)
    try:
        return inserts.enriquecer(id, pid, e.campos)
    except LookupError as erro:
        raise HTTPException(404, str(erro))
    except ValueError as erro:
        raise HTTPException(422, str(erro))


@rotas.post('/api/projetos/{id}/inserts/{pid}/enriquecimento/tipo')
def enriquecer_tipo(id: str, pid: str):
    """Aplica o enriquecimento deste insert a todos os do mesmo tipo."""
    _ler(id)
    try:
        return inserts.enriquecer_tipo(id, pid)
    except LookupError as erro:
        raise HTTPException(404, str(erro))


class FundoInserts(BaseModel):
    fundo: str = Field(max_length=40)


@rotas.put('/api/projetos/{id}/inserts/fundo')
def definir_fundo(id: str, f: FundoInserts):
    """O fundo atrás dos inserts com moldura, para o vídeo todo."""
    _ler(id)
    try:
        return inserts.definir_fundo(id, f.fundo)
    except ValueError as e:
        raise HTTPException(422, str(e))


class TransicaoInserts(BaseModel):
    transicao: str = Field(max_length=40)


@rotas.put('/api/projetos/{id}/inserts/transicao')
def definir_transicao(id: str, t: TransicaoInserts):
    """A transição em cada troca de plano (seca, zoom com desfoque, piscada), para o vídeo todo."""
    _ler(id)
    try:
        return inserts.definir_transicao(id, t.transicao)
    except ValueError as e:
        raise HTTPException(422, str(e))


class ComentarioIG(BaseModel):
    campos: dict[str, str | float | int | bool | None]


@rotas.put('/api/projetos/{id}/inserts/{pid}/comentario')
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
            novos.append(banco.subir(tmp, a.filename or 'arquivo'))
        except ValueError as e:
            raise HTTPException(422, f'{a.filename}: {e}')
        finally:
            shutil.rmtree(tmp.parent, ignore_errors=True)
    return novos


@rotas.get('/api/banco')
def listar_banco(busca: str = '', tipo: Literal['video', 'imagem'] | None = None):
    return banco.listar_banco(busca, tipo)


@rotas.post('/api/banco')
def subir_no_banco(arquivos: Annotated[list[UploadFile], File()]):
    """Sobe vídeos e imagens para o banco (a descrição por IA roda em segundo plano)."""
    return _subir_no_banco(arquivos)


def _item(bid: str) -> dict:
    try:
        return banco.ler_item(bid)
    except FileNotFoundError:
        raise HTTPException(404, 'Mídia não encontrada')


@rotas.get('/api/banco/{bid}')
def ler_item_banco(bid: str):
    """A mídia, onde é usada e, num vídeo original, os trechos dele (cada um com os seus usos)."""
    item = _item(bid)
    trechos = [] if item.get('pai') else [{**banco.ler_item(t['id']), 'usos': banco.usos(t['id'])} for t in banco.trechos_de(bid)]
    return {**item, 'usos': banco.usos(bid), 'trechos': trechos}


class EdicaoItem(BaseModel):
    nome: str | None = Field(default=None, max_length=200)
    descricao: str | None = Field(default=None, max_length=2000)
    palavras: list[str] | None = Field(default=None, max_length=30)
    inicio: float | None = Field(default=None, ge=0)  # só trechos
    fim: float | None = Field(default=None, ge=0)


@rotas.put('/api/banco/{bid}')
def editar_item_banco(bid: str, e: EdicaoItem):
    _item(bid)
    try:
        return banco.atualizar_item(bid, e.model_dump(exclude_none=True))
    except ValueError as erro:
        raise HTTPException(422, str(erro))


class Faixa(BaseModel):
    inicio: float = Field(ge=0)
    fim: float = Field(gt=0)
    nome: str | None = Field(default=None, max_length=200)


@rotas.post('/api/banco/{bid}/trechos')
def criar_trecho(bid: str, f: Faixa):
    """Um trecho do vídeo (sem arquivo próprio: toca o original)."""
    _item(bid)
    try:
        return banco.criar_trecho(bid, f.inicio, f.fim, f.nome)
    except ValueError as e:
        raise HTTPException(422, str(e))


@rotas.post('/api/banco/{bid}/cortar')
def cortar_original(bid: str, f: Faixa):
    """Corta as pontas do vídeo original (em segundo plano); os trechos acompanham."""
    _item(bid)
    try:
        return banco.cortar_original(bid, f.inicio, f.fim)
    except ValueError as e:
        raise HTTPException(422, str(e))


@rotas.get('/api/banco/{bid}/tira')
def tira_do_banco(bid: str):
    """Tira de quadros do vídeo, para a timeline do editor."""
    item = _item(bid)
    if item['tipo'] != 'video':
        raise HTTPException(422, 'Só vídeos')
    return _no_banco(banco.tira(item))


@rotas.delete('/api/banco/{bid}')
def apagar_item_banco(bid: str):
    """Apaga a mídia e a tira dos inserts que a usavam."""
    _item(bid)
    banco.apagar_item(bid)
    return {'ok': True}


@rotas.post('/api/banco/{bid}/descrever')
def descrever_item_banco(bid: str):
    _item(bid)
    try:
        return banco.pedir_descricao(bid)
    except ValueError as e:
        raise HTTPException(422, str(e))


def _no_banco(arq: Path) -> FileResponse:
    alvo = arq.resolve()
    if not alvo.is_relative_to(banco.RAIZ.resolve()) or not alvo.is_file():
        raise HTTPException(404, 'Arquivo não encontrado')
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})


@rotas.get('/api/banco/{bid}/arquivo')
def arquivo_do_banco(bid: str, qualidade: Literal['previa', 'exportacao'] = 'previa'):
    """O que toca ou aparece: a versão leve do vídeo, ou a imagem original; na exportação, o vídeo em resolução original."""
    item = _item(bid)
    return _no_banco(banco.arquivo_para_exportar(item) if qualidade == 'exportacao' else banco.arquivo_para_tocar(item))


@rotas.get('/api/banco/{bid}/miniatura')
def miniatura_do_banco(bid: str):
    return _no_banco(banco.miniatura(_item(bid)))
