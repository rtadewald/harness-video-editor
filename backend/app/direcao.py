"""Direção visual (SPEC §8.2): análise das referências e edição da revisão.

Análise de uma referência (vídeo já editado):
1. proxy 720p, áudio, silêncios e transcrição (motor padrão do app);
2. detector de cena (PySceneDetect, adaptativo) acha os cortes com precisão de quadro;
3. a LLM multimodal analisa cada trecho entre cortes, em paralelo, vendo quadros (2/s) com o tempo de cada um, a fala
   do trecho e a transcrição inteira como contexto; devolve planos-base e elementos dentro das categorias fixas;
4. o código monta os itens: junta trechos que continuam o mesmo conteúdo, prende os tempos às palavras e tira miniaturas;
5. inserts: cada plano com insert é assistido de novo para contar o que acontece nele (o material que entra, zoom,
   trocas…) e listar as mídias que aparecem, cada uma vídeo ou imagem, com o formato. Fica no próprio plano (`insert`),
   entra na marcação dos roteiros de exemplo e é corrigível na revisão, como o resto.
"""
import json
import tempfile
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from . import comum, midia, motores, projeto, referencias, transcricao

PLANOS = {'full_ator': 'Full ator', 'full_ator_lettering': 'Full ator com lettering', 'insert_tela_cheia': 'Insert tela cheia',
          'motion_tela_cheia': 'Motion tela cheia', 'tela_dividida_insert': 'Tela dividida · insert', 'tela_dividida_motion': 'Tela dividida · motion',
          'comentario_insert_ator': 'Comentário + insert + ator'}
PLANOS_COM_TEXTO = ('full_ator_lettering', 'comentario_insert_ator')  # o texto do lettering / do comentário fica no plano


def tem_insert(tipo: str, conteudo: str | None = None) -> bool:
    """Planos com um insert (material real): neles a marcação conta o que acontece no insert (SPEC §8.2)."""
    return tipo_atual(tipo, conteudo) in ('insert_tela_cheia', 'tela_dividida_insert', 'comentario_insert_ator')


def tipo_atual(tipo: str, conteudo: str | None = None) -> str:
    """Antes (até out/2026) a tela dividida era um tipo só, com o que vai em cima num campo (`conteudo`); hoje são dois
    tipos: tela_dividida_insert e tela_dividida_motion (decisão de Rodrigo). Converte o formato antigo."""
    if tipo == 'tela_dividida':
        return 'tela_dividida_motion' if conteudo == 'motion' else 'tela_dividida_insert'
    return tipo
ELEMENTOS = {'lettering': 'Lettering', 'palavra_manychat': 'Palavra ManyChat', 'caixinha_perguntas': 'Caixinha de perguntas',
             'print_sobreposto': 'Print/imagem sobreposta'}
PASSOS = ['proxy', 'transcricao', 'cenas', 'analise', 'montagem', 'inserts']

MAX_QUADROS = 40  # por trecho; trechos longos (fala corrida) são amostrados com menos quadros por segundo
ALTURA_QUADRO = 384  # até 384 px o Gemini cobra 258 tokens por imagem; acima disso divide em blocos (~4× mais)
PARALELO = 2
MIN_PLANO = 0.1

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
    tipo: Literal['full_ator', 'full_ator_lettering', 'insert_tela_cheia', 'motion_tela_cheia', 'tela_dividida_insert', 'tela_dividida_motion',
                  'comentario_insert_ator']
    texto: str | None = Field(description='Só para full_ator_lettering (texto exato do lettering) e comentario_insert_ator (texto exato do comentário)')
    inicio: float = Field(description='Segundos do vídeo (use os tempos t= dos quadros)')
    fim: float
    descricao: str = Field(description='A marcação do roteiro: só o que o nome do plano não diz (o que aparece e o que acontece), ligado à fala, em 1 a 2 frases; vazia se não houver nada além do plano')


class ElementoIA(BaseModel):
    tipo: Literal['lettering', 'palavra_manychat', 'caixinha_perguntas', 'print_sobreposto']
    inicio: float
    fim: float
    texto: str | None = Field(description='Texto exato do elemento, quando houver')
    descricao: str = Field(description='O que é e o que destaca, em poucas palavras')


