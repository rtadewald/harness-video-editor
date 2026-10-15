"""Os CTAs (docs/editor-claude.md, E10; Q20; porte do `ferramentas/ctas.py` do 19): trechos finais de vídeos já editados
(com legenda, motion e áudio prontos), que entram inteiros no fim de um orgânico e dão as saídas do projeto (📱 Reels
ManyChat, 📱 ManyChat TikTok, 💰 Ad LP, 💰 Ad VSL…). A entrada no fluxo de edição fica para depois (Q20).

Cada CTA mora em `biblioteca/ctas/<id>/`: `original.<ext>` (o vídeo editado inteiro), `proxy.mp4`, `miniatura.jpg`, `tira.jpg`
e `cta.json` {id, nome, categoria, produto, inicio, fim, duracao, largura, altura, favorito, fonte, arquivo, criado_em}.
`inicio`/`fim`: onde o CTA começa e termina no vídeo. As categorias (e a saída de cada uma) ficam em `categorias.json` e
os produtos em `produtos.json`; o favorito de cada categoria é o que entra por padrão."""
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from . import comum, midia

EXT = ('.mp4', '.mov', '.m4v', '.webm')
CATEGORIAS = [
    {'id': 'manychat-instagram', 'nome': 'ManyChat Instagram', 'saida': 'Reels ManyChat', 'emoji': '📱'},
    {'id': 'manychat-tiktok', 'nome': 'ManyChat TikTok/Shorts', 'saida': 'ManyChat TikTok', 'emoji': '📱'},
    {'id': 'lp', 'nome': 'Landing page', 'saida': 'Ad LP', 'emoji': '💰'},
    {'id': 'vsl', 'nome': 'VSL', 'saida': 'Ad VSL', 'emoji': '💰'},
    {'id': 'vsl-isca', 'nome': 'VSL-isca', 'saida': 'Ad VSL-isca', 'emoji': '💰'},
]
PRODUTOS = [{'id': 'claude', 'nome': 'Claude', 'emoji': '✴️'}, {'id': 'fia', 'nome': 'FIA', 'emoji': '🤖'}, {'id': 'fid', 'nome': 'FID', 'emoji': '🎨'}]


def raiz() -> Path:
    return comum.BIBLIOTECA / 'ctas'


def _ler(arq: Path, padrao):
    try:
        return comum.ler_json(arq)
    except (FileNotFoundError, ValueError):
        return padrao


def pasta(cid: str) -> Path:
    if not re.fullmatch(r'[0-9a-f]{10}', cid or ''):
        raise LookupError('CTA não encontrado')
    return raiz() / cid


def categorias() -> list[dict]:
    arq = raiz() / 'categorias.json'
    if not arq.exists():
        comum.salvar_json(arq, CATEGORIAS)
    return _ler(arq, CATEGORIAS) or CATEGORIAS


def produtos() -> list[dict]:
    arq = raiz() / 'produtos.json'
    if not arq.exists():
        comum.salvar_json(arq, PRODUTOS)
    return _ler(arq, PRODUTOS) or []


def salvar_produtos(lista: list[dict]) -> list[dict]:
    """A lista inteira (nome e emoji editados; um novo sem id ganha um). Um produto que sai, sai dos CTAs."""
    out, vistos = [], set()
    for p in lista:
        nome = str(p.get('nome') or '').strip()[:60]
        if not nome:
            continue
        pid = str(p.get('id') or '').strip()[:40] or uuid.uuid4().hex[:8]
        if pid in vistos:
            continue
        vistos.add(pid)
        out.append({'id': pid, 'nome': nome, 'emoji': str(p.get('emoji') or '').strip()[:8]})
    comum.salvar_json(raiz() / 'produtos.json', out)
    for c in todos():
        if c.get('produto') and c['produto'] not in vistos:
            salvar({**c, 'produto': None})
    return out


def ler(cid: str) -> dict:
    d = _ler(pasta(cid) / 'cta.json', None)
    if not d:
        raise LookupError('CTA não encontrado')
    return d


def salvar(c: dict) -> dict:
    comum.salvar_json(pasta(c['id']) / 'cta.json', c)
    return c


def todos() -> list[dict]:
    return sorted((_ler(a, {}) for a in raiz().glob('*/cta.json')), key=lambda c: c.get('criado_em') or '', reverse=True)


