"""A CLI do app (docs/editor-claude.md, E3): o único jeito de o Claude editar um projeto. Cada comando chama uma rota do
app (a mesma da tela) com `X-Autor: claude`: o que muda aparece na tela, entra no registro de atividade e não deixa
marca de mão. O que Rodrigo mudou à mão (versoes.py) não é tocado sem `--forcar` (só quando um comentário pede).

    uv run --project backend python ferramentas/app.py <comando> …      (ajuda: … app.py -h, … app.py <comando> -h)

O app precisa estar no ar (./dev.sh). A API: http://localhost:$HARNESS_API_PORT (padrão 8000).
Ids aceitam os códigos copiáveis: BAN-074, PRE-07, MOT-11, TRA-02 (resolvidos pelo app).
"""
import argparse
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parents[1]


def _porta() -> str:
    porta = os.environ.get('HARNESS_API_PORT')
    env = RAIZ / '.dev.env'
    if not porta and env.exists():
        m = re.search(r'^HARNESS_API_PORT=(\d+)', env.read_text(), re.M)
        porta = m.group(1) if m else None
    return porta or '8000'


API = os.environ.get('HARNESS_API') or f'http://localhost:{_porta()}'


def _front() -> str:
    if os.environ.get('HARNESS_FRONT'):
        return os.environ['HARNESS_FRONT']
    env = RAIZ / '.dev.env'
    m = re.search(r'^HARNESS_FRONT_PORT=(\d+)', env.read_text(), re.M) if env.exists() else None
    return f'http://localhost:{m.group(1) if m else "5173"}'
CLIENTE = httpx.Client(base_url=API, headers={'X-Autor': 'claude'}, timeout=120)


def chamar(metodo: str, rota: str, **kw):
    try:
        r = CLIENTE.request(metodo, rota, **kw)
    except httpx.ConnectError:
        raise SystemExit(f'O app não está no ar em {API} (rode ./dev.sh).')
    if r.status_code >= 400:
        try:
            msg = r.json().get('detail')
        except ValueError:
            msg = r.text[:300]
        raise SystemExit(f'{metodo} {rota}: {r.status_code} · {msg}')
    return r.json() if r.content else None


def resolver(texto: str, tipo: str | None = None) -> str:
    """Um código copiável vira o id; um id passa direto."""
    if re.match(r'^(PRE|MOT|TRA|TRI|BAN|REF|SOM|PRJ|CTA)-?\d', texto or '', re.I):
        r = chamar('GET', f'/api/codigos/{texto}')
        if tipo and r['tipo'] not in (tipo, 'trecho' if tipo == 'midia' else tipo):
            raise SystemExit(f'{texto} é {r["nome_tipo"]}, não {tipo}.')
        if not r.get('existe'):
            raise SystemExit(f'{r["codigo"]} ({r["nome"]}) não existe mais.')
        return r['id']
    return texto


def atividade(pid: str, etapa: str, texto: str, t0: float | None = None) -> None:
    chamar('POST', f'/api/projetos/{pid}/atividade', json={'etapa': etapa, 'texto': texto, 'segundos': (time.time() - t0) if t0 else None})


def marcado(pid: str, etapa: str, alvo: str) -> dict | None:
    return next((m for m in chamar('GET', f'/api/projetos/{pid}/manuais') if m['etapa'] == etapa and m['alvo'] in (alvo, '*')), None)


def guardar(pid: str, etapa: str, alvo: str, forcar: bool) -> bool:
    """False (e avisa) se Rodrigo mudou isso à mão e não veio `--forcar`."""
    m = marcado(pid, etapa, alvo)
    if m and not forcar:
        print(f'• {etapa} {alvo}: mudado à mão por Rodrigo na v{m["versao"]} ({m["em"]}): não mexo (use --forcar se um comentário pedir).')
        return False
    return True


def tempo(t: float | None) -> str:
    t = max(0.0, t or 0)
    return f'{int(t // 60)}:{t % 60:04.1f}'.replace('.', ',')


# ---------------------------------------------------------------- projeto

def projeto_criar(a):
    arq = Path(a.arquivo).expanduser()
    if not arq.is_file():
        raise SystemExit(f'Arquivo não encontrado: {arq}')
    dados = {'nome': a.nome or arq.stem, 'formato': 'reels', 'briefing_texto': a.briefing or ''}
    with arq.open('rb') as f:
        p = chamar('POST', '/api/projetos', data=dados, files={'bruto': (arq.name, f, mimetypes.guess_type(arq.name)[0] or 'video/mp4')}, timeout=None)
    print(p['id'])


