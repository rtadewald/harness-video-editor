"""Direção visual (SPEC §8.2): análise das referências, edição da revisão e estatísticas.

Análise de uma referência (vídeo já editado):
1. proxy 720p, áudio, silêncios e transcrição (motor padrão do app);
2. detector de cena (PySceneDetect, adaptativo) acha os cortes com precisão de quadro;
3. a LLM multimodal analisa cada trecho entre cortes, em paralelo, vendo quadros (2/s) com o tempo de cada um, a fala
   do trecho e a transcrição inteira como contexto; devolve planos-base e elementos dentro das categorias fixas;
4. o código monta os itens: junta trechos que continuam o mesmo conteúdo, prende os tempos às palavras e tira miniaturas.
"""
import base64
import json
import statistics
import subprocess
import tempfile
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from . import midia, motores, projeto, referencias, transcricao

PLANOS = {'full_ator': 'Full ator', 'insert_tela_cheia': 'Insert tela cheia', 'motion_tela_cheia': 'Motion tela cheia',
          'tela_dividida': 'Tela dividida'}
ELEMENTOS = {'lettering': 'Lettering', 'palavra_manychat': 'Palavra ManyChat', 'caixinha_perguntas': 'Caixinha de perguntas',
             'print_sobreposto': 'Print/imagem sobreposta'}
PASSOS = ['proxy', 'transcricao', 'cenas', 'analise', 'montagem']
MAX_QUADROS = 40  # por trecho; trechos longos (fala corrida) são amostrados com menos quadros por segundo
ALTURA_QUADRO = 384  # até 384 px o Gemini cobra 258 tokens por imagem; acima disso divide em blocos (~4× mais)
PARALELO = 2
MIN_PLANO = 0.1
ENV = Path(__file__).resolve().parents[1] / '.env'

_fila = ThreadPoolExecutor(max_workers=1)  # uma referência por vez; os trechos de cada uma vão em paralelo
_sem_credito = [False]  # o OpenRouter recusou por falta de crédito: a fila pausa até alguém pedir de novo
SEM_CREDITO = 'Sem crédito no OpenRouter: a fila de análise pausou. Adicione créditos e clique em “Tentar de novo” (o que já foi analisado é reaproveitado).'


class SemCredito(RuntimeError):
    pass


def _falta_credito(e: Exception) -> bool:
    t = str(e).lower()
    return 'credit' in t or '402' in t


# ---------------------------------------------------------------- resposta da LLM (saída estruturada)

class PlanoIA(BaseModel):
    tipo: Literal['full_ator', 'insert_tela_cheia', 'motion_tela_cheia', 'tela_dividida']
    conteudo_em_cima: Literal['insert', 'motion'] | None = Field(description='Só para tela_dividida: o que ocupa a parte de cima')
    inicio: float = Field(description='Segundos do vídeo (use os tempos t= dos quadros)')
    fim: float
    descricao: str = Field(description='O que aparece na tela, objetivo, citando ferramentas/sites/textos visíveis')
    funcao: str = Field(description='Por que isso entra neste momento da fala, em uma frase')


class ElementoIA(BaseModel):
    tipo: Literal['lettering', 'palavra_manychat', 'caixinha_perguntas', 'print_sobreposto']
    inicio: float
    fim: float
    texto: str | None = Field(description='Texto exato do elemento, quando houver')
    descricao: str
    funcao: str


class AnaliseTrecho(BaseModel):
    continua_anterior: bool = Field(description='O primeiro plano continua o MESMO conteúdo do quadro de contexto anterior')
    planos: list[PlanoIA] = Field(min_length=1)
    elementos: list[ElementoIA]


