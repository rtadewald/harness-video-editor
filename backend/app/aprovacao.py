"""A aprovação de uma versão (docs/editor-claude.md §7, E9): conferir que o estado de agora é o da versão aprovada (o 4K
sai do estado de agora) e fazer do projeto uma referência da Calibragem.

Referência de um projeto (porte do `calibragem.de_projeto` do 19): `prj-<projeto>-vN`, sem análise do Gemini — o vídeo é
o MP4 exportado (reduzido a 720 px), as palavras e a direção já no tempo do vídeo final (`itens`), a direção da v1 para
comparar (`itens_ia`) e os comentários de todas as revisões. Fica "a revisar": só ensina a Direção visual depois que
Rodrigo a marca revisada na Calibragem. Refazer substitui."""
import shutil
from datetime import datetime

from . import codigos, comum, direcao, direcao_projeto, exportacao, midia, projeto, referencias, revisoes, versoes


def difere(id: str, n: int) -> list[str]:
    """As partes do projeto (`versoes.CAMPOS`) que mudaram desde a versão `n`: vazio, o estado de agora é o dela."""
    estado = versoes.ler(id, n).get('estado') or {}
    p = projeto.ler(id)
    return [k for k in versoes.CAMPOS if p.get(k) != estado.get(k)]


def no_tempo_da_saida(itens: list[dict], saida: list[dict], duracao: float) -> list[dict]:
    """Os itens da direção (presos a palavras + deslocamento) no tempo do vídeo final; a âncora cortada vira a primeira
    (ou a última) palavra que sobrou no intervalo; sem nenhuma, o item sai. Planos contíguos."""
    tempo = {w['id']: w for w in saida}
    vistos = []
    for i in itens:
        a = i.get('palavra_ini')
        b = i.get('palavra_fim') or a
        dentro = [w for w in saida if a and a <= w['id'] <= b]  # os ids da transcrição (w00000…) vão em ordem
        if not dentro:
            continue
        w0, w1 = tempo.get(a), tempo.get(b)
        vistos.append({**i, 'inicio': w0['saida_ini'] + (i.get('off_ini') or 0) if w0 else dentro[0]['saida_ini'],
                       'fim': w1['saida_fim'] + (i.get('off_fim') or 0) if w1 else dentro[-1]['saida_fim']})
    planos = sorted((x for x in vistos if x['camada'] == 'plano'), key=lambda x: x['inicio'])
    for k, q in enumerate(planos):
        q['inicio'] = 0.0 if k == 0 else max(q['inicio'], planos[k - 1]['inicio'] + 0.05)
    for k, q in enumerate(planos):
        q['fim'] = planos[k + 1]['inicio'] if k + 1 < len(planos) else duracao
    elementos = sorted((x for x in vistos if x['camada'] == 'elemento'), key=lambda x: x['inicio'])
    for e in elementos:
        e['inicio'] = max(0.0, e['inicio'])
        e['fim'] = min(duracao, max(e['fim'], e['inicio'] + 0.05))
    return [{'id': x['id'], 'camada': x['camada'], 'tipo': direcao.tipo_atual(x['tipo'], x.get('conteudo')), 'conteudo': None,
             'inicio': round(x['inicio'], 3), 'fim': round(x['fim'], 3), 'descricao': x.get('descricao') or '',
             'texto': x.get('texto') or None} for x in planos + elementos]


def _itens(estado: dict, saida: list[dict], duracao: float) -> list[dict]:
    return no_tempo_da_saida(((estado.get('direcao') or {}).get('itens') or []), saida, duracao)


def _revisoes(id: str) -> list[dict]:
    out = []
    for v in versoes.listar(id):
        for c in sorted(revisoes.ler(id, v['versao'])['comentarios'], key=lambda c: -1 if c.get('geral') else c.get('t') or 0):
            if (c.get('texto') or '').strip():
                out.append({'versao': v['versao'], 'tempo': c.get('t'), 'fala': c.get('fala') or None, 'texto': c['texto'].strip(),
                            'status': c.get('status') or 'pendente', 'resposta': c.get('resposta')})
    return out