def _pipeline_rodando(p: dict) -> bool:
    pp = p.get('pipeline') or {}
    return not pp.get('erro') and any(n != 'variantes' and s.get('status') in ('pendente', 'rodando') for n, s in (pp.get('passos') or {}).items())


def projeto_esperar(a):
    t0 = time.time()
    while True:
        p = chamar('GET', f'/api/projetos/{a.id}')
        if (p.get('pipeline') or {}).get('erro'):
            raise SystemExit(f'O pipeline parou: {p["pipeline"]["erro"]}')
        if not _pipeline_rodando(p) and 'cortes' in p:
            break
        if time.time() - t0 > a.limite:
            raise SystemExit('O pipeline passou do limite de espera.')
        time.sleep(2)
    print(f'pronto em {time.time() - t0:.0f} s · ' + ' · '.join(f'{n} {s.get("status")}' for n, s in ((p.get('pipeline') or {}).get('passos') or {}).items()))


def projeto_ver(a):
    p = chamar('GET', f'/api/projetos/{a.id}')
    c = p.get('claude') or {}
    print(f'{p["nome"]} ({p["id"]}) · versão v{p.get("versao") or 0} · {"travado por Claude · " + str(c.get("etapa")) if c.get("editando") else "livre"}')
    print('etapas: ' + ' · '.join(f'{k} {v}' for k, v in (p.get('etapas') or {}).items()))
    print(f'pipeline rodando: {_pipeline_rodando(p)} · direção: {(p.get("direcao") or {}).get("status")}')


def travar(a):
    chamar('PUT', f'/api/projetos/{a.id}/claude', json={'editando': True, 'etapa': a.etapa})
    print(f'travado · {a.etapa}')


def destravar(a):
    chamar('PUT', f'/api/projetos/{a.id}/claude', json={'editando': False})
    print('destravado')


def anotar(a):
    chamar('POST', f'/api/projetos/{a.id}/atividade', json={'etapa': a.etapa, 'texto': a.texto, 'segundos': a.segundos})


# ---------------------------------------------------------------- cortes

def cortes_texto(a):
    e = chamar('GET', f'/api/projetos/{a.id}/editor')
    if not e['palavras']:
        raise SystemExit('Sem transcrição ainda.')
    linhas, grupo = [], []
    for k, w in enumerate(e['palavras']):
        grupo.append(w['texto'])
        fim = k + 1 == len(e['palavras']) or e['palavras'][k + 1]['mantida'] != w['mantida']
        if fim:
            linhas.append(' '.join(grupo) if w['mantida'] else f'[✂ {" ".join(grupo)}]')
            grupo = []
    print(' '.join(linhas))
    v1 = e['timeline']['V1']
    print(f'\n{len(v1)} trechos · {sum(c["fim"] - c["inicio"] for c in v1):.1f} s do bruto')
    for d in e.get('duvidas') or []:
        print(f'dúvida da IA: {d}')


def cortes_refazer(a):
    if not guardar(a.id, 'cortes', '*', a.forcar):
        return
    t0 = time.time()
    chamar('POST', f'/api/projetos/{a.id}/cortes/refazer')
    atividade(a.id, 'cortes', 'Cortes refeitos pela IA do app', t0)
    print('pedido: refazer cortes (acompanhe com `projeto esperar`)')


def cortes_faixa(a):
    t0 = time.time()
    chamar('POST', f'/api/projetos/{a.id}/cortes/faixa', json={'inicio': a.inicio, 'fim': a.fim, 'manter': a.manter})
    atividade(a.id, 'cortes', f'{"Devolveu" if a.manter else "Cortou"} {a.inicio:.2f}–{a.fim:.2f} s do bruto', t0)
    print('ok')


def palavras(a):
    """As palavras com o id (para a legenda e os comentários da direção): `*` = cortada; filtra por texto."""
    e = chamar('GET', f'/api/projetos/{a.id}/editor')
    alvo = (a.busca or '').lower()
    for w in e['palavras']:
        if alvo and alvo not in w['texto'].lower():
            continue
        if a.mantidas and not w['mantida']:
            continue
        print(f'{w["id"]} {"" if w["mantida"] else "*"}{w["texto"]}', end='\n' if alvo else '  ')
    print()