PROMPT = """Você analisa um Reel vertical JÁ EDITADO de Rodrigo Tadewald (Asimov Academy, IA e programação) para descobrir como ele foi dirigido visualmente: o que aparece na tela em cada momento da fala.

Você recebe UM trecho entre dois cortes de cena: quadros em mosaico com o tempo de cada um escrito no canto (t= em segundos do vídeo), a fala desse trecho com tempos e, como contexto, a transcrição inteira e um quadro antes e um depois do trecho.

PLANOS-BASE (um por vez; cobrem o trecho inteiro, sem buracos):
- full_ator: o apresentador ocupa a tela (com ou sem coisas pequenas por cima). Zoom/reenquadramento no apresentador continua sendo full_ator.
- insert_tela_cheia: material ilustrativo REAL ocupa a tela toda, sem o apresentador: gravação de tela, site, app, print, foto, vídeo de apoio.
- motion_tela_cheia: peça gráfica ANIMADA criada para o vídeo ocupa a tela toda, sem o apresentador: logos animados, mockups estilizados, textos e formas animadas, infográficos.
- tela_dividida: o apresentador aparece JUNTO com um insert ou motion. Normalmente o conteúdo fica em cima e o apresentador embaixo; se o apresentador estiver numa janela menor sobre o conteúdo, também é tela_dividida (diga "apresentador em janela" na descrição). Preencha conteudo_em_cima com "insert" ou "motion".
Insert × motion: insert é a captura de algo que existe (tela, site, print, filmagem), mesmo com zoom ou destaque simples; motion é uma peça gráfica animada produzida.

ELEMENTOS (sobrepostos ao plano; podem durar menos que ele):
- lettering: texto grande de destaque com uma palavra ou expressão-chave (ex.: um título "Humanizer").
- palavra_manychat: chamada para comentar uma palavra (CTA de ManyChat, ex.: Comente "PROMPT").
- caixinha_perguntas: caixinha de perguntas do Instagram (pergunta de seguidor) na tela.
- print_sobreposto: print, imagem ou logo pequeno sobre o plano, sem tomar a tela.

IGNORE a legenda palavra a palavra queimada no vídeo (texto curto que acompanha a fala, uma ou poucas palavras por vez): ela é outra etapa e NÃO é lettering.
Se o texto em destaque É o próprio motion em tela cheia (ex.: uma animação tipográfica sem o apresentador), ele já é o plano motion_tela_cheia: não crie um lettering repetindo-o. Lettering é texto SOBRE outro plano.

Regras:
- Use as categorias acima e nenhuma outra. Tempos sempre dentro do trecho, a partir dos t= dos quadros.
- Normalmente o trecho tem UM plano. Só devolva mais de um se o layout claramente muda dentro do trecho.
- descricao: o que aparece, objetivo, em português, citando nomes de ferramentas, sites e textos visíveis.
- funcao: por que aquilo entra naquele momento, relacionando com o que está sendo dito (ex.: "mostra a ferramenta logo que ela é citada", "prova o resultado prometido", "reforça o CTA").
- continua_anterior: true só se o primeiro plano do trecho mostra o MESMO conteúdo do quadro de contexto anterior (mesma tela/insert/motion, só mudou zoom ou posição)."""


# ---------------------------------------------------------------- fila

def enfileirar(id: str) -> None:
    _sem_credito[0] = False  # pedir de novo é sinal de que o crédito voltou
    def marcar(r):
        r['status'] = 'na_fila'
        r['erro'] = None
        r['analise'] = {'passos': {p: {'status': 'pendente'} for p in PASSOS}}
    referencias.atualizar(id, marcar)
    _fila.submit(_rodar, id)


def retomar_interrompidas() -> None:
    """Recomeça o que ficou na fila ou no meio, dos vídeos mais curtos para os mais longos."""
    for r in sorted(referencias.listar(), key=lambda r: r['video']['duracao']):
        if r['status'] in ('na_fila', 'analisando'):
            enfileirar(r['id'])


def _passo(id: str, nome: str, **campos) -> None:
    referencias.atualizar(id, lambda r: r.setdefault('analise', {'passos': {}})['passos'].setdefault(nome, {}).update(campos))


