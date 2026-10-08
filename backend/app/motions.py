"""Motions (SPEC §8.5): animações escritas por IA em HTML + CSS + GSAP (no estilo HyperFrames), tocadas ao vivo na prévia
e fotografadas quadro a quadro na exportação, como os inserts. Ficam numa biblioteca global (`motions/<id>/`), com versões
(v1, v2 ← v1…, como a Direção) e **campos** editáveis declarados pelo próprio motion (textos, cores): reaproveitar um
motion é copiá-lo e trocar os campos, sem IA. Usar num plano **copia** a versão e os valores para o projeto."""
import json
import re
import shutil
import subprocess
import tempfile
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

from . import comum, inserts, projeto, referencias

RAIZ = Path(__file__).resolve().parents[2] / 'motions'
FORMATOS = {'vertical': (1080, 1920), 'dividida': (1080, 960)}  # tela cheia 9:16; tela dividida: a metade de cima
QUADROS_REF = 6  # quadros de cada referência mandados à IA (ela vê imagens, não vídeo)

_fila = ThreadPoolExecutor(max_workers=2)
_trava = threading.Lock()

# a ficha de identidade padrão (neutra; a do criador fica nas Configurações, `identidade_motion`)
IDENTIDADE_PADRAO = """Extremamente minimalista: muito respiro, poucos elementos por vez, tipografia como protagonista.
Fontes: Inter (texto, pesos 400 a 700) e Instrument Serif (palavra de destaque, às vezes em itálico).
Movimentos curtos e elegantes, sempre com curvas suaves (nunca lineares); sombras sutis; cantos arredondados discretos."""

PROMPT_SISTEMA = """Você é um motion designer sênior que escreve motions curtos para vídeos verticais (Reels), em HTML + CSS + GSAP.

## Contrato técnico (obrigatório)
- Devolva UM bloco ```html com um FRAGMENTO (sem <html>, <head> ou <body>): <style>, a marcação e um <script>.
- O fragmento é posto dentro de `#palco`, um quadro de {largura}×{altura} px (já com position: relative e overflow: hidden). Desenhe nesse tamanho exato, em px.
- GSAP 3 já está carregado (`gsap`). Monte UMA timeline pausada e entregue-a: `const tl = gsap.timeline({{ paused: true }}); ... ; motion.pronto(tl)`.
- A timeline dura exatamente {duracao} s (use `tl.to({{}}, {{ duration: 0 }}, {duracao})` no fim se precisar fixar). O app controla o tempo: nada de setTimeout, requestAnimationFrame, CSS animation/transition, Date ou loops próprios — todo movimento vem da timeline.
- Fontes disponíveis: Inter (400, 500, 600, 700) e "Instrument Serif" (400, normal e itálico). Não carregue fontes nem scripts de fora.
- Dados da cena em `MOTION`: `MOTION.campos` (os valores dos campos), `MOTION.midias` (lista de {{url, tipo, largura, altura, nome, desde}}).
- Mídia em vídeo: `<video data-inicio="S" data-desde="{{MOTION.midias[i].desde}}" muted playsinline>` com src = a url; `data-inicio` é o instante da cena em que o vídeo começa a correr (o app posiciona o quadro certo; não chame play()). Imagem: `<img>` normal.
- Declare os **campos editáveis** (tudo que alguém trocaria para reaproveitar o motion: textos, nomes, cor de destaque) num `<script type="application/json" id="campos">` no topo, assim:
  {{"titulo": {{"tipo": "texto", "rotulo": "Título", "padrao": "Image to Code"}}, "destaque": {{"tipo": "cor", "rotulo": "Cor de destaque", "padrao": "#14b8a6"}}}}
  Tipos: "texto" e "cor". Leia sempre de `MOTION.campos.<nome>` (nunca escreva o texto direto na marcação). Textos digitados em tela (terminal, busca) também são campos.
- Fundo: se o pedido não disser outro, pinte o fundo do palco (é uma cena própria, opaca).

## Estilo
{identidade}

## Qualidade
- Composição limpa e centrada no que importa; nada encostando nas bordas (margem de pelo menos 6% do palco). Texto nunca cortado nem sobreposto.
- Tamanhos para celular: título de 90 a 150 px, texto de apoio de 40 a 60 px.
- Ritmo: entradas de 0,4 a 0,8 s; cada elemento entra, respira e só sai se o roteiro pedir. Curvas: "expo.out", "power3.out", "power2.inOut" (nunca "none"/linear).
- Responda só com o bloco ```html."""