def heuristica(_a):
    print(chamar('GET', '/api/referencias/heuristica')['regras'])


# ---------------------------------------------------------------- direção

def _esperar_direcao(pid: str, limite: float = 600) -> dict:
    t0 = time.time()
    while True:
        d = chamar('GET', f'/api/projetos/{pid}').get('direcao') or {}
        if d.get('status') != 'rodando':
            if d.get('status') == 'erro' or d.get('erro'):
                raise SystemExit(f'A direção falhou: {d.get("erro")}')
            return d
        if time.time() - t0 > limite:
            raise SystemExit('A direção passou do limite de espera.')
        time.sleep(2)


def direcao_gerar(a):
    if not guardar(a.id, 'direcao', '*', a.forcar):
        return
    t0 = time.time()
    chamar('POST', f'/api/projetos/{a.id}/direcao/gerar')
    if a.esperar:
        d = _esperar_direcao(a.id)
        atividade(a.id, 'direcao', f'Direção gerada pelo app (v{d.get("ativa")})', t0)
        print(f'direção pronta em {time.time() - t0:.0f} s')
    else:
        print('pedido: gerar direção')


def direcao_ver(a):
    p = chamar('GET', f'/api/projetos/{a.id}')
    d = p.get('direcao') or {}
    itens = d.get('itens') or []
    e = chamar('GET', f'/api/projetos/{a.id}/editor')
    texto = {w['id']: w['texto'] for w in e['palavras']}
    ordem = [w['id'] for w in e['palavras']]
    pos = {w: k for k, w in enumerate(ordem)}

    def fala(i):
        a_, b_ = pos.get(i.get('palavra_ini'), 0), pos.get(i.get('palavra_fim'), -1)
        return ' '.join(texto[w] for w in ordem[a_:b_ + 1] if e['palavras'][pos[w]]['mantida'])
    print(f'direção v{d.get("ativa")} · {d.get("status")}')
    for i in sorted(itens, key=lambda i: pos.get(i.get('palavra_ini'), 0)):
        if i.get('camada') == 'plano':
            print(f'{i["id"]:>4} {i["tipo"]:<24} {i.get("descricao") or "—"}' + (f' «{i["texto"]}»' if i.get('texto') else ''))
            print(f'      “{fala(i)}”')
        else:
            print(f'      + {i["tipo"]}' + (f' «{i["texto"]}»' if i.get('texto') else ''))


def direcao_comentar(a):
    chamar('POST', f'/api/projetos/{a.id}/direcao/comentarios', json={'palavra': a.palavra, 'off': 0, 'texto': a.texto})
    print('comentário na versão aberta da direção')


def direcao_corrigir(a):
    t0 = time.time()
    chamar('POST', f'/api/projetos/{a.id}/direcao/corrigir', json={'geral': a.geral})
    if a.esperar:
        d = _esperar_direcao(a.id)
        atividade(a.id, 'direcao', f'Direção corrigida pela corretora do app (v{d.get("ativa")})', t0)
        print(f'direção v{d.get("ativa")} pronta em {time.time() - t0:.0f} s')
    else:
        print('pedido: corrigir a direção')


# ---------------------------------------------------------------- inserts, banco, presets, motions

def _codigos() -> dict:
    return chamar('GET', '/api/codigos')


def inserts_listar(a):
    r = chamar('GET', f'/api/projetos/{a.id}/inserts')
    cods = _codigos()
    for x in sorted(r['pedidos'], key=lambda x: x.get('inicio') or 0):
        e = x.get('enriquecimento') or {}
        mid = ', '.join(cods['midia'].get(m['banco'], m['banco']) for m in x.get('midias') or []) or 'sem mídia'
        pre = cods['preset'].get(e.get('preset'), e.get('preset')) if e.get('preset') else 'sem preset'
        print(f'{x["id"]} {x["plano"]:>4} {x["tipo"]:<22} {tempo(x.get("inicio"))} +{x.get("duracao", 0):.1f}s · {mid} · {pre}')
        print(f'      “{x.get("fala", "")}”' + (f'\n      {x["descricao"]}' if x.get('descricao') else '') + (f' «{x["texto"]}»' if x.get('texto') else ''))
    if r.get('ator_planos'):
        print('presets do Full ator: ' + ', '.join(f'{k}={v}' for k, v in r['ator_planos'].items()))


