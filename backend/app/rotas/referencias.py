"""Rotas das referências (SPEC §8.2.1): a biblioteca de vídeos de referência, a análise, a revisão e a heurística da direção."""
import json
import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import (
    calibragem,
    direcao,
    midia,
    referencias,
)
from .comum import extensao_do_upload as _extensao
from .comum import guardar_upload as _guardar

rotas = APIRouter()


def _ler_referencia(id: str) -> dict:
    try:
        return referencias.ler(id)
    except FileNotFoundError:
        raise HTTPException(404, 'Referência não encontrada')


@rotas.get('/api/referencias')
def listar_referencias():
    return referencias.listar()


@rotas.post('/api/referencias')
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


@rotas.get('/api/referencias/clipes')
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


@rotas.put('/api/referencias/{id}/favorito')
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


@rotas.get('/api/referencias/{id}/roteiro')
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


@rotas.get('/api/referencias/heuristica')
def ler_heuristica():
    """As regras (Markdown editável) e os roteiros de exemplo (montados da análise)."""
    return _heuristica()


class RegrasHeuristica(BaseModel):
    regras: str = Field(max_length=20000)


@rotas.put('/api/referencias/heuristica')
def salvar_heuristica(h: RegrasHeuristica):
    calibragem.salvar_heuristica({**calibragem.ler_heuristica(), 'regras': h.regras})
    return _heuristica()


@rotas.post('/api/referencias/heuristica/sugerir')
def sugerir_regras():
    """A IA lê os roteiros e refaz a seção "Regras sugeridas pela IA"; as regras do criador ficam como estão."""
    try:
        calibragem.sugerir_regras()
    except ValueError as e:
        raise HTTPException(409, str(e))
    return _heuristica()


@rotas.post('/api/referencias/heuristica/voltar')
def voltar_heuristica():
    """Desfaz a última sugestão: volta para as regras de antes."""
    h = calibragem.ler_heuristica()
    if not h.get('anterior'):
        raise HTTPException(409, 'Não há versão anterior')
    calibragem.salvar_heuristica({**h, 'regras': h['anterior'], 'anterior': h['regras']})
    return _heuristica()


@rotas.get('/api/referencias/{id}')
def abrir_referencia(id: str):
    return _ler_referencia(id)


@rotas.post('/api/referencias/{id}/analisar')
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


@rotas.get('/api/referencias/{id}/revisao')
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


@rotas.put('/api/referencias/{id}/direcao')
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


@rotas.put('/api/referencias/{id}/status')
def marcar_revisada(id: str, s: StatusRevisao):
    r = _ler_referencia(id)
    if r['status'] not in ('a_revisar', 'revisado'):
        raise HTTPException(409, 'A análise ainda não terminou')
    return referencias.atualizar(id, lambda x: x.update(status='revisado' if s.revisado else 'a_revisar'))


class NomeReferencia(BaseModel):
    nome: str = Field(min_length=1, max_length=120)


@rotas.put('/api/referencias/{id}/nome')
def renomear_referencia(id: str, n: NomeReferencia):
    """Renomeia o vídeo da Calibragem (o nome aparece nos roteiros de exemplo e nas Referências)."""
    _ler_referencia(id)
    nome = n.nome.strip()
    if not nome:
        raise HTTPException(422, 'Nome vazio')
    return referencias.atualizar(id, lambda r: r.update(nome=nome))


@rotas.delete('/api/referencias/{id}')
def apagar_referencia(id: str):
    _ler_referencia(id)
    referencias.apagar(id)
    return {'ok': True}


@rotas.get('/api/referencias/{id}/arquivos/{caminho:path}')
def arquivo_referencia(id: str, caminho: str):
    _ler_referencia(id)
    base = referencias.pasta(id)
    alvo = (base / caminho).resolve()
    if not alvo.is_relative_to(base) or not alvo.is_file() or alvo.name == 'referencia.json':
        raise HTTPException(404, 'Arquivo não encontrado')
    # o original pode ser cortado (e a versão leve, a miniatura e a tira refeitas) no mesmo endereço: o navegador confere sempre
    return FileResponse(alvo, headers={'Cache-Control': 'no-cache'})