PROMPT_CONFERIR = """Estes são quadros do motion que você escreveu (em ordem, nos instantes indicados). Confira: texto cortado ou fora do palco,
elementos sobrepostos sem querer, coisas encostando nas bordas, palco vazio onde deveria haver conteúdo, quebra do estilo pedido,
movimento que não aparece. Se estiver bom, responda exatamente OK. Se não, devolva o fragmento inteiro corrigido num bloco ```html
(mesmo contrato)."""


# ---------------------------------------------------------------- biblioteca

def pasta(mid: str) -> Path:
    if not re.fullmatch(r'[0-9a-f]{10}', mid or ''):
        raise FileNotFoundError(mid)
    return RAIZ / mid


def ler(mid: str) -> dict:
    return comum.ler_json(pasta(mid) / 'motion.json')


def salvar(m: dict) -> dict:
    comum.salvar_json(pasta(m['id']) / 'motion.json', m)
    return m


def atualizar(mid: str, mudar) -> dict:
    with _trava:
        m = ler(mid)
        mudar(m)
        return salvar(m)


def listar() -> list[dict]:
    """A biblioteca, favoritos primeiro e depois os mais novos (sem o código das versões)."""
    if not RAIZ.exists():
        return []
    out = []
    for arq in RAIZ.glob('*/motion.json'):
        try:
            out.append(comum.ler_json(arq))
        except ValueError:
            continue
    out.sort(key=lambda m: m.get('criado_em', ''), reverse=True)
    return sorted(out, key=lambda m: not m.get('favorito'))  # estável: os favoritos sobem, cada grupo do mais novo ao mais velho


def html_da_versao(mid: str, n: int) -> str:
    return (pasta(mid) / f'v{n}.html').read_text(encoding='utf-8')


def campos_de(fragmento: str) -> dict:
    """Os campos que o motion declara (`<script type="application/json" id="campos">`)."""
    m = re.search(r'<script[^>]*id=["\']campos["\'][^>]*>(.*?)</script>', fragmento, re.S)
    if not m:
        return {}
    try:
        d = json.loads(m.group(1))
    except ValueError:
        return {}
    return {k: {'tipo': v.get('tipo') if v.get('tipo') in ('texto', 'cor') else 'texto', 'rotulo': str(v.get('rotulo') or k), 'padrao': v.get('padrao', '')}
            for k, v in d.items() if isinstance(v, dict)}


class Referencia(BaseModel):
    ref: str
    inicio: float
    fim: float
    tipo: str = ''
    descricao: str = ''
    texto: str | None = None


class Pedido(BaseModel):
    nome: str = Field(default='Motion', max_length=120)
    formato: str = 'vertical'
    duracao: float = Field(default=3.0, ge=0.5, le=30)
    prompt: str = Field(min_length=1, max_length=4000)
    referencias: list[Referencia] = []
    midias: list[str] = []  # ids do banco


def criar(pedido: Pedido) -> dict:
    if pedido.formato not in FORMATOS:
        raise ValueError('Formato inválido')
    mid = uuid.uuid4().hex[:10]
    m = {'id': mid, 'nome': pedido.nome.strip() or 'Motion', 'formato': pedido.formato, 'duracao': round(pedido.duracao, 3),
         'criado_em': datetime.now().isoformat(timespec='seconds'), 'favorito': False, 'pedido': pedido.model_dump(),
         'versoes': [], 'ativa': None, 'valores': {}, 'status': {'estado': 'fila', 'erro': None, 'etapa': None}}
    salvar(m)
    _fila.submit(_gerar, mid, None, None)
    return m


def corrigir(mid: str, de: int, comentario: str) -> dict:
    """Uma versão nova a partir da `de`, com o comentário do criador."""
    def mudar(m):
        if m['status']['estado'] in ('fila', 'gerando'):
            raise ValueError('Este motion já está gerando uma versão')
        if not any(v['n'] == de for v in m['versoes']):
            raise ValueError('Versão não encontrada')
        m['status'] = {'estado': 'fila', 'erro': None, 'etapa': None}
    m = atualizar(mid, mudar)
    _fila.submit(_gerar, mid, de, comentario.strip())
    return m