def inserts_ligar(a):
    if not guardar(a.id, 'inserts', a.pedido, a.forcar):
        return
    ids = [resolver(m, 'midia') for m in a.midias]
    chamar('PUT', f'/api/projetos/{a.id}/inserts/{a.pedido}/midias', json={'midias': [{'banco': b} for b in ids]})
    atividade(a.id, 'inserts', f'Insert {a.pedido}: {len(ids)} mídia(s) ligada(s)')
    print('ok')


def banco_buscar(a):
    cods = _codigos()
    for i in chamar('GET', '/api/banco', params={'busca': a.termos})[:a.n]:
        estado = i.get('estado') or ''
        print(f'{cods["midia"].get(i["id"], i["id"]):<10} {i["id"]} {i.get("tipo")} {i.get("formato")} {i.get("duracao") or ""}s {estado} · {i["nome"]}')
        if i.get('descricao'):
            print(f'           {i["descricao"][:160]}')


def banco_subir(a):
    """Sobe uma mídia ao banco do app, marcada como trazida pelo Claude para o projeto (o selo da faxina), com a
    descrição dele (a IA do app não descreve de novo) e a URL de onde veio."""
    arq = Path(a.arquivo).expanduser()
    a.projeto = a.projeto and resolver(a.projeto, 'projeto')
    dados = {k: v for k, v in (('projeto', a.projeto), ('descricao', a.descricao), ('palavras', a.palavras), ('url', a.url)) if v}
    with arq.open('rb') as f:
        itens = chamar('POST', '/api/banco', data=dados, files=[('arquivos', (arq.name, f, mimetypes.guess_type(arq.name)[0] or 'application/octet-stream'))], timeout=None)
    item = itens[0] if isinstance(itens, list) else itens.get('itens', [itens])[0]
    if a.nome:
        chamar('PUT', f'/api/banco/{item["id"]}', json={'nome': a.nome})
    if a.projeto:
        atividade(a.projeto, 'inserts', f'Banco: subiu {a.nome or arq.name}' + (f' ({a.url})' if a.url else ''))
    print(item['id'])


def banco_selo(a):
    bid = resolver(a.midia, 'midia')
    i = chamar('PUT', f'/api/banco/{bid}/estado', json={'estado': None if a.selo == 'auto' else a.selo})
    print(f'{bid}: {i.get("estado") or "sem selo"}')


def banco_limpar(a):
    """Os recusados (o que o Claude trouxe e ficou de fora de um vídeo aprovado); com --confirmar, vão para a lixeira do banco."""
    cods = _codigos()
    ids = chamar('GET', '/api/banco-recusados')['ids']
    if not a.confirmar:
        print(f'{len(ids)} recusado(s): ' + (', '.join(cods['midia'].get(x, x) for x in ids) or '—') + ('\n(--confirmar leva para a lixeira do banco)' if ids else ''))
        return
    print(f'{len(chamar("POST", "/api/banco-recusados/limpar")["levados"])} mídia(s) (com os trechos) na lixeira do banco')


def banco_trecho(a):
    bid = resolver(a.midia, 'midia')
    t = chamar('POST', f'/api/banco/{bid}/trechos', json={'inicio': a.inicio, 'fim': a.fim, 'nome': a.nome})
    print(t['id'] if isinstance(t, dict) and 'id' in t else t)


def capturar(a):
    """Grava o site (a captura do app: cada dobra vira uma mídia do banco ligada ao insert)."""
    if not guardar(a.id, 'inserts', a.pedido, a.forcar):
        return
    t0 = time.time()
    r = chamar('POST', f'/api/projetos/{a.id}/inserts/{a.pedido}/captura',
               json={'url': a.url, 'proporcao': a.proporcao, 'dobras': a.dobras, 'duracao': a.duracao, 'titulo': a.titulo})
    x = next(x for x in r['pedidos'] if x['id'] == a.pedido)
    cid = (x.get('capturas') or [{}])[-1].get('id')
    if not a.esperar:
        print(f'captura {cid} na fila')
        return
    while True:
        x = next(x for x in chamar('GET', f'/api/projetos/{a.id}/inserts')['pedidos'] if x['id'] == a.pedido)
        c = next((c for c in x.get('capturas') or [] if c['id'] == cid), None)
        if not c or c['status'] in ('pronto', 'erro'):
            break
        if time.time() - t0 > 300:
            raise SystemExit('A captura passou de 5 min.')
        time.sleep(2)
    if c and c['status'] == 'erro':
        raise SystemExit(f'A captura falhou: {c.get("erro")}')
    cods = _codigos()
    print(f'capturado em {time.time() - t0:.0f} s · mídias do insert: ' + ', '.join(cods['midia'].get(m['banco'], m['banco']) for m in x.get('midias') or []))
    atividade(a.id, 'inserts', f'Insert {a.pedido}: captura de {a.url}', t0)


