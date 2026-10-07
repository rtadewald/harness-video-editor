"""Inserts (SPEC §8.3): o criador liga, a cada plano com insert da direção, as mídias (vídeos e imagens) do BANCO.

Decisão de Rodrigo (out/2026): a captura automática (agente que buscava na web e gravava sites) saiu; por ora os inserts
são manuais. A direção diz o que acontece em cada insert e quais mídias ele pede (vídeo ou imagem, formato); aqui o
criador sobe os arquivos ou escolhe do banco, várias mídias por insert. Como elas aparecem (zoom, lado a lado, uma depois
da outra, destaques) é do Enriquecimento.

O BANCO é global (`banco/<id>/`, fora dos projetos): o arquivo original, uma versão leve para tocar (vídeo), uma
miniatura e `item.json` (nome, descrição, palavras-chave, tipo, formato, medidas, origem). Ao subir, um modelo de visão
descreve a mídia em segundo plano (o que aparece, textos e marcas, palavras-chave), para no futuro a IA sugerir o que vai
onde. Onde cada mídia é usada é calculado lendo os projetos.

TRECHOS (decisão de Rodrigo, out/2026): pedaços de um vídeo do banco (`pai`, `inicio`, `fim`), sem arquivo próprio — tocam
o original. Herdam do original a descrição, as palavras-chave e o formato. O original só muda quando é editado (cortar as
pontas): aí os trechos acompanham o novo começo, e os que caem fora somem."""
import math
import shutil
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

from . import comum, direcao, direcao_projeto, midia, projeto