def _rodar(id: str) -> None:
    import time
    try:
        base = referencias.pasta(id)
    except FileNotFoundError:  # apagada enquanto esperava
        return
    if _sem_credito[0]:
        referencias.atualizar(id, lambda r: r.update(status='erro', erro=SEM_CREDITO))
        return
    referencias.atualizar(id, lambda r: r.update(status='analisando'))
    passo = None
    try:
        for passo, f in [('proxy', _proxy), ('transcricao', _transcricao), ('cenas', _cenas), ('analise', _analise), ('montagem', _montagem)]:
            _passo(id, passo, status='rodando')
            t = time.time()
            extra = f(id, base) or {}
            _passo(id, passo, status='pronto', segundos=round(time.time() - t, 1), **extra)
        referencias.atualizar(id, lambda r: r.update(status='a_revisar'))
    except FileNotFoundError:
        return
    except Exception as e:
        if isinstance(e, SemCredito) or _falta_credito(e):
            _sem_credito[0] = True
            msg = SEM_CREDITO
        else:
            traceback.print_exc()
            msg = f'{passo}: {str(e)[:300]}'
        try:
            _passo(id, passo, status='erro')
            referencias.atualizar(id, lambda r: r.update(status='erro', erro=msg))
        except FileNotFoundError:
            pass


# ---------------------------------------------------------------- passos

def _video(base: Path) -> Path:
    return next(p for p in base.iterdir() if p.stem == 'video')


def _proxy(id: str, base: Path):
    destino = base / 'proxy.mp4'
    if destino.exists():
        return {'reaproveitado': True}
    dur = referencias.ler(id)['video']['duracao']
    ultimo = [0.0]

    def progresso(f):
        if f - ultimo[0] >= 0.1:
            ultimo[0] = f
            _passo(id, 'proxy', progresso=round(f, 2))
    import os
    tmp = base / f'proxy.{os.getpid()}.{threading.get_ident()}.tmp.mp4'  # único: um ffmpeg órfão (servidor reiniciado) não escreve no mesmo arquivo
    midia.proxy(_video(base), tmp, dur, progresso)
    tmp.replace(destino)


def transcrever(audio: Path, silencios: list[dict]) -> tuple[list[dict], str]:
    """Usa o motor padrão do app; se for o ElevenLabs e falhar (ou sem chave), cai no Whisper + stable-ts."""
    load_dotenv(ENV, override=True)
    vid = projeto.ler_config()['motor_padrao']
    if vid == 'elevenlabs':
        try:
            return motores.transcrever_elevenlabs(audio), vid
        except Exception:
            traceback.print_exc()
    elif vid not in ('whisper-stable', 'whisper', 'whisper-qwen', 'whisper-ctc'):
        try:
            return motores.rodar(vid, audio, None, silencios), vid
        except Exception:
            traceback.print_exc()
    palavras = transcricao.transcrever(audio, silencios)
    return transcricao.refinar(audio, palavras)[0], projeto.LEGADO


def _transcricao(id: str, base: Path):
    if (base / 'palavras.json').exists():
        return {'reaproveitado': True}
    audio = base / 'audio.wav'
    midia.extrair_audio(_video(base), audio)
    silencios = midia.silencios(audio)
    (base / 'silencios.json').write_text(json.dumps({'silencios': silencios}), encoding='utf-8')
    palavras, motor = transcrever(audio, silencios)
    (base / 'palavras.json').write_text(json.dumps({'motor': motor, 'palavras': palavras}, ensure_ascii=False, indent=1), encoding='utf-8')
    return {'motor': motor, 'palavras': len(palavras)}


def detectar_cortes(video: Path) -> list[float]:
    """Cortes duros de cena, em segundos (sem o 0)."""
    from scenedetect import AdaptiveDetector, detect

    return [round(a.seconds, 3) for a, _ in detect(str(video), AdaptiveDetector())][1:]


def _cenas(id: str, base: Path):
    dur = referencias.ler(id)['video']['duracao']
    cortes = [t for t in detectar_cortes(base / 'proxy.mp4') if 0.05 < t < dur - 0.05]
    (base / 'cenas.json').write_text(json.dumps({'cortes': cortes}), encoding='utf-8')
    return {'trechos': len(cortes) + 1}