def presets_recomendados(a):
    t0 = time.time()
    r = chamar('POST', f'/api/projetos/{a.id}/inserts/presets/recomendados', json={'refazer': a.refazer})
    cods = _codigos()
    for x in r['inserts']:
        print(f'{x["plano"]:>4}: ' + (f'{cods["preset"].get(x["preset"], x["preset"])} {x.get("nome")} — {x["motivo"]}' if not x.get('pulado') else f'— {x["pulado"]}'))
    atividade(a.id, 'presets', f'Presets recomendados aplicados ({sum(1 for x in r["inserts"] if not x.get("pulado"))} inserts)', t0)


def presets_definir(a):
    if not guardar(a.id, 'inserts', a.pedido, a.forcar):
        return
    campos = {'preset': resolver(a.preset, 'preset') if a.preset != 'nenhum' else None}
    if a.ajustes:
        campos['ajustes'] = json.loads(a.ajustes)
    chamar('PUT', f'/api/projetos/{a.id}/inserts/{a.pedido}/enriquecimento', json={'campos': campos})
    atividade(a.id, 'presets', f'Insert {a.pedido}: preset {a.preset}')
    print('ok')


def ator(a):
    if not guardar(a.id, 'presets_ator', a.plano, a.forcar):
        return
    chamar('PUT', f'/api/projetos/{a.id}/inserts/ator/{a.plano}', json={'movimento': None if a.movimento == 'nada' else a.movimento})
    atividade(a.id, 'presets', f'Full ator {a.plano}: {a.movimento}')
    print('ok')


def motions_listar(_a):
    cods = _codigos()
    for m in chamar('GET', '/api/motions/presets'):
        campos = ', '.join(f'{k} ({v["rotulo"]})' for k, v in m['campos'].items())
        print(f'{cods["motion"].get(m["id"], m["id"]):<7} {m["id"]:<16} {m["nome"]}{" · A REVISAR" if m.get("a_revisar") else ""} · {m["duracao"]} s · campos: {campos}')
        print(f'        {m["descricao"]}')


def motions_recusados(_a):
    """Os motions recusados por Rodrigo, com o motivo: leia antes de escrever um motion novo."""
    rec = chamar('GET', '/api/motions/recusados')
    for r in rec:
        print(f'✗ {r["nome"]} ({r["arquivo"]}): {r["motivo"] or "sem motivo"}')
    if not rec:
        print('nenhum motion recusado')


def identidade(_a):
    """A identidade visual dos motions (Configurações › Motions)."""
    print(chamar('GET', '/api/config').get('identidade_motion') or '(vazia)')


def motions_usar(a):
    if not guardar(a.id, 'motions', a.plano, a.forcar):
        return
    corpo = {'tipo': 'video' if a.video else 'preset', 'formato': a.formato, 'valores': json.loads(a.valores or '{}'), 'fundo': a.fundo}
    if a.video:
        corpo['banco'] = resolver(a.video, 'midia')
    else:
        corpo['preset'] = resolver(a.preset, 'motion')
    chamar('PUT', f'/api/projetos/{a.id}/motions/{a.plano}', json=corpo)
    atividade(a.id, 'motions', f'Motion {a.plano}: {a.preset or a.video}')
    print('ok')


# ---------------------------------------------------------------- transições, áudio, legenda, look

