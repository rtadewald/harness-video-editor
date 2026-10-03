"""Processamento automático ao criar o projeto (SPEC §6): proxy → transcrição → silêncios → cortes.
Roda numa fila de uma thread só; o estado de cada passo fica em projeto.json para a interface acompanhar."""
import json
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import cortes, midia, projeto, transcricao

PASSOS = ['proxy', 'silencios', 'transcricao', 'alinhamento', 'cortes']  # pausas antes: a transcrição é feita por pedaços entre elas
_fila = ThreadPoolExecutor(max_workers=1)


def estado_inicial(passos=PASSOS) -> dict:
    return {'passos': {p: {'status': 'pendente'} for p in passos}, 'erro': None}


def enfileirar(id: str, passos: list[str] = PASSOS) -> None:
    def marcar(p):
        p.setdefault('pipeline', estado_inicial())
        p['pipeline']['erro'] = None
        for passo in passos:
            p['pipeline']['passos'][passo] = {'status': 'pendente'}
    projeto.atualizar(id, marcar)
    _fila.submit(_rodar, id, passos)


def retomar_interrompidos() -> None:
    """Se o servidor caiu no meio, recomeça o que ficou pendente ou rodando."""
    for resumo in projeto.listar():
        p = projeto.ler(resumo['id'])
        faltam = [k for k, v in p.get('pipeline', {}).get('passos', {}).items() if v['status'] in ('pendente', 'rodando')]
        if faltam:
            enfileirar(p['id'], faltam)


def _passo(id: str, nome: str, **campos) -> None:
    projeto.atualizar(id, lambda p: p['pipeline']['passos'][nome].update(campos))


def _rodar(id: str, passos: list[str]) -> None:
    """O proxy só serve ao player: roda em paralelo com transcrição → silêncios → cortes."""
    paralelo = threading.Thread(target=_executar, args=(id, ['proxy'])) if 'proxy' in passos else None
    if paralelo:
        paralelo.start()
    _executar(id, [p for p in passos if p != 'proxy'])
    if paralelo:
        paralelo.join()


def _executar(id: str, passos: list[str]) -> None:
    base = projeto.pasta(id)
    p = projeto.ler(id)
    bruto = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    video = base / bruto['arquivo']
    for nome in passos:
        _passo(id, nome, status='rodando')
        t0 = time.perf_counter()
        try:
            extra = PASSO[nome](id, base, video, bruto) or {}
        except Exception as e:
            traceback.print_exc()
            _passo(id, nome, status='erro')
            projeto.atualizar(id, lambda p: p['pipeline'].update(erro=f'{nome}: {e}'))
            return
        _passo(id, nome, status='pronto', segundos=round(time.perf_counter() - t0, 1), **extra)


def _proxy(id, base: Path, video: Path, bruto: dict):
    destino = base / 'midia' / 'proxy' / f'{bruto["id"]}.mp4'
    if bruto.get('proxy') and destino.exists():  # reprocessar não refaz (o player pode estar usando)
        return {'reaproveitado': True}
    ultimo = [0.0]

    def progresso(f):
        if f - ultimo[0] >= 0.05:  # grava no máximo a cada 5%
            ultimo[0] = f
            _passo(id, 'proxy', progresso=round(f, 2))
    midia.proxy(video, destino, bruto['duracao'], progresso)

    def registrar(p):
        next(f for f in p['fontes'] if f['id'] == bruto['id'])['proxy'] = str(destino.relative_to(base))
    projeto.atualizar(id, registrar)


def _silencios(id, base: Path, video: Path, bruto: dict):
    midia.extrair_audio(video, base / 'audio.wav')
    s = midia.silencios(base / 'audio.wav')
    (base / 'silencios.json').write_text(json.dumps({'silencios': s}, indent=1), encoding='utf-8')
    (base / 'picos.json').write_text(json.dumps({'por_segundo': midia.PICOS_POR_SEGUNDO, 'picos': midia.picos(base / 'audio.wav')}), encoding='utf-8')
    return {'silencios': len(s)}


def _transcricao(id, base: Path, video: Path, bruto: dict):
    silencios = json.loads((base / 'silencios.json').read_text())['silencios']
    palavras = transcricao.transcrever(base / 'audio.wav', silencios)
    (base / 'transcricao.json').write_text(json.dumps({'modelo': transcricao.MODELO, 'palavras': palavras}, ensure_ascii=False, indent=1), encoding='utf-8')
    return {'palavras': len(palavras)}


def _alinhamento(id, base: Path, video: Path, bruto: dict):
    arquivo = base / 'transcricao.json'
    dados = json.loads(arquivo.read_text(encoding='utf-8'))
    dados['palavras'], aviso = transcricao.refinar(base / 'audio.wav', dados['palavras'])
    arquivo.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding='utf-8')
    return {'aviso': aviso} if aviso else {}


def _cortes(id, base: Path, video: Path, bruto: dict):
    palavras = json.loads((base / 'transcricao.json').read_text(encoding='utf-8'))['palavras']
    silencios = json.loads((base / 'silencios.json').read_text())['silencios']
    p = projeto.ler(id)
    sel = cortes.selecionar(palavras, silencios, p['briefing']['texto'])
    params = {**cortes.PARAMETROS, **p.get('cortes', {}).get('parametros', {})}
    clipes = cortes.montar_clipes(palavras, cortes.mantidas_por_indice(palavras, sel['mantidas']), silencios,
                                  bruto['duracao'], **params)

    def aplicar(p):
        p['cortes'] = {**sel, 'parametros': params}
        p['timeline']['V1'] = clipes
        p['etapas']['cortes'] = 'pronta'
    projeto.atualizar(id, aplicar)
    return {'clipes': len(clipes)}


PASSO = {'proxy': _proxy, 'silencios': _silencios, 'transcricao': _transcricao, 'alinhamento': _alinhamento, 'cortes': _cortes}