def trechos(cortes: list[float], duracao: float) -> list[tuple[float, float]]:
    bordas = [0.0, *cortes, duracao]
    return [(a, b) for a, b in zip(bordas, bordas[1:]) if b - a > 0.02]


FONTE = '/System/Library/Fonts/Supplemental/Arial.ttf'
MOSAICO = (3, 2)  # quadros por imagem: o Gemini cobra ~1.100 tokens por imagem, qualquer que seja o tamanho


def _mosaicos(video: Path, a: float, b: float, fps: float, pasta: Path) -> list[Path]:
    """Quadros do trecho [a, b) agrupados em mosaicos de 3×2, cada quadro com o seu tempo no vídeo escrito no canto
    (t=segundos). Bem mais barato que mandar um quadro por imagem."""
    d = b - a
    fps = min(fps, MAX_QUADROS / max(d, 0.01))
    tempo = "t=%{expr\\:t+" + f"{a:.3f}" + "}"
    vf = (f'trim=end={d:.3f},fps={fps:.4f},scale=-2:{ALTURA_QUADRO},'
          f"drawtext=fontfile={FONTE}:text='{tempo}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=4,"
          f'tile={MOSAICO[0]}x{MOSAICO[1]}:padding=4:color=black')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-i', str(video), '-t', f'{d + 0.5:.3f}', '-vf', vf,
                    '-q:v', '4', str(pasta / '%03d.jpg')], check=True)
    return sorted(pasta.glob('*.jpg'))


def quadro(video: Path, t: float, destino: Path, altura: int = ALTURA_QUADRO) -> Path:
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{max(t, 0):.3f}', '-i', str(video), '-frames:v', '1',
                    '-vf', f'scale=-2:{altura}', '-q:v', '4', str(destino)], check=True)
    return destino


def _imagem(arq: Path) -> dict:
    return {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(arq.read_bytes()).decode()}}


def _fala(palavras: list[dict], a: float, b: float) -> str:
    dentro = [w for w in palavras if w['fim'] > a and w['inicio'] < b]
    return ' '.join(f"{w['texto']}[{w['inicio']:.2f}]" for w in dentro) or '(sem fala)'


def analisar_trecho(video: Path, palavras: list[dict], n: int, a: float, b: float, duracao: float, config: dict) -> dict:
    from langchain_openrouter import ChatOpenRouter

    texto_inteiro = ' '.join(w['texto'] for w in palavras)
    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        (pasta / 'q').mkdir()
        conteudo: list[dict] = [{'type': 'text', 'text': (
            f'TRANSCRIÇÃO INTEIRA DO VÍDEO (contexto): {texto_inteiro}\n\n'
            f'TRECHO {n + 1}: de {a:.2f} s a {b:.2f} s (vídeo de {duracao:.1f} s).\n'
            f'FALA NESTE TRECHO (palavra[início em s]): {_fala(palavras, a, b)}')}]
        if a > 0.05:
            conteudo += [{'type': 'text', 'text': f'QUADRO DE CONTEXTO ANTERIOR (t={max(a - 0.15, 0):.2f}, antes do trecho):'},
                         _imagem(quadro(video, a - 0.15, pasta / 'antes.jpg'))]
        conteudo.append({'type': 'text', 'text': (
            f"QUADROS DO TRECHO ({config['quadros_por_segundo']} por segundo), em mosaicos de {MOSAICO[0] * MOSAICO[1]}: em cada imagem, "
            'da esquerda para a direita e de cima para baixo; o tempo de cada quadro no vídeo está escrito no canto (t=segundos). '
            'Áreas pretas no fim do último mosaico são só preenchimento.')})
        for q in _mosaicos(video, a, b, config['quadros_por_segundo'], pasta / 'q'):
            conteudo.append(_imagem(q))
        if b < duracao - 0.05:
            conteudo += [{'type': 'text', 'text': f'QUADRO DE CONTEXTO POSTERIOR (t={b + 0.1:.2f}, depois do trecho):'},
                         _imagem(quadro(video, b + 0.1, pasta / 'depois.jpg'))]
        # saída limitada (o OpenRouter reserva crédito pelo máximo), raciocínio curto (classificar não precisa de mais) e
        # timeout em ms: uma chamada travada não prende a fila
        llm = ChatOpenRouter(model=config['modelo_direcao'], temperature=0, timeout=90_000, max_retries=1, max_tokens=4096,
                             reasoning={'effort': 'low'})
        r = llm.with_structured_output(AnaliseTrecho, method='json_schema', include_raw=True).invoke(
            [('system', PROMPT), ('human', conteudo)])
    if r.get('parsed') is None:
        raise RuntimeError(f'resposta inválida no trecho {n + 1}: {r.get("parsing_error")}')
    uso = getattr(r['raw'], 'usage_metadata', None) or {}
    return {'inicio': a, 'fim': b, **r['parsed'].model_dump(), 'tokens': uso.get('total_tokens')}