RAIZ_BANCO = Path(__file__).resolve().parents[2] / 'banco'
EXT_VIDEO = ('.mp4', '.mov', '.m4v', '.webm')
EXT_IMAGEM = ('.png', '.jpg', '.jpeg', '.webp')
PROPORCOES = {'16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '1:1': 1.0, '4:5': 4 / 5, '3:4': 3 / 4, '9:16': 9 / 16, 'alto': 9 / 22}

MIN_TRECHO = 0.2
HERDADOS = ('tipo', 'formato', 'largura', 'altura', 'descricao', 'palavras', 'descricao_ia', 'origem', 'ia', 'arquivo', 'proxy', 'cortes')

_descricoes = ThreadPoolExecutor(max_workers=2)
_cortes = ThreadPoolExecutor(max_workers=1)


# ---------------------------------------------------------------- banco

def pasta_item(bid: str) -> Path:
    return RAIZ_BANCO / bid


def formato_de(largura: int | None, altura: int | None) -> str:
    """O formato mais próximo da proporção real da mídia."""
    if not largura or not altura:
        return '16:9'
    r = largura / altura
    return min(PROPORCOES, key=lambda f: abs(math.log(r / PROPORCOES[f])))


def _normalizar_item(i: dict) -> dict:
    """Itens antigos (capturas do agente automático que existiu) ganham os campos de hoje."""
    if 'tipo' not in i:
        imagem = i.get('midia') == 'imagem'
        i = {**i, 'tipo': 'imagem' if imagem else 'video', 'nome': (i.get('origem') or {}).get('titulo') or i['id'],
             'descricao': i.get('resumo') or '', 'palavras': [], 'arquivo': i.get('arquivo') or 'captura.mp4',
             'proxy': None if imagem else (i.get('arquivo') or 'captura.mp4'),
             'ia': {'status': 'pronto' if i.get('resumo') else 'pendente', 'erro': None},
             'origem': {**(i.get('origem') or {}), 'tipo': 'captura automática'}}
    if i.get('formato') not in PROPORCOES:
        i = {**i, 'formato': formato_de(i.get('largura'), i.get('altura'))}
    i.setdefault('palavras', [])
    return i


def _completar(i: dict) -> dict:
    """Um trecho com o que herda do original (descrição, palavras, formato…) e a sua duração."""
    if not i.get('pai'):
        return _normalizar_item(i)
    pai = _normalizar_item(comum.ler_json(pasta_item(i['pai']) / 'item.json'))
    return {**{k: pai.get(k) for k in HERDADOS}, **i, 'duracao': round(i['fim'] - i['inicio'], 3), 'nome_pai': pai['nome']}


def ler_item(bid: str) -> dict:
    return _completar(comum.ler_json(pasta_item(bid) / 'item.json'))


def trechos_de(bid: str) -> list[dict]:
    """Os trechos de um vídeo, em ordem."""
    out = []
    for arq in RAIZ_BANCO.glob('*/item.json'):
        try:
            i = comum.ler_json(arq)
        except ValueError:
            continue
        if i.get('pai') == bid:
            out.append(i)
    return sorted(out, key=lambda t: t['inicio'])


def salvar_item(item: dict) -> dict:
    comum.salvar_json(pasta_item(item['id']) / 'item.json', item)
    return item


def listar_banco(busca: str = '', tipo: str | None = None) -> list[dict]:
    """Os originais do banco, os mais novos primeiro, cada um com os seus trechos; `busca` procura no nome, na descrição e
    nas palavras-chave (do original ou de um trecho)."""
    if not RAIZ_BANCO.exists():
        return []
    termos = [comum.norm(t) for t in (busca or '').split() if comum.norm(t)]
    originais, trechos = [], {}
    for arq in RAIZ_BANCO.glob('*/item.json'):
        try:
            i = comum.ler_json(arq)
        except ValueError:
            continue
        if i.get('pai'):
            trechos.setdefault(i['pai'], []).append(i)
        else:
            originais.append(_normalizar_item(i))
    itens = []
    for i in originais:
        filhos = [{**{k: i.get(k) for k in HERDADOS}, **t, 'duracao': round(t['fim'] - t['inicio'], 3), 'nome_pai': i['nome']}
                  for t in sorted(trechos.get(i['id'], []), key=lambda t: t['inicio'])]
        if tipo and i['tipo'] != tipo:
            continue
        if termos:
            texto = ' '.join(comum.norm(x) for x in ' '.join([i.get('nome') or '', i.get('descricao') or '', ' '.join(i['palavras']),
                                                                *(t.get('nome') or '' for t in filhos)]).split())
            if not all(t in texto for t in termos):
                continue
        itens.append({**i, 'trechos': filhos})
    return sorted(itens, key=lambda i: i.get('criado_em') or '', reverse=True)


VERSAO_PROXY = 2  # 2: quadro-chave a cada 12 quadros, para a busca na timeline do editor ser imediata


def _fazer_proxy(origem: Path, destino: Path) -> None:
    """A versão leve para tocar (lado maior até 1280), com quadros-chave curtos: buscar um ponto não precisa decodificar
    segundos de vídeo antes."""
    midia.ffmpeg('-i', str(origem), '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
                 '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', '-g', '12', '-keyint_min', '12',
                 '-sc_threshold', '0', '-tune', 'fastdecode', '-c:a', 'aac', '-movflags', '+faststart', str(destino))


def atualizar_proxies() -> None:
    """Refaz, em segundo plano, a versão leve dos vídeos feita antes da versão atual."""
    for i in listar_banco(tipo='video'):
        if i.get('proxy_v') != VERSAO_PROXY and (pasta_item(i['id']) / i['arquivo']).exists():
            _cortes.submit(_refazer_proxy, i['id'])


def _refazer_proxy(bid: str) -> None:
    try:
        pasta = pasta_item(bid)
        item = comum.ler_json(pasta / 'item.json')
        _fazer_proxy(pasta / item['arquivo'], pasta / 'proxy.novo.mp4')
        (pasta / 'proxy.novo.mp4').replace(pasta / 'proxy.mp4')
        salvar_item({**comum.ler_json(pasta / 'item.json'), 'proxy': 'proxy.mp4', 'proxy_v': VERSAO_PROXY})
    except Exception:
        traceback.print_exc()


def subir(origem: Path, nome_original: str, fonte: dict | None = None) -> dict:
    """Guarda um arquivo no banco (a partir de um temporário), prepara a versão leve e a miniatura e põe a descrição por
    IA na fila. `fonte`: de onde veio, quando não é um upload (ex.: captura de site). Devolve o item."""
    ext = Path(nome_original).suffix.lower()
    if ext not in EXT_VIDEO + EXT_IMAGEM:
        raise ValueError(f'Formato não aceito ({ext or "sem extensão"}): use MP4, MOV, WebM, PNG, JPG ou WebP')
    bid = uuid.uuid4().hex[:10]
    pasta = pasta_item(bid)
    pasta.mkdir(parents=True)
    arquivo = f'original{ext}'
    shutil.move(str(origem), pasta / arquivo)
    tipo = 'video' if ext in EXT_VIDEO else 'imagem'
    try:
        if tipo == 'video':
            info = midia.inspecionar(pasta / arquivo)
            _fazer_proxy(pasta / arquivo, pasta / 'proxy.mp4')
            midia.ffmpeg('-ss', str(min(1.0, (info.get('duracao') or 0) / 2)), '-i', str(pasta / 'proxy.mp4'), '-frames:v', '1',
                         '-vf', 'scale=-2:360', '-q:v', '4', str(pasta / 'miniatura.jpg'))
        else:
            info = midia.medidas(pasta / arquivo)
            midia.ffmpeg('-i', str(pasta / arquivo), '-vf', "scale='min(640,iw)':-2", '-q:v', '4', str(pasta / 'miniatura.jpg'))
    except Exception:
        shutil.rmtree(pasta, ignore_errors=True)
        raise
    item = salvar_item({
        'id': bid, 'nome': Path(nome_original).stem, 'descricao': '', 'palavras': [], 'tipo': tipo, 'arquivo': arquivo,
        'proxy': 'proxy.mp4' if tipo == 'video' else None, 'proxy_v': VERSAO_PROXY, 'largura': info.get('largura'), 'altura': info.get('altura'),
        'duracao': info.get('duracao') or 0.0, 'formato': formato_de(info.get('largura'), info.get('altura')),
        'origem': fonte or {'tipo': 'upload', 'nome_original': nome_original}, 'criado_em': datetime.now().isoformat(timespec='seconds'),
        'ia': {'status': 'fila', 'erro': None}})
    _descricoes.submit(descrever, bid)
    return item


def atualizar_item(bid: str, campos: dict) -> dict:
    item = comum.ler_json(pasta_item(bid) / 'item.json')
    if campos.get('nome') is not None:
        item['nome'] = str(campos['nome']).strip()[:200] or item['nome']
    if item.get('pai'):  # trecho: nome, início e fim (descrição e palavras são do original)
        if campos.get('inicio') is not None or campos.get('fim') is not None:
            ini, fim = _faixa(item['pai'], campos.get('inicio', item['inicio']), campos.get('fim', item['fim']))
            item.update(inicio=ini, fim=fim)
            (pasta_item(bid) / 'miniatura.jpg').unlink(missing_ok=True)
        salvar_item(item)
        return ler_item(bid)
    if campos.get('descricao') is not None:
        item['descricao'] = str(campos['descricao']).strip()[:2000]
    if campos.get('palavras') is not None:
        item['palavras'] = list(dict.fromkeys(str(p).strip().lower()[:40] for p in campos['palavras'] if str(p).strip()))[:30]
    salvar_item(item)
    return ler_item(bid)


# ---------------------------------------------------------------- trechos e corte do original

def _faixa(pai: str, inicio, fim) -> tuple[float, float]:
    original = ler_item(pai)
    if original.get('pai') or original['tipo'] != 'video':
        raise ValueError('Só vídeos originais têm trechos')
    ini, fim = round(max(float(inicio), 0.0), 3), round(min(float(fim), original['duracao']), 3)
    if fim - ini < MIN_TRECHO:
        raise ValueError(f'Trecho curto demais (mínimo {MIN_TRECHO} s)')
    return ini, fim


def criar_trecho(pai: str, inicio: float, fim: float, nome: str | None = None) -> dict:
    """Um trecho de um vídeo do banco (sem arquivo próprio: toca o original)."""
    ini, fim = _faixa(pai, inicio, fim)
    n = len(trechos_de(pai)) + 1
    tid = uuid.uuid4().hex[:10]
    pasta_item(tid).mkdir(parents=True)
    salvar_item({'id': tid, 'pai': pai, 'inicio': ini, 'fim': fim, 'nome': (nome or '').strip()[:200] or f'{ler_item(pai)["nome"]} · trecho {n}',
                 'criado_em': datetime.now().isoformat(timespec='seconds')})
    return ler_item(tid)


def cortar_original(bid: str, inicio: float, fim: float) -> dict:
    """Corta as pontas do vídeo original (em segundo plano: regrava em alta qualidade). Os trechos acompanham."""
    item = ler_item(bid)
    ini, fim = _faixa(bid, inicio, fim)
    if (item.get('edicao') or {}).get('status') == 'rodando':
        raise ValueError('Este vídeo já está sendo cortado')
    salvar_item({**comum.ler_json(pasta_item(bid) / 'item.json'), 'edicao': {'status': 'rodando', 'erro': None}})
    _cortes.submit(_cortar, bid, ini, fim)
    return ler_item(bid)


def _cortar(bid: str, ini: float, fim: float) -> None:
    pasta = pasta_item(bid)
    try:
        item = comum.ler_json(pasta / 'item.json')
        tmp = pasta / 'cortado.tmp.mp4'
        midia.ffmpeg('-ss', f'{ini:.3f}', '-to', f'{fim:.3f}', '-i', str(pasta / item['arquivo']), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium',
                     '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(tmp))
        (pasta / item['arquivo']).unlink(missing_ok=True)
        tmp.rename(pasta / 'original.mp4')
        for velho in ('proxy.mp4', 'miniatura.jpg', 'analise.mp4', 'tira.jpg'):
            (pasta / velho).unlink(missing_ok=True)
        info = midia.inspecionar(pasta / 'original.mp4')
        _fazer_proxy(pasta / 'original.mp4', pasta / 'proxy.mp4')
        dur = info.get('duracao') or (fim - ini)
        salvar_item({**item, 'arquivo': 'original.mp4', 'proxy': 'proxy.mp4', 'proxy_v': VERSAO_PROXY, 'duracao': dur, 'edicao': {'status': 'pronto', 'erro': None},
                     'cortes': [*(item.get('cortes') or []), {'inicio': ini, 'fim': fim, 'em': datetime.now().isoformat(timespec='seconds')}]})
        for t in trechos_de(bid):  # os trechos acompanham o novo começo; os que caem fora somem
            a, b = round(max(t['inicio'] - ini, 0.0), 3), round(min(t['fim'] - ini, dur), 3)
            if b - a < MIN_TRECHO:
                apagar_item(t['id'])
            else:
                salvar_item({**t, 'inicio': a, 'fim': b})
                (pasta_item(t['id']) / 'miniatura.jpg').unlink(missing_ok=True)
    except Exception as e:
        traceback.print_exc()
        try:
            salvar_item({**comum.ler_json(pasta / 'item.json'), 'edicao': {'status': 'erro', 'erro': str(e)[:300]}})
        except FileNotFoundError:
            pass


def tira(item: dict) -> Path:
    """Uma tira de quadros do vídeo (para a timeline do editor), gerada uma vez."""
    original = ler_item(item['pai']) if item.get('pai') else item
    arq = pasta_item(original['id']) / 'tira.jpg'
    if not arq.exists():
        n = 24
        midia.ffmpeg('-i', str(arquivo_para_tocar(original)), '-vf', f"fps={n / max(original['duracao'], 0.1):.5f},scale=-2:90,tile={n}x1",
                     '-frames:v', '1', '-q:v', '5', str(arq))
    return arq


def usos(bid: str) -> list[dict]:
    """Onde a mídia está ligada: projeto e insert (calculado lendo os projetos)."""
    out = []
    for resumo in projeto.listar():
        try:
            p = projeto.ler(resumo['id'])
        except FileNotFoundError:
            continue
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if any(m['banco'] == bid for m in x.get('midias') or []):
                out.append({'projeto': p['id'], 'nome': p['nome'], 'pedido': x['id'], 'fala': (x.get('fala') or '')[:120]})
    return out


def apagar_item(bid: str) -> None:
    """Apaga a mídia do banco (e os trechos dela) e a tira de todos os inserts que a usavam."""
    for t in trechos_de(bid):
        apagar_item(t['id'])
    for u in usos(bid):
        def tirar(p, pid=u['pedido']):
            for x in (p.get('inserts') or {}).get('pedidos', []):
                if x['id'] == pid:
                    x['midias'] = [m for m in x.get('midias') or [] if m['banco'] != bid]
        projeto.atualizar(u['projeto'], tirar)
    shutil.rmtree(pasta_item(bid), ignore_errors=True)


def arquivo_para_tocar(item: dict) -> Path:
    """O que o navegador toca ou mostra: a versão leve do vídeo, ou a imagem original (num trecho, a do original)."""
    return pasta_item(item.get('pai') or item['id']) / (item.get('proxy') or item['arquivo'])


def miniatura(item: dict) -> Path:
    """A miniatura (gerada na hora para os itens que não têm)."""
    arq = pasta_item(item['id']) / 'miniatura.jpg'
    if not arq.exists():
        origem = arquivo_para_tocar(item)
        if item['tipo'] == 'video':
            t = (item['inicio'] + item['fim']) / 2 if item.get('pai') else 0.5
            midia.ffmpeg('-ss', f'{t:.3f}', '-i', str(origem), '-frames:v', '1', '-vf', 'scale=-2:360', '-q:v', '4', str(arq))
        else:  # páginas inteiras são muito altas: a miniatura fica com o começo
            midia.ffmpeg('-i', str(origem), '-vf', "scale='min(640,iw)':-2,crop=iw:'min(ih,iw*2)':0:0", '-q:v', '4', str(arq))
    return arq


# ---------------------------------------------------------------- descrição por IA

class DescricaoMidia(BaseModel):
    descricao: str = Field(description='o que aparece, em 1 a 3 frases concretas: site/ferramenta/marca, textos legíveis importantes, o que acontece (no vídeo)')
    palavras: list[str] = Field(description='3 a 6 palavras-chave curtas, em minúsculas (ex.: "github", "landing page", "claude", "preços")')


PROMPT_DESCREVER = """Você cataloga mídias (vídeos e imagens) de um banco usado em inserts de vídeos curtos sobre IA, tecnologia e design. Descreva o que aparece nesta mídia para que ela seja achada depois por busca: o site, a ferramenta ou a marca, os textos legíveis que importam e, no vídeo, o que acontece. Concreto e curto. Português."""


def descrever(bid: str) -> None:
    """Em segundo plano: o modelo de visão descreve a mídia e sugere palavras-chave (o que o criador já escreveu fica)."""
    try:
        item = ler_item(bid)
        if item.get('pai'):  # trechos herdam a descrição do original
            return
        salvar_item({**item, 'ia': {'status': 'rodando', 'erro': None}})
        comum.carregar_env()
        config = projeto.ler_config()
        pasta = pasta_item(bid)
        if item['tipo'] == 'video':
            leve = pasta / 'analise.mp4'
            if not leve.exists():
                midia.ffmpeg('-i', str(arquivo_para_tocar(item)), '-t', '120', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '32',
                             '-preset', 'veryfast', '-vf', "fps=2,scale='if(gt(iw,ih),min(640,iw),-2)':'if(gt(iw,ih),-2,min(640,ih))'", str(leve))
            conteudo = comum.video(leve)
        else:
            leve = pasta / 'analise.jpg'
            if not leve.exists():
                midia.ffmpeg('-i', str(arquivo_para_tocar(item)), '-vf', "scale='min(1024,iw)':-2,crop=iw:'min(ih,4000)':0:0", '-q:v', '4', str(leve))
            conteudo = comum.imagem(leve)
        llm = comum.chat(config['modelo_direcao'], timeout_s=120, max_tokens=1500, raciocinio='low')
        r = llm.with_structured_output(DescricaoMidia, method='json_schema').invoke(
            [('system', PROMPT_DESCREVER), ('human', [{'type': 'text', 'text': f"Mídia: {item['nome']} ({item['tipo']})"}, conteudo])])
        item = comum.ler_json(pasta_item(bid) / 'item.json')  # o criador pode ter editado enquanto a IA trabalhava
        palavras = list(dict.fromkeys([*item.get('palavras', []), *(p.strip().lower() for p in r.palavras if p.strip())]))[:30]
        salvar_item({**item, 'descricao': item.get('descricao') or r.descricao.strip(), 'palavras': palavras,
                     'descricao_ia': r.descricao.strip(), 'ia': {'status': 'pronto', 'erro': None}})
    except FileNotFoundError:
        return
    except Exception as e:
        traceback.print_exc()
        try:
            salvar_item({**comum.ler_json(pasta_item(bid) / 'item.json'), 'ia': {'status': 'erro', 'erro': str(e)[:300]}})
        except FileNotFoundError:
            pass


def pedir_descricao(bid: str) -> dict:
    item = comum.ler_json(pasta_item(bid) / 'item.json')
    if item.get('pai'):
        raise ValueError('Trechos herdam a descrição do original')
    salvar_item({**item, 'ia': {'status': 'fila', 'erro': None}})
    _descricoes.submit(descrever, bid)
    return ler_item(bid)


def retomar_interrompidos() -> None:
    """Descrições e cortes que ficaram na fila ou rodando quando o servidor caiu."""
    for i in listar_banco():
        if (i.get('ia') or {}).get('status') in ('fila', 'rodando'):
            _descricoes.submit(descrever, i['id'])
        if (i.get('edicao') or {}).get('status') == 'rodando':
            salvar_item({**comum.ler_json(pasta_item(i['id']) / 'item.json'),
                         'edicao': {'status': 'erro', 'erro': 'Interrompido (o servidor reiniciou): corte de novo'}})


# ---------------------------------------------------------------- pedidos (a partir da direção)

def formato_do_plano(tipo: str) -> str:
    return 'vertical' if tipo == 'insert_tela_cheia' else 'dividida'


def chave(pl: dict) -> str:
    """Identidade de um pedido: mesmo tipo, mesmas palavras e mesma marcação = mesmo insert (sobrevive a versões novas)."""
    return '|'.join(str(pl.get(k) or '') for k in ('tipo', 'conteudo', 'palavra_ini', 'palavra_fim', 'descricao'))


def pedidos_da_direcao(itens: list[dict], saida: list[dict]) -> list[dict]:
    """Os planos com insert, em ordem, com a fala do bloco, a duração (do começo do plano ao começo do seguinte) e o
    insert da direção (narrativa e mídias pedidas)."""
    idx = {w['id']: k for k, w in enumerate(saida)}
    planos = sorted((i for i in itens if i['camada'] == 'plano' and i['palavra_ini'] in idx), key=lambda i: idx[i['palavra_ini']])
    fim_video = saida[-1]['saida_fim'] if saida else 0.0
    pedidos = []
    for n, pl in enumerate(planos):
        if not direcao.tem_insert(pl['tipo'], pl.get('conteudo')):
            continue
        k0 = idx[pl['palavra_ini']]
        k1 = (idx[planos[n + 1]['palavra_ini']] - 1) if n + 1 < len(planos) else len(saida) - 1
        t0 = 0.0 if n == 0 else saida[k0]['saida_ini']
        t1 = saida[idx[planos[n + 1]['palavra_ini']]]['saida_ini'] if n + 1 < len(planos) else fim_video
        pedidos.append({'plano': pl['id'], 'chave': chave(pl), 'tipo': pl['tipo'], 'conteudo': pl.get('conteudo'),
                        'palavra_ini': pl['palavra_ini'], 'palavra_fim': saida[k1]['id'], 'descricao': pl.get('descricao') or '',
                        'texto': pl.get('texto'), 'formato': formato_do_plano(pl['tipo']),
                        'fala': ' '.join(w['texto'] for w in saida[k0:k1 + 1]), 'inicio': round(t0, 3), 'duracao': round(max(t1 - t0, 0.3), 3)})
    return pedidos


def _midias_antigas(x: dict) -> list[dict]:
    """Pedidos do tempo do agente automático: o candidato escolhido de cada take vira uma mídia ligada."""
    out = []
    for tk in x.get('takes') or []:
        c = next((c for c in tk.get('candidatos') or [] if c['id'] == tk.get('escolhido')), None)
        if c and (pasta_item(c['banco']) / 'item.json').exists():
            out.append({'id': uuid.uuid4().hex[:8], 'banco': c['banco']})
    return out


def sincronizar(id: str) -> dict:
    """Os pedidos da versão aberta da direção; os que já existiam (mesma chave) continuam com as suas mídias."""
    p = projeto.ler(id)
    d = p.get('direcao') or {}
    if not d.get('itens'):
        raise ValueError('Gere a direção visual antes dos inserts')
    saida = direcao_projeto._palavras_mantidas(id, p)
    novos = pedidos_da_direcao(d['itens'], saida)

    def aplicar(p):
        antigos = {x['chave']: x for x in (p.get('inserts') or {}).get('pedidos', [])}
        pedidos = []
        for n in novos:
            velho = antigos.get(n['chave'])
            midias = (velho['midias'] if 'midias' in velho else _midias_antigas(velho)) if velho else []
            pedidos.append({'id': velho['id'] if velho else uuid.uuid4().hex[:8], **n, 'midias': midias,
                            **{k: velho[k] for k in ('capturas', 'captura') if velho and velho.get(k)}})
        p['inserts'] = {'versao': d.get('ativa'), 'pedidos': pedidos}
    return projeto.atualizar(id, aplicar)['inserts']


def definir_midias(id: str, pid: str, midias: list[dict]) -> dict:
    """A lista de mídias de um insert, em ordem: cada uma é um item do banco (original ou trecho)."""
    limpas = []
    for m in midias[:12]:
        bid = str(m.get('banco') or '')
        if not bid or not (pasta_item(bid) / 'item.json').exists():
            raise LookupError(f'Mídia não encontrada no banco: {bid}')
        limpas.append({'id': str(m.get('id') or uuid.uuid4().hex[:8]), 'banco': bid})

    def aplicar(p):
        for x in (p.get('inserts') or {}).get('pedidos', []):
            if x['id'] == pid:
                x['midias'] = limpas
                return
        raise LookupError('Pedido não encontrado')
    return projeto.atualizar(id, aplicar)['inserts']
