"""Rotas do áudio (SPEC §8.9; docs/audio.md): as escolhas do projeto (limpeza, timbre, fundo, faders), a limpeza da voz
em segundo plano, a biblioteca de faixas de fundo e os números da cadeia (os mesmos na prévia e no MP4)."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from . import audio, projeto, trilhas
from .rotas_comum import Campos, ler_projeto

rotas = APIRouter()


@rotas.get('/api/audio')
def catalogo():
    """As faixas de fundo e os números da cadeia de áudio (timbres, compressor, fundo, ducking), para a prévia fazer igual."""
    return {
        'trilhas': trilhas.catalogo(),
        'timbres': {k: [{'f': f, 'g': g, 'q': q} for f, g, q in v] for k, v in audio.TIMBRES.items()},
        'passa_altas': audio.PASSA_ALTAS, 'compressor': audio.COMPRESSOR,
        'fundo_db': audio.FUNDO_DB, 'ducking_db': audio.DUCKING_DB, 'subida': audio.SUBIDA, 'descida': audio.DESCIDA,
        'junta': audio.JUNTA, 'fade_fundo': audio.FADE_FUNDO, 'cruza_fundo': audio.CRUZA_FUNDO, 'niveis': [audio.NIVEL_MIN, audio.NIVEL_MAX],
        'lufs': audio.LUFS,
    }


@rotas.get('/api/audio/trilhas/{tid}.m4a')
def arquivo_trilha(tid: str):
    try:
        return FileResponse(trilhas.arquivo(tid), media_type='audio/mp4', headers={'Cache-Control': 'max-age=3600'})
    except FileNotFoundError:
        raise HTTPException(404, 'Faixa não encontrada')


@rotas.get('/api/projetos/{id}/audio')
def do_projeto(id: str):
    """As escolhas de áudio do projeto e onde está a voz limpa da escolha atual (pede a limpeza, se ainda falta; uma que
    falhou fica em `erro` até um PUT com a limpeza)."""
    ler_projeto(id)
    return _resposta(id)


def _lufs(id: str, limpeza: str | None = None) -> float | None:
    try:
        return audio.lufs_da_voz(id, limpeza)
    except (FileNotFoundError, RuntimeError):
        return None


def _resposta(id: str, refazer: bool = False) -> dict:
    """`voz_lufs`: a sonoridade da voz da escolha (o fundo fica abaixo dela), quando ela existe; `bruto_lufs`: a da voz do
    bruto, que a prévia toca enquanto a limpa não fica pronta (ou se ela falhou); `laco`: o trecho da faixa de fundo
    escolhida que se repete (`trilhas.laco`)."""
    voz = audio.pedir_voz(id, refazer)
    e = audio.do_projeto(projeto.ler(id))
    laco = None
    if e['fundo'] and trilhas.existe(e['fundo']):
        ini, fim = trilhas.laco(e['fundo'])
        laco = {'id': e['fundo'], 'ini': ini, 'fim': fim}
    return {'escolhas': e, 'voz': voz, 'voz_lufs': _lufs(id) if voz['estado'] in ('pronta', 'sem') else None, 'bruto_lufs': _lufs(id, 'sem'),
            'trilha_lufs': trilhas.LUFS, 'laco': laco}


@rotas.put('/api/projetos/{id}/audio')
def definir(id: str, c: Campos):
    """Muda as escolhas (os campos que vierem: voz.limpeza, voz.timbre, fundo, fundo_mudo, niveis.<trilha>); uma
    limpeza nova entra na fila, e pedir a mesma limpeza de novo refaz uma que falhou."""
    p = ler_projeto(id)
    try:
        novo = audio.validar(c.campos, audio.do_projeto(p))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    projeto.atualizar(id, lambda x: x.__setitem__('audio', {**(x.get('audio') or {}), **novo}))
    return _resposta(id, refazer='limpeza' in (c.campos.get('voz') or {}))