def _analise(id: str, base: Path):
    load_dotenv(ENV, override=True)
    config = projeto.ler_config()
    dur = referencias.ler(id)['video']['duracao']
    cortes = json.loads((base / 'cenas.json').read_text())['cortes']
    palavras = json.loads((base / 'palavras.json').read_text())['palavras']
    lista = trechos(cortes, dur)
    cache = base / 'trechos'
    cache.mkdir(exist_ok=True)
    feitos = [0]

    def um(n_ab):
        n, (a, b) = n_ab
        arq = cache / f'{n:03d}.json'
        chave = {'inicio': a, 'fim': b, 'modelo': config['modelo_direcao'], 'fps': config['quadros_por_segundo']}
        if arq.exists():
            salvo = json.loads(arq.read_text())
            if salvo.get('chave') == chave:
                return salvo['analise']
        if _sem_credito[0]:
            raise SemCredito(SEM_CREDITO)
        ultimo = None
        for _ in range(2):
            try:
                analise = analisar_trecho(base / 'proxy.mp4', palavras, n, a, b, dur, config)
                break
            except Exception as e:
                if _falta_credito(e):
                    _sem_credito[0] = True
                    raise SemCredito(SEM_CREDITO) from e
                ultimo = e
        else:
            raise ultimo
        arq.write_text(json.dumps({'chave': chave, 'analise': analise}, ensure_ascii=False, indent=1), encoding='utf-8')
        feitos[0] += 1
        _passo(id, 'analise', progresso=round(feitos[0] / len(lista), 2), feitos=feitos[0], total=len(lista))
        return analise

    _passo(id, 'analise', feitos=0, total=len(lista), modelo=config['modelo_direcao'])
    with ThreadPoolExecutor(max_workers=PARALELO) as ex:
        resultados = list(ex.map(um, enumerate(lista)))
    (base / 'analise.json').write_text(json.dumps({'modelo': config['modelo_direcao'], 'trechos': resultados}, ensure_ascii=False, indent=1), encoding='utf-8')
    tokens = sum(r.get('tokens') or 0 for r in resultados)
    return {'trechos': len(resultados), 'tokens': tokens}


# ---------------------------------------------------------------- montagem