def editar(mid: str, campos: dict) -> dict:
    """Nome, favorito, versão aberta e valores dos campos (o que não vem fica)."""
    def mudar(m):
        if 'nome' in campos and str(campos['nome']).strip():
            m['nome'] = str(campos['nome']).strip()[:120]
        if 'favorito' in campos:
            m['favorito'] = bool(campos['favorito'])
        if 'ativa' in campos and any(v['n'] == campos['ativa'] for v in m['versoes']):
            m['ativa'] = campos['ativa']
        if 'valores' in campos and isinstance(campos['valores'], dict):
            m['valores'] = {k: str(v)[:500] for k, v in campos['valores'].items()}
    return atualizar(mid, mudar)


def apagar(mid: str) -> None:
    shutil.rmtree(pasta(mid), ignore_errors=True)


def retomar_interrompidos() -> None:
    for m in listar():
        if m['status']['estado'] in ('fila', 'gerando'):
            atualizar(m['id'], lambda x: x.__setitem__('status', {'estado': 'erro', 'erro': 'Interrompido (o servidor reiniciou): gere de novo', 'etapa': None}))


# ---------------------------------------------------------------- a página do motion (prévia, exportação e conferência)

def _midias(ids: list[str], exportacao: bool) -> list[dict]:
    out = []
    for bid in ids:
        try:
            i = inserts.ler_item(bid)
        except (FileNotFoundError, ValueError):
            continue
        url = f'/api/banco/{bid}/arquivo' + ('?qualidade=exportacao' if exportacao else '')
        out.append({'url': url, 'tipo': i['tipo'], 'largura': i.get('largura'), 'altura': i.get('altura'), 'nome': i.get('nome', ''),
                    'desde': i.get('inicio') or 0})
    return out


def documento(fragmento: str, formato: str, duracao: float, valores: dict, midias: list[str], exportacao: bool = False) -> str:
    """O HTML completo de um motion: o palco no tamanho do formato, as fontes, o GSAP, os dados (`MOTION`) e o runtime."""
    w, h = FORMATOS.get(formato, FORMATOS['vertical'])
    campos = campos_de(fragmento)
    dados = {'duracao': duracao, 'largura': w, 'altura': h, 'campos': {k: valores.get(k, c['padrao']) for k, c in campos.items()},
             'midias': _midias(midias, exportacao)}
    js = json.dumps(dados, ensure_ascii=False).replace('</', '<\\/')
    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="/motion/fonts.css">