class AnaliseTrecho(BaseModel):
    continua_anterior: bool = Field(description='O primeiro plano continua o MESMO conteúdo do quadro de contexto anterior')
    planos: list[PlanoIA] = Field(min_length=1)
    elementos: list[ElementoIA]


VERSAO_ANALISE = 10  # muda quando o prompt ou o que é enviado muda: os trechos guardados com outra versão são refeitos

PROMPT = """Você analisa um vídeo vertical curto (Reels/Shorts/TikTok) JÁ EDITADO de um criador de conteúdo para descobrir como ele foi dirigido visualmente: o que aparece na tela em cada momento da fala.

Você recebe UM trecho entre dois cortes de cena:
- a transcrição do vídeo DO COMEÇO ATÉ O FIM DESTE TRECHO (nada do que vem depois), para você saber do que o vídeo está falando e o que já foi dito. O que é falado durante o trecho está marcado entre <momento_analisado> e </momento_analisado>, com o tempo de início de cada palavra;
- o trecho em si: um VÍDEO com áudio (o tempo 0 dele é o início do trecho) ou, em outra configuração, mosaicos de quadros com o tempo de cada um escrito no canto (t= segundos), como a mensagem indicar;
- um quadro logo antes do trecho (e às vezes um logo depois), só como contexto.

PLANOS-BASE (um por vez; cobrem o trecho inteiro, sem buracos):
- full_ator: o apresentador ocupa a tela (com ou sem coisas pequenas por cima). Zoom/reenquadramento no apresentador continua sendo full_ator.
- full_ator_lettering: o apresentador ocupa a tela E há um lettering (texto grande de destaque, palavra ou expressão-chave) sobre ele. O plano dura enquanto o lettering está na tela: se ele entra e sai sem corte de cena, divida o trecho em full_ator → full_ator_lettering → full_ator. Ponha o texto exato do lettering no campo texto (e NÃO crie também um elemento lettering para ele).
- insert_tela_cheia: material ilustrativo REAL ocupa a tela toda, sem o apresentador: gravação de tela, site, app, print, foto, vídeo de apoio.
- motion_tela_cheia: peça gráfica ANIMADA criada para o vídeo ocupa a tela toda, sem o apresentador: logos animados, mockups estilizados, textos e formas animadas, infográficos.
- comentario_insert_ator: o COMENTÁRIO de um seguidor (card de comentário de post do Instagram/YouTube, com foto, nome, curtidas, "Responder") aparece sobre um insert ou motion na parte de cima, e o apresentador embaixo, respondendo. Ponha o texto exato do comentário no campo texto. Não confunda com a caixinha de perguntas dos Stories (elemento caixinha_perguntas).
- tela_dividida_insert: o apresentador aparece JUNTO com um INSERT (material real: gravação de tela, site, app, print, filmagem), sem comentário de seguidor. Normalmente o insert fica em cima e o apresentador embaixo; se o apresentador estiver numa janela menor sobre o conteúdo, também vale (diga "apresentador em janela" na descrição).
- tela_dividida_motion: o mesmo, mas o que aparece junto com o apresentador é um MOTION (peça gráfica animada produzida).
Insert × motion: insert é a captura de algo que existe (tela, site, print, filmagem), mesmo com zoom ou destaque simples; motion é uma peça gráfica animada produzida. Compare os quadros em sequência: o que muda entre eles (rolagem, cursor, digitação, elementos que se montam) ajuda a decidir.

ELEMENTOS (sobrepostos ao plano; podem durar menos que ele):
- lettering: texto grande de destaque com uma palavra ou expressão-chave sobre um plano que NÃO é o apresentador em tela cheia (ex.: um título sobre um insert). Sobre o apresentador em tela cheia, use o plano full_ator_lettering.
- palavra_manychat: chamada para comentar uma palavra (CTA de ManyChat, ex.: Comente "PROMPT").
- caixinha_perguntas: a caixinha de perguntas dos Stories do Instagram (sticker "faça uma pergunta" com a pergunta de um seguidor) na tela. Comentário de post não é caixinha (veja comentario_insert_ator).
- print_sobreposto: print, imagem ou logo pequeno sobre o plano, sem tomar a tela.

IGNORE a legenda palavra a palavra queimada no vídeo (texto curto que acompanha a fala, uma ou poucas palavras por vez): ela é outra etapa e NÃO é lettering.
Se o texto em destaque É o próprio motion em tela cheia (ex.: uma animação tipográfica sem o apresentador), ele já é o plano motion_tela_cheia: não crie um lettering repetindo-o. Lettering é texto SOBRE outro plano.

MARCAÇÃO (o campo descricao, o mais importante): é a anotação de roteiro deste trecho, como um diretor anota ao lado da fala o que deve aparecer na tela. Ela vai virar uma linha `[plano: marcação]` acima da fala, então diga SÓ o que o nome do plano não diz: nunca descreva o layout (tela dividida, apresentador embaixo, conteúdo em cima, apresentador falando para a câmera — o plano já diz isso). Em 1 a 2 frases, diga o que aparece e o que acontece na tela (qual site, app, ferramenta, gráfico, texto; o que se mexe: entra, abre, digita, rola, dá zoom, destaca, troca), ligado ao que está sendo dito. Concreto e acionável, como instrução para quem vai editar; sem cores, texturas e posições. Num full_ator sem nada de especial, deixe vazia.
Exemplos de marcação: "em cima, o YouTube abrindo e alguém digitando 'IA' na busca; embaixo, o apresentador" · "o ChatGPT respondendo, com a lista de ferramentas aparecendo enquanto ele cita ChatGPT, Claude, Python, n8n…" · "motion minimalista: a pasta SKILL.md e o ícone do Claude saindo dela, enquanto ele fala 'eu criei uma skill'".
Para elementos, diga o que é e o que destaca, em poucas palavras.

Regras:
- Use as categorias acima e nenhuma outra. Tempos SEMPRE em segundos do vídeo inteiro (não do clipe), dentro do trecho.
- Normalmente o trecho tem UM plano. Devolva mais de um quando o layout muda dentro do trecho (inclusive um lettering que entra e sai sobre o apresentador).
- Escreva em português.
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
        for passo, f in [('proxy', _proxy), ('transcricao', _transcricao), ('cenas', _cenas), ('analise', _analise), ('montagem', _montagem),
                         ('inserts', _inserts)]:
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
    comum.carregar_env()
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
    comum.salvar_json((base / 'silencios.json'), {'silencios': silencios}, indent=None)
    palavras, motor = transcrever(audio, silencios)
    comum.salvar_json((base / 'palavras.json'), {'motor': motor, 'palavras': palavras})
    return {'motor': motor, 'palavras': len(palavras)}


def detectar_cortes(video: Path) -> list[float]:
    """Cortes duros de cena, em segundos (sem o 0)."""
    from scenedetect import AdaptiveDetector, detect

    return [round(a.seconds, 3) for a, _ in detect(str(video), AdaptiveDetector())][1:]


def _cenas(id: str, base: Path):
    dur = referencias.ler(id)['video']['duracao']
    cortes = [t for t in detectar_cortes(base / 'proxy.mp4') if 0.05 < t < dur - 0.05]
    comum.salvar_json((base / 'cenas.json'), {'cortes': cortes}, indent=None)
    return {'trechos': len(cortes) + 1}


def trechos(cortes: list[float], duracao: float) -> list[tuple[float, float]]:
    bordas = [0.0, *cortes, duracao]
    return [(a, b) for a, b in zip(bordas, bordas[1:]) if b - a > 0.02]


FONTE = '/System/Library/Fonts/Supplemental/Arial.ttf'
def _clipe(video: Path, a: float, b: float, destino: Path) -> Path:
    """O trecho [a, b) como um MP4 pequeno com áudio (640 px de altura): o Gemini amostra o vídeo sozinho (~1 quadro/s,
    resolução reduzida) e ouve o áudio. Medido: ~4–8× mais barato que mandar quadros como imagens."""
    midia.ffmpeg('-ss', f'{a:.3f}', '-i', str(video), '-t', f'{b - a:.3f}', '-vf', 'scale=-2:640',
                 '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '64k', str(destino))
    return destino


def _no_video_inteiro(analise: dict, a: float, b: float) -> dict:
    """Se o modelo respondeu com tempos do clipe (0 = início do trecho) em vez do vídeo inteiro, soma o início."""
    tempos = [x[k] for x in analise['planos'] + analise['elementos'] for k in ('inicio', 'fim')]
    if a > 0.5 and tempos and max(tempos) <= (b - a) + 0.3 and min(tempos) < a - 0.3:
        for x in analise['planos'] + analise['elementos']:
            x['inicio'], x['fim'] = round(x['inicio'] + a, 3), round(x['fim'] + a, 3)
    return analise


def _mosaicos(video: Path, a: float, b: float, fps: float, grade: str, pasta: Path) -> list[Path]:
    """Quadros do trecho [a, b) agrupados em mosaicos (3×2 ou 3×1), cada quadro com o seu tempo no vídeo escrito no
    canto (t=segundos). O Gemini cobra ~1.100 tokens por imagem, qualquer que seja o tamanho."""
    d = b - a
    fps = min(fps, MAX_QUADROS / max(d, 0.01))
    tempo = "t=%{expr\\:t+" + f"{a:.3f}" + "}"
    vf = (f'trim=end={d:.3f},fps={fps:.4f},scale=-2:{ALTURA_QUADRO},'
          f"drawtext=fontfile={FONTE}:text='{tempo}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=4,"
          f'tile={grade}:padding=4:color=black')
    midia.ffmpeg('-ss', f'{a:.3f}', '-i', str(video), '-t', f'{d + 0.5:.3f}', '-vf', vf, '-q:v', '4', str(pasta / '%03d.jpg'))
    return sorted(pasta.glob('*.jpg'))


def quadro(video: Path, t: float, destino: Path, altura: int = ALTURA_QUADRO) -> Path:
    midia.ffmpeg('-ss', f'{max(t, 0):.3f}', '-i', str(video), '-frames:v', '1', '-vf', f'scale=-2:{altura}', '-q:v', '4', str(destino))
    return destino


def transcricao_ate(palavras: list[dict], a: float, b: float) -> str:
    """A fala do começo do vídeo até o fim do trecho [a, b), com o que é dito durante o trecho marcado e com tempos.
    O que vem antes vai em linhas (quebradas nas pausas e nos fins de frase), cada uma com o seu início."""
    antes = [w for w in palavras if w['fim'] <= a + 0.01]
    durante = [w for w in palavras if w['fim'] > a + 0.01 and w['inicio'] < b]
    linhas: list[list[dict]] = []
    for k, w in enumerate(antes):
        if not linhas or w['inicio'] - antes[k - 1]['fim'] >= 0.6 or antes[k - 1]['texto'].rstrip().endswith(comum.FIM_DE_FRASE):
            linhas.append([])
        linhas[-1].append(w)
    texto = '\n'.join(f"[{l[0]['inicio']:.1f} s] " + ' '.join(w['texto'] for w in l) for l in linhas)
    momento = ' '.join(f"{w['texto']}[{w['inicio']:.2f}]" for w in durante) or '(sem fala neste trecho)'
    return (texto + '\n' if texto else '(começo do vídeo)\n') + f'<momento_analisado de="{a:.2f} s" ate="{b:.2f} s">\n{momento}\n</momento_analisado>'


def analisar_trecho(video: Path, palavras: list[dict], n: int, a: float, b: float, duracao: float, config: dict) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        (pasta / 'q').mkdir()
        conteudo: list[dict] = [{'type': 'text', 'text': (
            f'TRECHO {n + 1}: de {a:.2f} s a {b:.2f} s (o vídeo tem {duracao:.1f} s).\n\n'
            f'TRANSCRIÇÃO ATÉ O FIM DESTE TRECHO:\n{transcricao_ate(palavras, a, b)}')}]
        if a > 0.05:
            conteudo += [{'type': 'text', 'text': f'QUADRO DE CONTEXTO ANTERIOR (t={max(a - 0.15, 0):.2f}, antes do trecho):'},
                         comum.imagem(quadro(video, a - 0.15, pasta / 'antes.jpg'))]
        fps, grade = config['quadros_por_segundo'], config['grade_mosaico']
        if config['formato_analise'] == 'mosaico':
            n_grade = int(grade[0]) * int(grade[2])
            conteudo.append({'type': 'text', 'text': (
                f"QUADROS DO TRECHO ({fps} por segundo), em mosaicos de {n_grade}: em cada imagem, "
                'da esquerda para a direita e de cima para baixo; o tempo de cada quadro no vídeo está escrito no canto (t=segundos). '
                'Áreas pretas no fim do último mosaico são só preenchimento.')})
            conteudo += [comum.imagem(q) for q in _mosaicos(video, a, b, fps, grade, pasta / 'q')]
        else:
            conteudo += [{'type': 'text', 'text': (
                f'VÍDEO DO TRECHO (com áudio): o tempo 0 deste vídeo é {a:.2f} s do vídeo inteiro, e ele termina em {b:.2f} s. '
                f'Responda os tempos em segundos do vídeo inteiro (some {a:.2f}).')},
                comum.video(_clipe(video, a, b, pasta / 'trecho.mp4'))]
        if b < duracao - 0.05 and config['formato_analise'] == 'mosaico':
            conteudo += [{'type': 'text', 'text': f'QUADRO DE CONTEXTO POSTERIOR (t={b + 0.1:.2f}, depois do trecho):'},
                         comum.imagem(quadro(video, b + 0.1, pasta / 'depois.jpg'))]
        # saída limitada (o OpenRouter reserva crédito pelo máximo), raciocínio curto (classificar não precisa de mais) e
        # timeout em ms: uma chamada travada não prende a fila
        llm = comum.chat(config['modelo_direcao'], timeout_s=90, max_tokens=4096, raciocinio='low')
        r = llm.with_structured_output(AnaliseTrecho, method='json_schema', include_raw=True).invoke(
            [('system', PROMPT + (f"\n\nSOBRE O CRIADOR (contexto): {config['perfil_criador']}" if config['perfil_criador'] else '')),
             ('human', conteudo)])
    if r.get('parsed') is None:
        raise RuntimeError(f'resposta inválida no trecho {n + 1}: {r.get("parsing_error")}')
    uso = getattr(r['raw'], 'usage_metadata', None) or {}
    analise = r['parsed'].model_dump()
    if config['formato_analise'] == 'video':
        analise = _no_video_inteiro(analise, a, b)
    return {'inicio': a, 'fim': b, **analise, 'tokens': uso.get('total_tokens')}


def _analise(id: str, base: Path):
    comum.carregar_env()
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
        chave = {'inicio': a, 'fim': b, 'modelo': config['modelo_direcao'], 'fps': config['quadros_por_segundo'],
                 'formato': config['formato_analise'], 'grade': config['grade_mosaico'], 'versao': VERSAO_ANALISE}
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
        comum.salvar_json(arq, {'chave': chave, 'analise': analise})
        feitos[0] += 1
        _passo(id, 'analise', progresso=round(feitos[0] / len(lista), 2), feitos=feitos[0], total=len(lista))
        return analise

    _passo(id, 'analise', feitos=0, total=len(lista), modelo=config['modelo_direcao'])
    with ThreadPoolExecutor(max_workers=PARALELO) as ex:
        resultados = list(ex.map(um, enumerate(lista)))
    comum.salvar_json((base / 'analise.json'), {'modelo': config['modelo_direcao'], 'trechos': resultados})
    tokens = sum(r.get('tokens') or 0 for r in resultados)
    return {'trechos': len(resultados), 'tokens': tokens}


# ---------------------------------------------------------------- montagem

def montar(resultados: list[dict], duracao: float) -> list[dict]:
    """Itens da revisão a partir da análise por trecho: planos contíguos (um por corte de cena; só os jump cuts do Full
    ator se juntam) e elementos dentro de cada trecho."""
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
            tipo = tipo_atual(p['tipo'], p.get('conteudo_em_cima'))  # o cache de trechos antigos ainda tem o formato antigo
            novo = {'camada': 'plano', 'tipo': tipo, 'conteudo': None,
                    'inicio': ini, 'fim': fim, 'descricao': p['descricao'],
                    'texto': (p.get('texto') or None) if tipo in PLANOS_COM_TEXTO else None}
            ant = planos[-1] if planos else None
            mesmo = ant and ant['tipo'] == novo['tipo'] and ant['conteudo'] == novo['conteudo'] and ant['texto'] == novo['texto']
            if mesmo and novo['tipo'] == 'full_ator':  # só os jump cuts do ator se juntam: cada corte de cena é uma linha do roteiro
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
                              'descricao': e['descricao'], 'texto': e['texto']})
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


class InsertVisto(BaseModel):
    marcacao: str = Field(description='o que acontece no insert, em ordem, com a edição: o que entra e como, zooms, destaques, trocas')


PROMPT_INSERT = """Você está vendo um bloco de INSERT de um vídeo vertical curto já editado: material real (site, página, ferramenta, vídeo, print) que aparece enquanto o criador fala.