def montar(resultados: list[dict], duracao: float) -> list[dict]:
    """Itens da revisão a partir da análise por trecho: planos contíguos (juntando o que continua o mesmo conteúdo e
    os jump cuts do Full ator) e elementos dentro de cada trecho."""
    planos: list[dict] = []
    elementos: list[dict] = []
    for r in sorted(resultados, key=lambda r: r['inicio']):
        a, b = r['inicio'], r['fim']
        ps = sorted(r['planos'], key=lambda p: p['inicio'])
        for k, p in enumerate(ps):  # contíguos dentro do trecho
            ini = a if k == 0 else max(min(p['inicio'], b), a)
            fim = b if k == len(ps) - 1 else max(min(p['fim'], b), ini)
            if fim - ini < MIN_PLANO and k:
                planos[-1]['fim'] = fim
                continue
            novo = {'camada': 'plano', 'tipo': p['tipo'], 'conteudo': p['conteudo_em_cima'] if p['tipo'] == 'tela_dividida' else None,
                    'inicio': ini, 'fim': fim, 'descricao': p['descricao'], 'texto': None, 'funcao': p['funcao']}
            ant = planos[-1] if planos else None
            mesmo = ant and ant['tipo'] == novo['tipo'] and ant['conteudo'] == novo['conteudo']
            if mesmo and (novo['tipo'] == 'full_ator' or (k == 0 and r['continua_anterior'])):
                ant['fim'] = fim
            else:
                planos.append(novo)
        for e in r['elementos']:
            ini, fim = max(e['inicio'], a), min(e['fim'], b)
            if fim - ini < 0.05:
                continue
            ant = elementos[-1] if elementos else None
            if ant and ant['tipo'] == e['tipo'] and ant['texto'] == e['texto'] and ini - ant['fim'] < 0.3:  # o mesmo elemento atravessando um corte
                ant['fim'] = fim
                continue
            elementos.append({'camada': 'elemento', 'tipo': e['tipo'], 'conteudo': None, 'inicio': ini, 'fim': fim,
                              'descricao': e['descricao'], 'texto': e['texto'], 'funcao': e['funcao']})
    if planos:
        planos[0]['inicio'], planos[-1]['fim'] = 0.0, duracao
    itens = planos + elementos
    for k, i in enumerate(planos, 1):
        i['id'] = f'p{k}'
    for k, i in enumerate(elementos, 1):
        i['id'] = f'e{k}'
    for i in itens:
        i['inicio'], i['fim'] = round(i['inicio'], 3), round(i['fim'], 3)
    return itens


def ancorar(item: dict, palavras: list[dict]) -> dict:
    """Prende o item às palavras que ele cobre (SPEC §9). Sem fala no intervalo, fica sem âncora."""
    a, b = item['inicio'], item['fim']
    dentro = [w for w in palavras if min(w['fim'], b) - max(w['inicio'], a) > 0.01]
    item['palavra_ini'] = dentro[0]['id'] if dentro else None
    item['palavra_fim'] = dentro[-1]['id'] if dentro else None
    return item


def _miniatura(base: Path, item: dict) -> None:
    (base / 'quadros').mkdir(exist_ok=True)
    nome = f"quadros/{item['id']}.jpg"
    quadro(base / 'proxy.mp4', (item['inicio'] + item['fim']) / 2, base / nome, 427)
    item['miniatura'] = nome
    item['miniatura_t'] = round((item['inicio'] + item['fim']) / 2, 3)


def _montagem(id: str, base: Path):
    dur = referencias.ler(id)['video']['duracao']
    resultados = json.loads((base / 'analise.json').read_text())['trechos']
    palavras = json.loads((base / 'palavras.json').read_text())['palavras']
    itens = [ancorar(i, palavras) for i in montar(resultados, dur)]
    for i in itens:
        _miniatura(base, i)
    cortes = json.loads((base / 'cenas.json').read_text())['cortes']
    (base / 'direcao.json').write_text(json.dumps({'itens': itens, 'itens_ia': itens, 'cortes': cortes}, ensure_ascii=False, indent=1), encoding='utf-8')
    return {'planos': sum(i['camada'] == 'plano' for i in itens), 'elementos': sum(i['camada'] == 'elemento' for i in itens)}


# ---------------------------------------------------------------- revisão (D3)