def _miniatura(cid: str, t: float) -> None:
    midia.ffmpeg('-ss', f'{max(t, 0):.3f}', '-i', str(pasta(cid) / 'proxy.mp4'), '-frames:v', '1', '-vf', 'scale=-2:360', '-q:v', '4',
                 str(pasta(cid) / 'miniatura.jpg'))


def adicionar(arquivo: Path, nome: str | None = None, categoria: str | None = None, fonte: str = 'upload') -> dict:
    """Guarda o vídeo (movido de um temporário), faz a versão leve e a miniatura (perto do fim: o CTA costuma estar lá)."""
    arquivo = Path(arquivo)
    if arquivo.suffix.lower() not in EXT:
        raise ValueError('Use um vídeo (MP4, MOV, M4V ou WebM)')
    if categoria and categoria not in {k['id'] for k in categorias()}:
        categoria = None
    cid = uuid.uuid4().hex[:10]
    p = raiz() / cid
    p.mkdir(parents=True)
    alvo = p / f'original{arquivo.suffix.lower()}'
    shutil.move(str(arquivo), alvo)
    try:
        info = midia.inspecionar(alvo)
        midia.ffmpeg('-i', str(alvo), '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", '-c:v', 'libx264',
                     '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', '-g', '12', '-keyint_min', '12', '-sc_threshold', '0',
                     '-c:a', 'aac', '-movflags', '+faststart', str(p / 'proxy.mp4'))
        dur = info.get('duracao') or 0.0
        _miniatura(cid, dur - 2)
    except Exception:
        shutil.rmtree(p, ignore_errors=True)
        raise
    return salvar({'id': cid, 'nome': (nome or arquivo.stem).strip()[:200], 'categoria': categoria, 'produto': None, 'inicio': 0.0,
                   'fim': round(dur, 3), 'duracao': round(dur, 3), 'largura': info.get('largura'), 'altura': info.get('altura'),
                   'favorito': False, 'fonte': fonte, 'arquivo': alvo.name, 'criado_em': datetime.now().isoformat(timespec='seconds')})


def editar(cid: str, dados: dict) -> dict:
    c = ler(cid)
    if str(dados.get('nome') or '').strip():
        c['nome'] = str(dados['nome']).strip()[:200]
    if 'categoria' in dados:
        if dados['categoria'] and dados['categoria'] not in {k['id'] for k in categorias()}:
            raise ValueError(f'Categoria desconhecida: {dados["categoria"]}')
        c['categoria'] = dados['categoria'] or None
        if c.get('favorito'):  # o favorito é da categoria: trocar de categoria tira
            c['favorito'] = False
    if 'produto' in dados:
        if dados['produto'] and dados['produto'] not in {p['id'] for p in produtos()}:
            raise ValueError(f'Produto desconhecido: {dados["produto"]}')
        c['produto'] = dados['produto'] or None
    if dados.get('inicio') is not None or dados.get('fim') is not None:
        ini = round(max(float(dados['inicio'] if dados.get('inicio') is not None else c['inicio']), 0.0), 3)
        fim = round(min(float(dados['fim'] if dados.get('fim') is not None else c['fim']), c['duracao']), 3)
        if fim - ini < 0.5:
            raise ValueError('O CTA precisa de pelo menos 0,5 s')
        c['inicio'], c['fim'] = ini, fim
        _miniatura(cid, (ini + fim) / 2)
    if dados.get('favorito'):  # um favorito por categoria
        for o in todos():
            if o['id'] != cid and o.get('categoria') == c.get('categoria') and o.get('favorito'):
                salvar({**o, 'favorito': False})
        c['favorito'] = True
    elif 'favorito' in dados:
        c['favorito'] = False
    return salvar(c)


def tira(cid: str) -> Path:
    """24 quadros numa linha: o fundo da linha do tempo de marcar o CTA."""
    c = ler(cid)
    alvo = pasta(cid) / 'tira.jpg'
    if not alvo.exists():
        midia.ffmpeg('-i', str(pasta(cid) / 'proxy.mp4'), '-vf', f'fps={24 / max(c["duracao"], 0.1):.6f},scale=-2:90,tile=24x1',
                     '-frames:v', '1', '-q:v', '5', str(alvo))
    return alvo


def apagar(cid: str) -> None:
    """Para `biblioteca/ctas/_lixeira/<id>-<data>` (dá para recuperar)."""
    ler(cid)
    (raiz() / '_lixeira').mkdir(exist_ok=True)
    shutil.move(str(pasta(cid)), str(raiz() / '_lixeira' / f'{cid}-{datetime.now():%Y%m%d-%H%M%S}'))
