"""Processamento automático ao criar o projeto (SPEC §6): proxy, silêncios, transcrição, alinhamento e cortes; depois,
em segundo plano, os outros motores de transcrição. O estado de cada passo fica em projeto.json para a interface acompanhar."""
import json
import os
import subprocess
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import comum, cortes, midia, motores, projeto, transcricao

PRINCIPAIS = ['enquadramento', 'proxy', 'silencios', 'transcricao', 'alinhamento', 'cortes']  # pausas antes: a transcrição é feita por pedaços entre elas
PASSOS = [*PRINCIPAIS, 'variantes']
# o que a tela diz quando um passo para por um erro que não é do ffmpeg (SPEC §4, "erro legível"); o detalhe vai junto, curto
FALHA = {
    'enquadramento': 'Não consegui enquadrar o vídeo em 9:16',
    'proxy': 'Não consegui preparar o vídeo para o player',
    'silencios': 'Não consegui medir as pausas do áudio',
    'transcricao': 'Não consegui transcrever o áudio',
    'alinhamento': 'Não consegui ajustar o tempo de cada palavra ao áudio',
    'cortes': 'A IA não conseguiu escolher o texto final',
}
_fila = ThreadPoolExecutor(max_workers=1)  # o que o criador está esperando
_fila_motores = ThreadPoolExecutor(max_workers=1)  # motores extras: não atrasam os cortes


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
    # um vídeo 16:9 vira o bruto 9:16 antes de tudo (o resto parte dele); num vertical, o passo não faz nada
    if 'enquadramento' in passos and not _executar(id, ['enquadramento']):
        return
    paralelo = threading.Thread(target=_executar, args=(id, ['proxy'])) if 'proxy' in passos else None
    if paralelo:
        paralelo.start()
    ok = _executar(id, [p for p in passos if p not in ('enquadramento', 'proxy', 'variantes')])
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
    comum.carregar_env()  # pega a chave de API posta no .env sem reiniciar o servidor
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
            msg = _mensagem(nome, e, base)  # o passo que parou já aparece marcado na tela; a mensagem, sem linha de comando
            projeto.atualizar(id, lambda p: p['pipeline'].update(erro=msg))
            return False
        _passo(id, nome, status='pronto', segundos=round(time.perf_counter() - t0, 1), **extra)
    return True


class SemFala(RuntimeError):
    """A transcrição não achou nenhuma palavra: parar antes do alinhamento e da IA dos cortes (que seria paga à toa)."""


def _mensagem(nome: str, e: Exception, base: Path) -> str:
    """O erro de um passo para a tela: o do ffmpeg/ffprobe e o já escrito para gente passam como estão; o de uma
    biblioteca (em inglês, com o caminho do servidor) vira a frase do passo, com o detalhe curto e sem os caminhos.
    O traceback completo fica no log."""
    if isinstance(e, (midia.ErroMidia, SemFala, subprocess.CalledProcessError)):
        return midia.legivel(e)
    detalhe = ' '.join(str(e).replace(f'{base}/', '').replace(str(projeto.RAIZ.parent) + '/', '').split()).rstrip('.')
    detalhe = detalhe[:160] + ('…' if len(detalhe) > 160 else '')
    return f'{FALHA.get(nome, "Este passo falhou")}' + (f' ({detalhe}).' if detalhe else '.')


def refazer_proxy(id: str) -> bool:
    """Refaz só o proxy (depois de um Reenquadrar), no mesmo estado do pipeline que a tela acompanha."""
    projeto.atualizar(id, lambda p: p.setdefault('pipeline', estado_inicial())['passos'].update(proxy={'status': 'pendente'}))
    return _executar(id, ['proxy'])


def _enquadramento(id, base: Path, video: Path, bruto: dict):
    """Um bruto 16:9 vira 9:16 seguindo o rosto (docs/preprocessamento.md); um vertical passa direto."""
    from . import enquadramento
    ultimo = [0.0]

    def progresso(f):
        if f - ultimo[0] >= 0.05:
            ultimo[0] = f
            _passo(id, 'enquadramento', progresso=round(f, 2))
    return enquadramento.aplicar(id, progresso)