def validar_edicao(itens: list[dict], duracao: float) -> list[dict]:
    """Confere o que veio da tela de revisão: categorias fixas, tempos dentro do vídeo e planos contíguos (sem buracos
    nem sobreposição). Devolve os itens normalizados ou levanta ValueError com o motivo."""
    planos, elementos = [], []
    ids = set()
    for i in itens:
        camada = i.get('camada')
        tipos = PLANOS if camada == 'plano' else ELEMENTOS if camada == 'elemento' else None
        if tipos is None or i.get('tipo') not in tipos:
            raise ValueError(f'Categoria inválida: {i.get("tipo")}')
        ini, fim = max(float(i['inicio']), 0.0), min(float(i['fim']), duracao)
        if fim - ini < (MIN_PLANO if camada == 'plano' else 0.05):
            raise ValueError(f'{tipos[i["tipo"]]} curto demais ({ini:.2f}–{fim:.2f} s)')
        id = str(i.get('id') or '')
        if not id or id in ids:
            raise ValueError('Item sem id ou com id repetido')
        ids.add(id)
        conteudo = i.get('conteudo') if i['tipo'] == 'tela_dividida' else None
        if i['tipo'] == 'tela_dividida' and conteudo not in ('insert', 'motion'):
            conteudo = 'insert'
        limpo = {'id': id, 'camada': camada, 'tipo': i['tipo'], 'conteudo': conteudo, 'inicio': round(ini, 3), 'fim': round(fim, 3),
                 'descricao': str(i.get('descricao') or '').strip(), 'texto': (str(i['texto']).strip() or None) if i.get('texto') else None,
                 'funcao': str(i.get('funcao') or '').strip(), 'miniatura': i.get('miniatura'), 'miniatura_t': i.get('miniatura_t')}
        (planos if camada == 'plano' else elementos).append(limpo)
    planos.sort(key=lambda p: p['inicio'])
    if not planos:
        raise ValueError('O vídeo precisa de pelo menos um plano-base')
    if abs(planos[0]['inicio']) > 0.05 or abs(planos[-1]['fim'] - duracao) > 0.05:
        raise ValueError('Os planos-base precisam cobrir o vídeo do começo ao fim')
    planos[0]['inicio'], planos[-1]['fim'] = 0.0, round(duracao, 3)
    for a, b in zip(planos, planos[1:]):
        if abs(a['fim'] - b['inicio']) > 0.05:
            raise ValueError(f'Buraco ou sobreposição entre planos em {a["fim"]:.2f} s')
        b['inicio'] = a['fim']
    return planos + sorted(elementos, key=lambda e: e['inicio'])


def salvar_edicao(id: str, itens: list[dict]) -> dict:
    base = referencias.pasta(id)
    dur = referencias.ler(id)['video']['duracao']
    dados = json.loads((base / 'direcao.json').read_text())
    palavras = json.loads((base / 'palavras.json').read_text())['palavras']
    novos = validar_edicao(itens, dur)
    for i in novos:
        ancorar(i, palavras)
        meio = round((i['inicio'] + i['fim']) / 2, 3)
        if not i.get('miniatura') or not (i['inicio'] <= (i.get('miniatura_t') or -1) <= i['fim']) or not (base / i['miniatura']).exists():
            _miniatura(base, i)
        elif i.get('miniatura_t') is None:
            i['miniatura_t'] = meio
    dados['itens'] = novos
    (base / 'direcao.json').write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding='utf-8')
    return dados


# ---------------------------------------------------------------- estatísticas (D4)

def _resumo(valores: list[float]) -> dict | None:
    if not valores:
        return None
    v = sorted(valores)
    q = lambda f: v[min(int(f * (len(v) - 1) + 0.5), len(v) - 1)]  # noqa: E731
    return {'n': len(v), 'media': round(statistics.fmean(v), 2), 'mediana': round(statistics.median(v), 2),
            'p10': round(q(0.1), 2), 'p90': round(q(0.9), 2), 'min': round(v[0], 2), 'max': round(v[-1], 2)}


FIM_DE_FRASE = ('.', '?', '!', '…')