def transicoes_variar(a):
    t0 = time.time()
    r = chamar('POST', f'/api/projetos/{a.id}/transicoes/variar', json={'modo': 'todas' if a.todas else 'favoritas'})
    for c in r['cortes']:
        print(f'{c["plano"]:>4} {c["par"]:<45} {c["id"]}' + (f' ({c["pulado"]})' if c.get('pulado') else ''))
    atividade(a.id, 'transicoes', f'Transições variadas ({"todas" if a.todas else "favoritas"})', t0)


def transicoes_definir(a):
    if not guardar(a.id, 'transicoes', a.plano, a.forcar):
        return
    tid = None if a.transicao == 'padrao' else resolver(a.transicao, 'transicao')
    chamar('PUT', f'/api/projetos/{a.id}/transicoes', json={'campos': {a.plano: {'id': tid} if tid else None}})
    atividade(a.id, 'transicoes', f'Corte {a.plano}: {a.transicao}')
    print('ok')


def trilhas(_a):
    cods = _codigos()
    for t in chamar('GET', '/api/audio').get('trilhas', []):
        print(f'{cods["trilha"].get(t["id"], t["id"]):<7} {t["id"]:<16} {t.get("nome")} · {t.get("clima")} · {t.get("bpm")} BPM')


def audio(a):
    if not guardar(a.id, 'audio', 'fundo' if a.fundo else '*', a.forcar):
        return
    campos: dict = {}
    if a.fundo:
        campos['fundo'] = None if a.fundo == 'nenhum' else resolver(a.fundo, 'trilha')
    if a.limpeza or a.timbre:
        campos['voz'] = {k: v for k, v in (('limpeza', a.limpeza), ('timbre', a.timbre)) if v}
    chamar('PUT', f'/api/projetos/{a.id}/audio', json={'campos': campos})
    atividade(a.id, 'audio', f'Áudio: {json.dumps(campos, ensure_ascii=False)}')
    print('ok')


def legenda_corrigir(a):
    if not guardar(a.id, 'legenda', a.palavra, a.forcar):
        return
    chamar('PUT', f'/api/projetos/{a.id}/legenda', json={'campos': {'ajustes': {a.palavra: {'texto': a.texto}}}})
    atividade(a.id, 'legenda', f'Legenda {a.palavra}: “{a.texto}”')
    print('ok')


def look(a):
    if not guardar(a.id, 'preprocessamento', 'look', a.forcar):
        return
    campos = {k: v for k, v in (('lut', a.lut), ('intensidade', a.intensidade), ('vinheta', a.vinheta)) if v is not None}
    chamar('PUT', f'/api/projetos/{a.id}/look', json={'campos': campos})
    atividade(a.id, 'preprocessamento', f'Look: {campos}')
    print('ok')


# ---------------------------------------------------------------- checagem

def quadros(a):
    """Fotografa o palco da prévia montada (a etapa Legenda: ator, inserts, motions, transições e legenda) nos instantes
    pedidos ou, sem instantes, no meio de cada plano; junta numa folha (`folha.jpg`) para o Claude olhar."""
    import subprocess
    import tempfile
    from playwright.sync_api import sync_playwright
    saida = Path(a.saida or tempfile.mkdtemp(prefix=f'quadros-{a.id}-'))
    saida.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chromium')
        try:
            pg = br.new_page(viewport={'width': 1500, 'height': 1000})
            pg.goto(f'{_front()}/p/{a.id}')
            pg.wait_for_function('() => window.__editor && window.__editor.duracao() > 0', timeout=60000)
            pg.evaluate('e => window.__editor.etapa(e)', a.etapa)
            pg.wait_for_timeout(2500)
            planos = pg.evaluate('() => window.__editor.planos()')
            tempos = a.tempos or [round((pl['inicio'] + pl['fim']) / 2, 2) for pl in planos]
            rotulos = []
            for k, t in enumerate(tempos):
                pg.evaluate('t => window.__editor.buscar(t)', t)
                pg.wait_for_timeout(900)
                pg.locator('[data-previa]').screenshot(path=str(saida / f'{k:03d}.png'))
                pl = next((p for p in planos if p['inicio'] <= t < p['fim']), None)
                rotulos.append(f'{k:03d}.png  {tempo(t)}  {pl["id"] + " " + pl["tipo"] if pl else ""}')
        finally:
            br.close()
    n = len(tempos)
    colunas = min(n, 8)
    linhas = -(-n // colunas)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '1', '-i', str(saida / '%03d.png'), '-vf',
                    f'scale=270:-2,tile={colunas}x{linhas}:padding=6:color=0x172e2b', '-frames:v', '1', str(saida / 'folha.jpg')], check=True)
    print(f'{n} quadros em {time.time() - t0:.0f} s · folha: {saida / "folha.jpg"}')
    print('\n'.join(rotulos))