def _proxy(id, base: Path, video: Path, bruto: dict):
    destino = base / 'midia' / 'proxy' / f'{bruto["id"]}.mp4'
    if bruto.get('proxy') and destino.exists():  # reprocessar não refaz (o player pode estar usando)
        return {'reaproveitado': True}
    ultimo = [0.0]

    def progresso(f):
        if f - ultimo[0] >= 0.05:  # grava no máximo a cada 5%
            ultimo[0] = f
            _passo(id, 'proxy', progresso=round(f, 2))
    # num arquivo à parte e trocado no fim: um proxy refeito (Reenquadrar) não some do player enquanto é gerado
    tmp = destino.with_name(destino.stem + '.parte.mp4')
    try:
        midia.proxy(video, tmp, bruto['duracao'], progresso)
        tmp.replace(destino)
    finally:
        tmp.unlink(missing_ok=True)

    def registrar(p):
        next(f for f in p['fontes'] if f['id'] == bruto['id'])['proxy'] = str(destino.relative_to(base))
    projeto.atualizar(id, registrar)
    if bruto.get('papel') == 'bruto':  # o recorte e o rosto do ator (divisão da tela) saem do proxy, em segundo plano
        from . import recorte_ator, rosto
        recorte_ator.pedir(id)
        rosto.pedir(id)


def _silencios(id, base: Path, video: Path, bruto: dict):
    if bruto.get('tem_audio') is False:  # projetos de antes da recusa na criação
        raise midia.ErroMidia('Este vídeo não tem áudio: o editor precisa da fala para transcrever e cortar.')
    midia.extrair_audio(video, base / 'audio.wav')
    s = midia.silencios(base / 'audio.wav')
    comum.salvar_json((base / 'silencios.json'), {'silencios': s})
    comum.salvar_json((base / 'picos.json'), {'por_segundo': midia.PICOS_POR_SEGUNDO, 'picos': midia.picos(base / 'audio.wav')}, indent=None)
    return {'silencios': len(s)}


def _transcricao(id, base: Path, video: Path, bruto: dict):
    """Transcreve com o motor escolhido para o projeto. Se ele falhar (sem chave, sem rede…), segue com o Whisper
    + stable-ts em vez de travar, e o motivo fica registrado."""
    comum.carregar_env()
    vid = projeto.ler(id)['transcricao_ativa']
    aviso = None
    if projeto.MOTORES[vid]['familia'] != 'whisper':
        try:
            _rodar_motor(id, vid, base)
            n = projeto.ler(id)['transcricoes'][vid]['palavras']
        except Exception as e:
            traceback.print_exc()
            aviso = f'{projeto.MOTORES[vid]["nome"]} não funcionou ({str(e)[:140]}); segui com {projeto.MOTORES[projeto.LEGADO]["nome"]}.'
            projeto.atualizar(id, lambda p: p.update(transcricao_ativa=projeto.LEGADO))
        else:
            _exigir_fala(n)
            return {'motor': vid, 'palavras': n}
    silencios = json.loads((base / 'silencios.json').read_text())['silencios']
    palavras = transcricao.transcrever(base / 'audio.wav', silencios)
    projeto.escrever_palavras(base, 'whisper', palavras)
    _variante(id, 'whisper', status='pronto', segundos=0, palavras=len(palavras))
    _exigir_fala(len(palavras))
    return {'palavras': len(palavras), **({'aviso': aviso} if aviso else {})}


def _exigir_fala(n: int) -> None:
    if not n:
        raise SemFala('Não encontrei fala neste vídeo: a transcrição não achou nenhuma palavra. O editor precisa da fala para cortar.')


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


PASSO = {'enquadramento': _enquadramento, 'proxy': _proxy, 'silencios': _silencios, 'transcricao': _transcricao, 'alinhamento': _alinhamento, 'cortes': _cortes}
