"""Processamento automático ao criar o projeto (SPEC §6): proxy, silêncios, transcrição, alinhamento e cortes; depois,
em segundo plano, os outros motores de transcrição. O estado de cada passo fica em projeto.json para a interface acompanhar."""
import json
import os
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

from . import cortes, midia, motores, projeto, transcricao

PRINCIPAIS = ['proxy', 'silencios', 'transcricao', 'alinhamento', 'cortes']  # pausas antes: a transcrição é feita por pedaços entre elas
PASSOS = [*PRINCIPAIS, 'variantes']
_fila = ThreadPoolExecutor(max_workers=1)  # o que o criador está esperando
_fila_motores = ThreadPoolExecutor(max_workers=1)  # motores extras: não atrasam os cortes
ENV = Path(__file__).resolve().parents[1] / '.env'


def estado_inicial(passos=PASSOS) -> dict:
    return {'passos': {p: {'status': 'pendente'} for p in passos}, 'erro': None}


def enfileirar(id: str, passos: list[str] = PASSOS) -> None:
    def marcar(p):
        p.setdefault('pipeline', estado_inicial())
        p['pipeline']['erro'] = None
        for passo in passos:
            p['pipeline']['passos'][passo] = {'status': 'pendente'}
        if 'transcricao' in passos:  # texto novo: o que foi derivado do anterior perde o sentido
            p['transcricoes'] = projeto.registro_de_motores()
            p['transcricao_ativa'] = p.get('motor_inicial', projeto.LEGADO)
            p.pop('familias', None)
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
    projeto.atualizar(id, lambda p: p['pipeline']['passos'].setdefault(nome, {}).update(campos))


def _variante(id: str, vid: str, **campos) -> None:
    projeto.atualizar(id, lambda p: p['transcricoes'][vid].update(campos))


def _rodar(id: str, passos: list[str]) -> None:
    """O proxy só serve ao player: roda em paralelo com silêncios → transcrição → alinhamento → cortes.
    Os motores extras vão para a outra fila quando o resto termina bem."""
    paralelo = threading.Thread(target=_executar, args=(id, ['proxy'])) if 'proxy' in passos else None
    if paralelo:
        paralelo.start()
    ok = _executar(id, [p for p in passos if p not in ('proxy', 'variantes')])
    if paralelo:
        paralelo.join()
    if ok and 'variantes' in passos:
        _fila_motores.submit(_rodar_motores, id, None)


def enfileirar_motores(id: str, vids: list[str]) -> None:
    """Roda de novo motores específicos (ex.: depois de pôr a chave de API ou de uma falha)."""
    for vid in vids:
        _variante(id, vid, status='pendente', erro=None)
    _fila_motores.submit(_rodar_motores, id, vids)


def _produzir(id: str, vid: str, base: Path, silencios: list[dict]) -> tuple[list[dict], str | None]:
    """Gera as palavras de um motor. Devolve (palavras, aviso)."""
    whisper = None
    if vid != 'whisper' and projeto.MOTORES[vid]['familia'] == 'whisper':  # alinhadores partem do texto do Whisper puro
        if not projeto.arquivo_palavras(base, 'whisper').exists():
            raise RuntimeError('Precisa da transcrição do Whisper (puro) primeiro.')
        whisper = projeto.ler_palavras(id, 'whisper')
    if vid == 'whisper-stable':
        return transcricao.refinar(base / 'audio.wav', whisper)
    return motores.rodar(vid, base / 'audio.wav', whisper, silencios), None


class _SemChave(RuntimeError):
    pass


def _rodar_motor(id: str, vid: str, base: Path) -> None:
    """Roda um motor e grava o resultado; marca o estado dele no projeto. Levanta a exceção se falhar."""
    chave = projeto.MOTORES[vid].get('chave')
    if chave and not os.getenv(chave):
        _variante(id, vid, status='sem_chave', erro=f'Ponha {chave} em backend/.env para usar este motor.')
        raise _SemChave(f'falta {chave} em backend/.env')
    _variante(id, vid, status='rodando', erro=None)
    t0 = time.perf_counter()
    try:
        silencios = json.loads((base / 'silencios.json').read_text())['silencios']
        palavras, aviso = _produzir(id, vid, base, silencios)
        projeto.escrever_palavras(base, vid, palavras)
    except Exception as e:
        _variante(id, vid, status='erro', erro=str(e)[:300])
        raise
    _variante(id, vid, status='pronto', erro=None, aviso=aviso, segundos=round(time.perf_counter() - t0, 1), palavras=len(palavras))