# ---------------------------------------------------------------- versões e códigos

def versao_marcar(a):
    v = chamar('POST', f'/api/projetos/{a.id}/versoes', json={'resumo': a.resumo or ''})
    print(f'v{v["versao"]} marcada')


def versoes_listar(a):
    r = chamar('GET', f'/api/projetos/{a.id}/versoes')
    for v in r['versoes']:
        print(f'v{v["versao"]} · {v["criado_em"]} · {v["autor"]}' + (' · a de agora' if v['versao'] == r['atual'] else '') + (f' · {v["resumo"]}' if v.get('resumo') else ''))
    m = chamar('GET', f'/api/projetos/{a.id}/manuais')
    if m:
        print('mudado à mão por Rodrigo: ' + ', '.join(f'{x["etapa"]}/{x["alvo"]} (v{x["versao"]})' for x in m))


def codigo(a):
    for c in a.codigos:
        r = chamar('GET', f'/api/codigos/{c}')
        print(f'{r["codigo"]} · {r["nome"]} · {r["nome_tipo"]} · id {r["id"]}' + ('' if r['existe'] else ' · REMOVIDO')
              + (f' · {r["plano"]}' if r.get('plano') else '') + (f' · referência {r["referencia"]}' if r.get('referencia') else ''))


# ---------------------------------------------------------------- argumentos