Escreva a MARCAÇÃO do roteiro para este bloco: conte o que acontece no insert, em ordem, como um editor contaria a outro — qual material aparece (o site, a página, a ferramenta, concretos), como entra, zooms (em quê), destaques (caixas, setas, blur), rolagens, trocas de um material para outro. 1 a 3 frases, concretas.
NÃO descreva o layout do plano (tela dividida, apresentador embaixo, conteúdo em cima, apresentador falando): o nome do plano já diz isso.
O bloco tem {duracao:.1f} s."""


def analisar_insert(base: Path, bloco: dict, config: dict) -> str:
    """Assiste um bloco de insert de uma referência e devolve a marcação: o que acontece nele."""
    video = base / 'proxy.mp4' if (base / 'proxy.mp4').exists() else base / 'video.mp4'
    with tempfile.TemporaryDirectory() as tmp:
        clipe = _clipe(video, bloco['inicio'], bloco['fim'], Path(tmp) / 'bloco.mp4')
        conteudo = [{'type': 'text', 'text': f"Bloco: {PLANOS.get(bloco['tipo'], bloco['tipo'])}. Marcação de antes, vista em pedaços: {bloco.get('descricao') or '—'}"},
                    comum.video(clipe)]
        llm = comum.chat(config['modelo_direcao'], timeout_s=120, max_tokens=2000, raciocinio='low')
        r = llm.with_structured_output(InsertVisto, method='json_schema').invoke(
            [('system', PROMPT_INSERT.format(duracao=bloco['fim'] - bloco['inicio'])), ('human', conteudo)])
    return r.marcacao.strip()[:1200]


def _inserts(id: str, base: Path):
    """Etapa "inserts": cada plano com insert é assistido inteiro (a análise vê só pedaços entre cortes de cena) e ganha a
    marcação do que acontece nele (3 por vez)."""
    comum.carregar_env()
    config = projeto.ler_config()
    dados = comum.ler_json(base / 'direcao.json')
    blocos = [i for i in dados['itens'] if i['camada'] == 'plano' and tem_insert(i['tipo'], i.get('conteudo'))]
    with ThreadPoolExecutor(max_workers=3) as ex:
        feitos = dict(ex.map(lambda b: (b['id'], analisar_insert(base, b, config)), blocos))
    with _trava_inserts:
        dados = comum.ler_json(base / 'direcao.json')
        for i in dados['itens']:
            if feitos.get(i['id']):
                i['descricao'] = feitos[i['id']]
            for velho in ('captura', 'insert', 'como_gerar'):  # formatos anteriores (como capturar, mídias pedidas, receita)
                i.pop(velho, None)
        comum.salvar_json(base / 'direcao.json', dados)
    return {'blocos': len(feitos)}


_trava_inserts = threading.Lock()


def _montagem(id: str, base: Path):
    dur = referencias.ler(id)['video']['duracao']
    resultados = json.loads((base / 'analise.json').read_text())['trechos']
    palavras = json.loads((base / 'palavras.json').read_text())['palavras']
    itens = [ancorar(i, palavras) for i in montar(resultados, dur)]
    for i in itens:
        _miniatura(base, i)
    cortes = json.loads((base / 'cenas.json').read_text())['cortes']
    comum.salvar_json((base / 'direcao.json'), {'itens': itens, 'itens_ia': itens, 'cortes': cortes})
    return {'planos': sum(i['camada'] == 'plano' for i in itens), 'elementos': sum(i['camada'] == 'elemento' for i in itens)}


# ---------------------------------------------------------------- revisão (D3)

def validar_edicao(itens: list[dict], duracao: float) -> list[dict]:
    """Confere o que veio da tela de revisão: categorias fixas, tempos dentro do vídeo e planos contíguos (sem buracos
    nem sobreposição). Devolve os itens normalizados ou levanta ValueError com o motivo."""
    planos, elementos = [], []
    ids = set()
    for i in itens:
        camada = i.get('camada')
        if camada == 'plano':
            i = {**i, 'tipo': tipo_atual(i.get('tipo'), i.get('conteudo'))}
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
        conteudo = None
        limpo = {'id': id, 'camada': camada, 'tipo': i['tipo'], 'conteudo': conteudo, 'inicio': round(ini, 3), 'fim': round(fim, 3),
                 'descricao': str(i.get('descricao') or '').strip(), 'texto': (str(i['texto']).strip() or None) if i.get('texto') else None,
                 'miniatura': i.get('miniatura'), 'miniatura_t': i.get('miniatura_t')}
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
    comum.salvar_json((base / 'direcao.json'), dados)
    return dados


# ---------------------------------------------------------------- dados de um clipe (galeria de Referências)

def entrada(t: float, palavras: list[dict]) -> dict | None:
    """Como um plano entra em relação à fala: numa pausa (≥ 150 ms sem fala), entre palavras coladas ou no meio de
    uma palavra; no começo ou no meio de uma frase; e a quantos ms do começo da palavra mais próxima."""
    if not palavras:
        return None
    prox = next((k for k, w in enumerate(palavras) if w['fim'] > t), None)
    if prox is None:
        return {'onde': 'depois_da_fala', 'frase': None, 'palavra': None, 'ms': None}
    w, ant = palavras[prox], palavras[prox - 1] if prox else None
    if w['inicio'] < t:
        onde = 'dentro_da_palavra'
    elif ant is None or w['inicio'] - ant['fim'] >= 0.15:
        onde = 'na_pausa'
    else:
        onde = 'entre_palavras'
    comeco = onde != 'dentro_da_palavra' and (ant is None or ant['texto'].rstrip().endswith(comum.FIM_DE_FRASE))
    perto = min(palavras, key=lambda x: abs(x['inicio'] - t))
    return {'onde': onde, 'frase': 'inicio' if comeco else 'meio', 'palavra': perto['texto'], 'ms': round((t - perto['inicio']) * 1000)}


def clipes(ref: dict, itens: list[dict], palavras: list[dict]) -> tuple[list[dict], dict]:
    """Os planos de uma referência como clipes da galeria, cada um com os seus dados, e um resumo do vídeo de origem."""
    planos = sorted((i for i in itens if i['camada'] == 'plano'), key=lambda i: i['inicio'])
    elementos = [i for i in itens if i['camada'] == 'elemento']
    dur = ref['video']['duracao']
    resumo = {'nome': ref['nome'], 'duracao': dur, 'revisado': ref['status'] == 'revisado',
              'planos': [{'id': p['id'], 'tipo': p['tipo'], 'inicio': p['inicio'], 'fim': p['fim']} for p in planos],
              'proporcao': {}}
    for p in planos:
        resumo['proporcao'][p['tipo']] = round(resumo['proporcao'].get(p['tipo'], 0) + (p['fim'] - p['inicio']) / dur, 3)
    lista = []
    for k, p in enumerate(planos):
        faladas = [w for w in palavras if w['fim'] > p['inicio'] + 0.01 and w['inicio'] < p['fim']]
        d = p['fim'] - p['inicio']
        vizinho = lambda q: {'tipo': q['tipo'], 'duracao': round(q['fim'] - q['inicio'], 2)} if q else None  # noqa: E731
        lista.append({
            'ref': ref['id'], 'ref_nome': ref['nome'], 'revisado': ref['status'] == 'revisado', 'id': p['id'], 'tipo': p['tipo'],
            'conteudo': p.get('conteudo'), 'inicio': p['inicio'], 'fim': p['fim'], 'descricao': p.get('descricao') or '',
            'texto': p.get('texto'), 'miniatura': p.get('miniatura'), 'fala': ' '.join(w['texto'] for w in faladas),
            'numero': k + 1, 'total': len(planos), 'posicao': round(p['inicio'] / dur, 3) if dur else 0,
            'palavras': len(faladas), 'por_minuto': round(len(faladas) / d * 60) if d >= 2 and len(faladas) >= 3 else None,
            'entrada': entrada(p['inicio'], palavras) if k else None,
            'anterior': vizinho(planos[k - 1] if k else None), 'seguinte': vizinho(planos[k + 1] if k + 1 < len(planos) else None),
            'elementos': [{'tipo': e['tipo'], 'texto': e.get('texto'), 'inicio': e['inicio'], 'fim': e['fim']}
                          for e in elementos if e['fim'] > p['inicio'] and e['inicio'] < p['fim']],
        })
    return lista, resumo