def _rodar_motores(id: str, vids: list[str] | None) -> None:
    """Gera as outras transcrições a partir do áudio. Um motor que falha não derruba os demais."""
    load_dotenv(ENV, override=True)  # pega a chave de API posta no .env sem reiniciar o servidor
    base = projeto.pasta(id)
    forcar = vids is not None
    _passo(id, 'variantes', status='rodando')
    for vid in vids or motores.EXTRAS:
        if projeto.ler(id)['transcricoes'][vid]['status'] == 'pronto' and not forcar:
            continue
        try:
            _rodar_motor(id, vid, base)
        except Exception:
            traceback.print_exc()
    _passo(id, 'variantes', status='pronto')


def _executar(id: str, passos: list[str]) -> bool:
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
            return False
        _passo(id, nome, status='pronto', segundos=round(time.perf_counter() - t0, 1), **extra)
    return True


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
    """Transcreve com o motor escolhido para o projeto. Se ele falhar (sem chave, sem rede…), segue com o Whisper
    + stable-ts em vez de travar, e o motivo fica registrado."""
    load_dotenv(ENV, override=True)
    vid = projeto.ler(id)['transcricao_ativa']
    aviso = None
    if projeto.MOTORES[vid]['familia'] != 'whisper':
        try:
            _rodar_motor(id, vid, base)
            return {'motor': vid, 'palavras': projeto.ler(id)['transcricoes'][vid]['palavras']}
        except Exception as e:
            traceback.print_exc()
            aviso = f'{projeto.MOTORES[vid]["nome"]} não funcionou ({str(e)[:140]}); segui com {projeto.MOTORES[projeto.LEGADO]["nome"]}.'
            projeto.atualizar(id, lambda p: p.update(transcricao_ativa=projeto.LEGADO))
    silencios = json.loads((base / 'silencios.json').read_text())['silencios']
    palavras = transcricao.transcrever(base / 'audio.wav', silencios)
    projeto.escrever_palavras(base, 'whisper', palavras)
    _variante(id, 'whisper', status='pronto', segundos=0, palavras=len(palavras))
    return {'palavras': len(palavras), **({'aviso': aviso} if aviso else {})}


def _alinhamento(id, base: Path, video: Path, bruto: dict):
    """Só se aplica quando o motor ativo é um alinhador do Whisper (stable-ts, Qwen3, CTC)."""
    vid = projeto.ler(id)['transcricao_ativa']
    if projeto.MOTORES[vid]['familia'] != 'whisper' or vid == 'whisper':
        return {'pulado': True}
    _rodar_motor(id, vid, base)
    aviso = projeto.ler(id)['transcricoes'][vid].get('aviso')
    return {'aviso': aviso} if aviso else {}


def _cortes(id, base: Path, video: Path, bruto: dict):
    palavras = projeto.ler_palavras(id)  # as da transcrição ativa
    silencios = json.loads((base / 'silencios.json').read_text())['silencios']
    p = projeto.ler(id)
    sel = cortes.selecionar(palavras, silencios, p['briefing']['texto'])
    params = cortes.parametros(projeto.ler_config())  # as margens vigentes em Configurações
    clipes = cortes.montar_clipes(palavras, cortes.mantidas_por_indice(palavras, sel['mantidas']), silencios,
                                  bruto['duracao'], **params)

    def aplicar(p):
        p['cortes'] = {**sel, 'parametros': params}
        p['timeline']['V1'] = clipes
        p['etapas']['cortes'] = 'pronta'
    projeto.atualizar(id, aplicar)
    return {'clipes': len(clipes)}


PASSO = {'proxy': _proxy, 'silencios': _silencios, 'transcricao': _transcricao, 'alinhamento': _alinhamento, 'cortes': _cortes}