def main(argv=None):
    ap = argparse.ArgumentParser(prog='app.py', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    def cmd(nome, f, *args, ajuda=''):
        s = sub.add_parser(nome, help=ajuda)
        for a, kw in args:
            s.add_argument(*([a] if isinstance(a, str) else a), **kw)
        s.set_defaults(f=f)
        return s

    ID = ('id', {'help': 'id do projeto'})
    FORCAR = ('--forcar', {'action': 'store_true', 'help': 'mexer mesmo no que Rodrigo mudou à mão (só se um comentário pedir)'})
    cmd('projeto-criar', projeto_criar, ('arquivo', {}), ('--nome', {}), ('--briefing', {}), ajuda='cria o projeto (o pipeline roda sozinho)')
    cmd('projeto-esperar', projeto_esperar, ID, ('--limite', {'type': float, 'default': 900}), ajuda='espera o pipeline (transcrição e cortes)')
    cmd('projeto-ver', projeto_ver, ID)
    cmd('travar', travar, ID, ('etapa', {}), ajuda='"Claude editando · etapa" (a tela fica só leitura)')
    cmd('destravar', destravar, ID)
    cmd('anotar', anotar, ID, ('etapa', {}), ('texto', {}), ('--segundos', {'type': float}), ajuda='uma linha no registro de atividade')
    cmd('cortes-texto', cortes_texto, ID, ajuda='o texto final, com os cortes entre [✂ …], e as dúvidas da IA')
    cmd('cortes-refazer', cortes_refazer, ID, FORCAR)
    cmd('cortes-faixa', cortes_faixa, ID, ('inicio', {'type': float}), ('fim', {'type': float}), ('--manter', {'action': 'store_true'}),
        ajuda='corta (ou com --manter devolve) um intervalo do bruto, em segundos')
    cmd('palavras', palavras, ID, ('busca', {'nargs': '?'}), ('--mantidas', {'action': 'store_true'}), ajuda='os ids das palavras (* = cortada)')
    cmd('heuristica', heuristica, ajuda='as regras do criador e as sugeridas (a Heurística do app)')
    cmd('direcao-gerar', direcao_gerar, ID, ('--esperar', {'action': 'store_true'}), FORCAR)
    cmd('direcao-ver', direcao_ver, ID, ajuda='o roteiro: cada plano com a marcação e a fala')
    cmd('direcao-comentar', direcao_comentar, ID, ('palavra', {}), ('texto', {}), ajuda='comentário pontual (preso a uma palavra) para a corretora')
    cmd('direcao-corrigir', direcao_corrigir, ID, ('--geral', {}), ('--esperar', {'action': 'store_true'}), ajuda='a corretora do app gera a próxima versão')
    cmd('inserts', inserts_listar, ID, ajuda='os pedidos de insert com mídias e presets')
    cmd('inserts-ligar', inserts_ligar, ID, ('pedido', {}), ('midias', {'nargs': '+'}), FORCAR, ajuda='as mídias do insert (ids ou BAN-…), em ordem')
    cmd('banco-buscar', banco_buscar, ('termos', {}), ('-n', {'type': int, 'default': 15}))
    cmd('banco-subir', banco_subir, ('arquivo', {}), ('--projeto', {'help': 'o projeto para o qual trouxe (o selo da faxina)'}), ('--url', {'help': 'de onde veio'}),
        ('--nome', {}), ('--descricao', {}), ('--palavras', {'help': 'separadas por vírgula'}))
    cmd('banco-selo', banco_selo, ('midia', {}), ('selo', {'choices': ['aprovado', 'recusado', 'auto']}))
    cmd('banco-limpar', banco_limpar, ('--confirmar', {'action': 'store_true'}), ajuda='os recusados do banco; com --confirmar, para a lixeira')
    cmd('banco-trecho', banco_trecho, ('midia', {}), ('inicio', {'type': float}), ('fim', {'type': float}), ('--nome', {}))
    cmd('capturar', capturar, ID, ('pedido', {}), ('url', {}), ('--proporcao', {'choices': ['16:9', '4:3', '1:1', '9:16'], 'default': '16:9'}),
        ('--dobras', {'nargs': '+', 'type': float, 'default': [0], 'help': 'o topo de cada dobra: fração da página (0 a 1) ou px'}),
        ('--duracao', {'type': float, 'default': 4}), ('--titulo', {}), ('--esperar', {'action': 'store_true'}), FORCAR,
        ajuda='grava o site e liga as dobras ao insert (a captura do app)')
    cmd('presets-recomendados', presets_recomendados, ID, ('--refazer', {'action': 'store_true'}))
    cmd('presets-definir', presets_definir, ID, ('pedido', {}), ('preset', {'help': 'id, PRE-… ou "nenhum"'}), ('--ajustes', {'help': 'JSON'}), FORCAR)
    cmd('ator', ator, ID, ('plano', {}), ('movimento', {'choices': ['zoom_lento', 'zoom_seco', 'nada']}), FORCAR, ajuda='preset do Full ator')
    cmd('motions', motions_listar)
    cmd('motions-recusados', motions_recusados, ajuda='os motions recusados, com o motivo (leia antes de escrever um novo)')
    cmd('identidade', identidade, ajuda='a identidade visual dos motions (Configurações › Motions)')
    cmd('motions-usar', motions_usar, ID, ('plano', {}), ('--preset', {}), ('--video', {}), ('--formato', {'choices': ['vertical', 'dividida'], 'default': 'vertical'}),
        ('--valores', {'help': 'JSON dos campos'}), ('--fundo', {}), FORCAR)
    cmd('transicoes-variar', transicoes_variar, ID, ('--todas', {'action': 'store_true'}))
    cmd('transicoes-definir', transicoes_definir, ID, ('plano', {}), ('transicao', {'help': 'id, TRA-… ou "padrao"'}), FORCAR)
    cmd('trilhas', trilhas)
    cmd('audio', audio, ID, ('--fundo', {'help': 'id, TRI-… ou "nenhum"'}), ('--limpeza', {}), ('--timbre', {}), FORCAR)
    cmd('legenda-corrigir', legenda_corrigir, ID, ('palavra', {}), ('texto', {}), FORCAR)
    cmd('look', look, ID, ('--lut', {}), ('--intensidade', {'type': float}), ('--vinheta', {}), FORCAR)
    cmd('quadros', quadros, ID, ('tempos', {'nargs': '*', 'type': float, 'help': 's do vídeo final; sem nada, o meio de cada plano'}),
        ('--etapa', {'default': 'legenda'}), ('--saida', {}), ajuda='fotografa a prévia montada e faz a folha (a checagem antes de entregar)')
    cmd('versao-marcar', versao_marcar, ID, ('--resumo', {}))
    cmd('versoes', versoes_listar, ID)
    cmd('codigo', codigo, ('codigos', {'nargs': '+'}))
    a = ap.parse_args(argv)
    a.f(a)


if __name__ == '__main__':
    main(sys.argv[1:])