def entrada(t: float, palavras: list[dict]) -> dict:
    """Onde um item entra em relação à fala: dentro de uma palavra, numa pausa (≥ 150 ms) ou entre palavras coladas;
    no começo ou no meio de uma frase; e a quantos ms do começo da palavra mais próxima."""
    if not palavras:
        return {'onde': 'sem_fala', 'frase': None, 'ms_palavra': None}
    prox = next((k for k, w in enumerate(palavras) if w['fim'] > t), None)
    if prox is None:
        return {'onde': 'depois_da_fala', 'frase': None, 'ms_palavra': None}
    w = palavras[prox]
    ant = palavras[prox - 1] if prox else None
    if w['inicio'] < t:
        onde = 'dentro_da_palavra'
    elif ant is None or w['inicio'] - ant['fim'] >= 0.15:
        onde = 'na_pausa'
    else:
        onde = 'entre_palavras'
    alvo = w if onde != 'dentro_da_palavra' else w
    inicio_de_frase = ant is None or ant['texto'].rstrip().endswith(FIM_DE_FRASE)
    if onde == 'dentro_da_palavra':
        inicio_de_frase = False
    perto = min(palavras, key=lambda x: abs(x['inicio'] - t))
    return {'onde': onde, 'frase': 'inicio' if inicio_de_frase else 'meio', 'ms_palavra': round((t - perto['inicio']) * 1000),
            'palavra': alvo['texto']}


def estatisticas(lista: list[tuple[dict, dict, list[dict]]]) -> dict:
    """`lista`: (referência, direcao.json, palavras) de cada vídeo. Números calculados por código, sem LLM."""
    dur_total = sum(r['video']['duracao'] for r, _, _ in lista)
    por_tipo: dict[str, dict] = {}
    entradas: dict[str, dict] = {}
    full_seguido, trocas = [], 0
    for ref, dados, palavras in lista:
        planos = [i for i in dados['itens'] if i['camada'] == 'plano']
        trocas += max(len(planos) - 1, 0)
        for i in dados['itens']:
            d = i['fim'] - i['inicio']
            chave = i['tipo'] + (f":{i['conteudo']}" if i.get('conteudo') else '')
            t = por_tipo.setdefault(chave, {'tipo': i['tipo'], 'conteudo': i.get('conteudo'), 'camada': i['camada'], 'duracoes': [], 'tempo': 0.0, 'textos': []})
            t['duracoes'].append(d)
            t['tempo'] += d
            if i.get('texto'):
                t['textos'].append(i['texto'])
            if i['camada'] == 'plano' and i['tipo'] == 'full_ator':
                full_seguido.append(d)
            if i['camada'] == 'plano' and i['inicio'] <= 0.01:
                continue  # o primeiro plano começa com o vídeo: não diz nada sobre quando entrar
            e = entrada(i['inicio'], palavras)
            c = entradas.setdefault(chave, {'onde': {}, 'frase': {}, 'ms': []})
            c['onde'][e['onde']] = c['onde'].get(e['onde'], 0) + 1
            if e['frase']:
                c['frase'][e['frase']] = c['frase'].get(e['frase'], 0) + 1
            if e['ms_palavra'] is not None:
                c['ms'].append(e['ms_palavra'])
    tipos = []
    for chave, t in por_tipo.items():
        e = entradas.get(chave, {'onde': {}, 'frase': {}, 'ms': []})
        tipos.append({
            'chave': chave, 'tipo': t['tipo'], 'conteudo': t['conteudo'], 'camada': t['camada'],
            'nome': (PLANOS | ELEMENTOS)[t['tipo']] + (f" ({t['conteudo']} em cima)" if t['conteudo'] else ''),
            'duracao': _resumo(t['duracoes']),
            'proporcao': round(t['tempo'] / dur_total, 3) if dur_total and t['camada'] == 'plano' else None,
            'por_minuto': round(len(t['duracoes']) / (dur_total / 60), 2) if dur_total else None,
            'entrada_onde': e['onde'], 'entrada_frase': e['frase'], 'ms_palavra': _resumo(e['ms']),
            'textos': t['textos'][:12],
        })
    tipos.sort(key=lambda x: (x['camada'] != 'plano', -(x['proporcao'] or 0), -x['duracao']['n']))
    return {'videos': len(lista), 'duracao_total': round(dur_total, 1), 'tipos': tipos,
            'full_ator_seguido': _resumo(full_seguido),
            'trocas_por_minuto': round(trocas / (dur_total / 60), 2) if dur_total else None}