<style>html,body{{margin:0;padding:0;background:transparent;overflow:hidden}}#palco{{position:relative;width:{w}px;height:{h}px;overflow:hidden;font-family:Inter,sans-serif}}</style>
<script>window.MOTION={js}</script>
<script src="/motion/gsap.min.js"></script>
<script src="/motion/runtime.js"></script>
</head><body><div id="palco">
{fragmento}
</div></body></html>"""


def pagina(mid: str, n: int | None, exportacao: bool = False) -> str:
    m = ler(mid)
    n = n or m.get('ativa')
    if not n:
        raise LookupError('Motion ainda sem versão')
    return documento(html_da_versao(mid, n), m['formato'], m['duracao'], m.get('valores') or {}, m['pedido'].get('midias') or [], exportacao)


# ---------------------------------------------------------------- geração

def _fragmento(resposta: str) -> str | None:
    m = re.search(r'```html\s*(.*?)```', resposta, re.S)
    if m:
        return m.group(1).strip()
    return resposta.strip() if '<script' in resposta and 'motion.pronto' in resposta else None


def _texto(r) -> str:
    c = r.content
    return c if isinstance(c, str) else ''.join(x.get('text', '') for x in c if isinstance(x, dict))


def _quadros_referencia(r: dict, tmp: Path, k: int) -> list[Path]:
    proxy = referencias.RAIZ / r['ref'] / 'proxy.mp4'
    if not proxy.exists():
        return []
    out = []
    for j in range(QUADROS_REF):
        t = r['inicio'] + (r['fim'] - r['inicio']) * (j + 0.5) / QUADROS_REF
        arq = tmp / f'ref{k}_{j}.jpg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(proxy), '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', str(arq)],
                       capture_output=True)
        if arq.exists():
            out.append(arq)
    return out


def _exemplos(sem: str) -> list[tuple[str, str]]:
    """Os motions favoritos da biblioteca, em código, como exemplos de estilo (no máximo 2, cortados)."""
    out = []
    for m in listar():
        if m.get('favorito') and m['id'] != sem and m.get('ativa'):
            try:
                out.append((m['nome'], html_da_versao(m['id'], m['ativa'])[:7000]))
            except FileNotFoundError:
                continue
        if len(out) == 2:
            break
    return out


def fotografar(doc: str, formato: str, instantes: list[float], destino: Path) -> list[Path]:
    """Abre o motion no Chromium escondido e fotografa os instantes pedidos (conferência e miniatura)."""
    from playwright.sync_api import sync_playwright

    w, h = FORMATOS[formato]
    tmp_html = destino / 'pagina.html'
    tmp_html.write_text(doc, encoding='utf-8')
    fotos = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chromium', args=['--force-color-profile=srgb', '--hide-scrollbars'])
        try:
            page = browser.new_page(viewport={'width': w // 2, 'height': h // 2}, device_scale_factor=1)
            # a página precisa das fontes, do GSAP e do runtime do front: vai pela rota de rascunho, servida pelo backend
            page.route('**/__rascunho__', lambda rota: rota.fulfill(status=200, content_type='text/html', body=doc))
            page.goto(f'{comum.FRONT}/__rascunho__', wait_until='load', timeout=30_000)
            page.evaluate(f'() => {{ document.documentElement.style.zoom = "0.5" }}')
            for k, t in enumerate(instantes):
                page.evaluate('(t) => window.__ir(t)', t)
                arq = destino / f'q{k}.jpg'
                page.screenshot(path=str(arq), type='jpeg', quality=80)
                fotos.append(arq)
        finally:
            browser.close()
    return fotos


def _gerar(mid: str, de: int | None, comentario: str | None) -> None:
    def status(**kw):
        atualizar(mid, lambda m: m['status'].update(kw))
    inicio = time.time()
    tmp = Path(tempfile.mkdtemp(prefix='motion-'))
    try:
        status(estado='gerando', etapa='escrevendo')
        comum.carregar_env()
        config = projeto.ler_config()
        m = ler(mid)
        p = m['pedido']
        w, h = FORMATOS[m['formato']]
        sistema = PROMPT_SISTEMA.format(largura=w, altura=h, duracao=m['duracao'], identidade=config.get('identidade_motion') or IDENTIDADE_PADRAO)
        partes: list[dict] = [{'type': 'text', 'text': f"## Pedido\n{p['prompt']}\n\nPalco: {w}×{h} px ({'tela cheia 9:16' if m['formato'] == 'vertical' else 'metade de cima da tela, com o apresentador embaixo'}). Duração: {m['duracao']} s."}]
        for k, r in enumerate(p.get('referencias') or []):
            fotos = _quadros_referencia(r, tmp, k)
            partes.append({'type': 'text', 'text': f"## Referência {k + 1} (siga o estilo e o tipo de movimento)\n{r.get('descricao', '')}" + (f"\nTexto em tela: {r['texto']}" if r.get('texto') else '') + f"\nDuração: {r['fim'] - r['inicio']:.1f} s; {len(fotos)} quadros em ordem:"})
            partes += [comum.imagem(f) for f in fotos]
        for k, md in enumerate(_midias(p.get('midias') or [], False)):
            partes.append({'type': 'text', 'text': f"## Mídia MOTION.midias[{k}]: {md['nome']} ({md['tipo']}, {md['largura']}×{md['altura']})"})
            try:
                partes.append(comum.imagem(inserts.miniatura(inserts.ler_item((p.get('midias') or [])[k]))))
            except Exception:
                pass
        for nome, codigo in _exemplos(mid):
            partes.append({'type': 'text', 'text': f"## Exemplo de um motion aprovado (estilo da casa): {nome}\n```html\n{codigo}\n```"})
        if de:
            partes.append({'type': 'text', 'text': f"## Versão anterior (v{de}) — corrija só o necessário\n```html\n{html_da_versao(mid, de)}\n```\n\n## Comentário do criador\n{comentario}"})
        llm = comum.chat(config.get('modelo_motion') or projeto.MODELO_MOTION, timeout_s=420, max_tokens=24000)
        mensagens = [('system', sistema), ('human', partes)]
        resposta = _texto(llm.invoke(mensagens))
        frag = _fragmento(resposta)
        if not frag:
            raise RuntimeError('A IA não devolveu o motion no formato esperado')

        # conferência: a IA vê 4 quadros do que escreveu e corrige
        status(etapa='conferindo')
        instantes = [round(m['duracao'] * x, 2) for x in (0.15, 0.4, 0.7, 0.97)]
        fotos = fotografar(documento(frag, m['formato'], m['duracao'], {}, p.get('midias') or []), m['formato'], instantes, tmp)
        conferir = [{'type': 'text', 'text': PROMPT_CONFERIR}] + [x for t, f in zip(instantes, fotos) for x in ({'type': 'text', 'text': f'{t} s:'}, comum.imagem(f))]
        revisao = _texto(llm.invoke(mensagens + [('ai', resposta), ('human', conferir)]))
        if revisao.strip() != 'OK' and (novo := _fragmento(revisao)):
            frag = novo

        # a versão nova e a miniatura
        status(etapa='finalizando')
        m = ler(mid)
        n = max((v['n'] for v in m['versoes']), default=0) + 1
        (pasta(mid) / f'v{n}.html').write_text(frag, encoding='utf-8')
        mini = fotografar(documento(frag, m['formato'], m['duracao'], m.get('valores') or {}, p.get('midias') or []), m['formato'], [round(m['duracao'] * 0.7, 2)], tmp)
        shutil.copy(mini[0], pasta(mid) / f'v{n}.jpg')

        def gravar(x):
            x['versoes'].append({'n': n, 'de': de, 'comentario': comentario, 'campos': campos_de(frag), 'criado_em': datetime.now().isoformat(timespec='seconds'),
                                 'modelo': config.get('modelo_motion') or projeto.MODELO_MOTION, 'segundos': round(time.time() - inicio)})
            x['ativa'] = n
            x['status'] = {'estado': 'pronto', 'erro': None, 'etapa': None}
        atualizar(mid, gravar)
    except Exception as e:
        traceback.print_exc()
        try:
            status(estado='erro', erro=str(e)[:300], etapa=None)
        except FileNotFoundError:
            pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- o motion de um plano (cópia no projeto)

def pasta_plano(pid: str) -> Path:
    return projeto.pasta(pid) / 'motions'


def usar(pid: str, plano: str, mid: str, n: int | None, valores: dict | None) -> dict:
    """Copia a versão (e os valores dos campos) para o plano: mudar o original depois não muda o vídeo."""
    m = ler(mid)
    n = n or m.get('ativa')
    if not n:
        raise ValueError('Motion ainda sem versão')
    frag = html_da_versao(mid, n)
    destino = pasta_plano(pid)
    destino.mkdir(exist_ok=True)
    (destino / f'{plano}.html').write_text(frag, encoding='utf-8')
    shutil.copy(pasta(mid) / f'v{n}.jpg', destino / f'{plano}.jpg')
    info = {'origem': mid, 'versao': n, 'nome': m['nome'], 'formato': m['formato'], 'duracao': m['duracao'], 'campos': campos_de(frag),
            'valores': {k: str(v)[:500] for k, v in (valores if valores is not None else m.get('valores') or {}).items()},
            'midias': m['pedido'].get('midias') or [], 'usado_em': datetime.now().isoformat(timespec='seconds')}
    projeto.atualizar(pid, lambda p: p.setdefault('motions', {}).__setitem__(plano, info))
    return info


def valores_no_plano(pid: str, plano: str, valores: dict) -> dict:
    def mudar(p):
        x = (p.get('motions') or {}).get(plano)
        if not x:
            raise LookupError('Este plano não tem motion')
        x['valores'] = {k: str(v)[:500] for k, v in valores.items()}
    return projeto.atualizar(pid, mudar)['motions'][plano]


def tirar_do_plano(pid: str, plano: str) -> None:
    projeto.atualizar(pid, lambda p: (p.get('motions') or {}).pop(plano, None))
    for ext in ('html', 'jpg'):
        (pasta_plano(pid) / f'{plano}.{ext}').unlink(missing_ok=True)


def pagina_do_plano(pid: str, plano: str, duracao: float | None, exportacao: bool = False) -> str:
    """O motion do plano; `duracao` é a do plano agora (se a direção mudou o tempo, a animação estica ou encolhe)."""
    x = (projeto.ler(pid).get('motions') or {}).get(plano)
    if not x:
        raise LookupError('Este plano não tem motion')
    frag = (pasta_plano(pid) / f'{plano}.html').read_text(encoding='utf-8')
    return documento(frag, x['formato'], duracao or x['duracao'], x.get('valores') or {}, x.get('midias') or [], exportacao)