def de_projeto(id: str, n: int | None = None) -> str:
    """A versão aprovada (ou `n`) vira a referência `prj-<id>-vN`, a partir do último MP4 exportado. Devolve o id."""
    p = projeto.ler(id)
    n = n or versoes.aprovada(id)
    if not n:
        raise ValueError('O projeto não tem versão aprovada (aprove na Revisão, ou diga qual versão)')
    estado = versoes.ler(id, n).get('estado') or {}
    e = exportacao.estado(id)
    if not e or e.get('status') != 'pronta' or not e.get('arquivo'):
        raise ValueError('Exporte o vídeo antes: a referência usa o MP4 exportado')
    mp4 = exportacao.pasta_exports(id) / e['arquivo']
    if not mp4.is_file():
        raise ValueError(f'O MP4 exportado sumiu: {e["arquivo"]}')
    saida = direcao_projeto._palavras_mantidas(id, {**p, **estado})
    rid = f'prj-{id}-v{n}'
    base = referencias.RAIZ / rid
    shutil.rmtree(base, ignore_errors=True)
    base.mkdir(parents=True)
    try:
        midia.ffmpeg('-i', str(mp4), '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
                     '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(base / 'proxy.mp4'))
        info = midia.inspecionar(base / 'proxy.mp4')
        dur = info['duracao']
        midia.ffmpeg('-ss', str(min(1.0, dur / 2)), '-i', str(base / 'proxy.mp4'), '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4',
                     str(base / 'miniatura.jpg'))
        palavras = [{'id': w['id'], 'texto': w['texto'], 'inicio': w['saida_ini'], 'fim': w['saida_fim']} for w in saida]
        comum.salvar_json(base / 'palavras.json', {'motor': p.get('transcricao_ativa'), 'palavras': palavras})
        itens = _itens(estado, saida, dur)
        try:
            itens = direcao.validar_edicao(itens, dur)
        except ValueError:
            pass  # um plano curto demais para a tela de revisão da referência: fica como o vídeo tem
        itens = [direcao.ancorar(i, palavras) for i in itens]
        try:
            v1 = versoes.ler(id, 1).get('estado') or {}
            itens_ia = [direcao.ancorar(i, palavras) for i in _itens(v1, saida, dur)]
        except LookupError:
            itens_ia = []
        cortes = [q['inicio'] for q in itens if q['camada'] == 'plano'][1:]
        comum.salvar_json(base / 'cenas.json', {'cortes': cortes})
        rev = revisoes.ler(id, n)
        comum.salvar_json(base / 'referencia.json', {
            'id': rid, 'nome': f"{p['nome']} (aprovado)", 'criado_em': datetime.now().isoformat(timespec='seconds'), 'formato': 'vertical',
            'video': {'arquivo': 'proxy.mp4', 'nome_original': f'exports/{e["arquivo"]}', **info}, 'status': 'a_revisar', 'erro': None,
            'analise': {'passos': {x: {'status': 'pronto'} for x in direcao.PASSOS}},
            'origem': {'projeto': id, 'versao': n, 'aprovado_em': rev.get('aprovado_em')}, 'revisoes': _revisoes(id),
            'tipo': p['formato']})  # o tipo do projeto: ensina a direção dos projetos do mesmo tipo
        for i in itens:
            direcao._miniatura(base, i)
        comum.salvar_json(base / 'direcao.json', {'itens': itens, 'itens_ia': itens_ia, 'cortes': cortes})
    except BaseException:
        shutil.rmtree(base, ignore_errors=True)
        raise
    codigos.atribuir()
    versoes.registrar_atividade(id, 'aprovacao', f'v{n} virou a referência {rid} (a revisar na Calibragem)')
    return rid
