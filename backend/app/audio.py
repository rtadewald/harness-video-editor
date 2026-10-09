"""O áudio do vídeo (SPEC §8.9; docs/audio.md): a voz do ator (limpeza e timbre), a faixa de fundo e o mixer das quatro
trilhas — o ator, os sons dos presets, os das transições e o fundo —, com o volume final em −14 LUFS.

- **Limpeza** (`limpeza`): o DeepFilterNet 3 (local; Leve · Média · Forte = quanto ele pode abaixar o ruído: 6, 12 ou
  24 dB) ou o "isolamento máximo" do ElevenLabs (pago; manda a voz a um terceiro). Roda uma vez por escolha, em segundo
  plano, sobre o áudio inteiro do bruto (o tempo é o mesmo, então os cortes valem igual): `midia/voz/<bruto>_<nível>.wav`
  e um proxy com essa voz para a prévia (`midia/proxy/<bruto>_voz_<nível>[_v<versão>].mp4`, o vídeo copiado). Uma que
  falhou fica em `erro` até o criador pedir de novo (nunca se refaz sozinha: o isolamento é pago).
- **Timbre** (Natural · Quente · Clara) e um **compressor leve**: os mesmos números na prévia (Web Audio) e no MP4.
- **Fundo**: uma faixa da biblioteca (`trilhas.py`), repetida no trecho estável dela (`trilhas.laco`) com crossfade,
  com fade no fim e o **ducking** pelas falas (a música abaixa enquanto o ator fala), calculado das palavras — a mesma
  curva na prévia e no MP4.
- **Mixer** (`niveis`, dB, −12 a +6; o fundo também mudo) e o **−14 LUFS** no fim: o ganho que leva a mistura a −14,
  medido no áudio sozinho (`medir`), e um limitador de pico na passada final.
- A voz entra na mistura em estéreo com ganho 1 nos dois canais (como o navegador toca um áudio mono), e a sonoridade
  dela é medida assim (`lufs(..., como_voz=True)`), seja a limpa (mono) ou a do bruto."""
import json
import math
import os
import re
import subprocess
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import comum, projeto

LIMPEZAS: dict[str, float | None] = {'sem': None, 'leve': 6, 'media': 12, 'forte': 24, 'isolamento': None}
# os filtros de timbre: (frequência Hz, ganho dB, Q) em picos (peaking), depois de um passa-altas de 80 Hz
TIMBRES: dict[str, list[tuple[float, float, float]]] = {
    'natural': [],
    'quente': [(180, 2.5, 0.9), (3500, -1.5, 1.0)],
    'clara': [(250, -2.0, 1.0), (4500, 3.0, 1.0)],
}
PASSA_ALTAS = 80
COMPRESSOR = {'limiar': -20, 'razao': 2.5, 'ataque': 0.01, 'soltura': 0.15, 'joelho': 6}
TRILHAS = ('ator', 'presets', 'transicoes', 'fundo')
NIVEL_MIN, NIVEL_MAX = -12, 6
LUFS, PICO = -14, -1.5
# o limitador antes da saída (pico de amostra, um pouco abaixo do PICO em dBTP: os picos entre amostras e o AAC sobem
# alguns décimos) e o maior ganho que o −14 aplica
LIMITE_DB = -2.0
GANHO_MAX = 30.0
# o fundo em relação à voz (LUFS da faixa − LUFS da voz) e quanto ele abaixa quando o ator fala: medidos nas
# referências (docs/audio.md). As faixas da biblioteca vêm normalizadas em `trilhas.LUFS`
FUNDO_DB = -11.0
DUCKING_DB = 3.0
SUBIDA, DESCIDA = 0.15, 0.35  # s: a música abaixa antes da fala começar e volta depois que ela termina
JUNTA = 0.6  # s: pausas menores que isto não devolvem a música
FADE_FUNDO = 1.5
CRUZA_FUNDO = 2.0  # s: o crossfade de uma volta do fundo para a próxima
PADRAO = {'voz': {'limpeza': 'leve', 'timbre': 'natural'}, 'fundo': None, 'fundo_mudo': False,
          'niveis': {t: 0.0 for t in TRILHAS}}
DEEPFILTER = ['uv', 'run', '--no-project', '--python', '3.11', '--with', 'deepfilternet==0.5.6', '--with', 'torch==2.3.1',
              '--with', 'torchaudio==2.3.1', '--with', 'numpy<2', '--with', 'soundfile', 'python']
ISOLAMENTO_URL = 'https://api.elevenlabs.io/v1/audio-isolation'
_fila = ThreadPoolExecutor(max_workers=1)
_trava = threading.Lock()
APAGAR_DEPOIS = 10  # s: quanto a prévia tem para trocar para o proxy novo antes de o anterior sumir
_trava_voz = threading.Lock()  # a fila e a exportação não fazem a mesma voz ao mesmo tempo
_trava_pedido = threading.Lock()  # dois pedidos juntos (duas abas, GET e PUT) não enfileiram a mesma limpeza duas vezes
# a voz entra na mistura como o navegador toca: o mono vai igual aos dois canais (ganho 1; o `aformat` daria −3 dB)
VOZ_ESTEREO = 'pan=stereo|c0=c0|c1=c0'


# ---------------------------------------------------------------- escolhas do projeto

def do_projeto(p: dict) -> dict:
    """As escolhas de áudio do projeto, com o padrão onde faltar (projetos de antes da P3: a limpeza Leve, sem fundo)."""
    a = p.get('audio') or {}
    voz = {**PADRAO['voz'], **{k: v for k, v in (a.get('voz') or {}).items() if k in PADRAO['voz']}}
    niveis = {**PADRAO['niveis'], **{k: float(v) for k, v in (a.get('niveis') or {}).items() if k in TRILHAS and isinstance(v, (int, float))}}
    return {'voz': voz, 'fundo': a.get('fundo') if isinstance(a.get('fundo'), str) else None, 'fundo_mudo': bool(a.get('fundo_mudo')),
            'niveis': niveis}


def validar(campos: dict, atual: dict) -> dict:
    """As escolhas novas por cima das atuais (só as chaves conhecidas); levanta ValueError se um valor não vale."""
    from . import trilhas

    novo = json.loads(json.dumps(atual))
    voz = campos.get('voz') or {}
    if 'limpeza' in voz:
        if voz['limpeza'] not in LIMPEZAS:
            raise ValueError('Limpeza desconhecida')
        novo['voz']['limpeza'] = voz['limpeza']
    if 'timbre' in voz:
        if voz['timbre'] not in TIMBRES:
            raise ValueError('Timbre desconhecido')
        novo['voz']['timbre'] = voz['timbre']
    if 'fundo' in campos:
        if campos['fundo'] is not None and not trilhas.existe(campos['fundo']):
            raise ValueError('Faixa de fundo desconhecida')
        novo['fundo'] = campos['fundo']
    if 'fundo_mudo' in campos:
        novo['fundo_mudo'] = bool(campos['fundo_mudo'])
    for k, v in (campos.get('niveis') or {}).items():
        if k not in TRILHAS:
            raise ValueError(f'Trilha desconhecida: {k}')
        novo['niveis'][k] = comum.numero(v, NIVEL_MIN, NIVEL_MAX, 1)
    return novo


def db(x: float) -> float:
    return 10 ** (x / 20)


# ---------------------------------------------------------------- a voz limpa

def _bruto(p: dict) -> dict:
    return next(f for f in p['fontes'] if f['papel'] == 'bruto')


def arquivo_voz(id: str, bid: str, limpeza: str) -> Path:
    return projeto.pasta(id) / 'midia' / 'voz' / f'{bid}_{limpeza}.wav'


def versao_do_video(p: dict):
    """A versão do bruto 9:16 (muda a cada Reenquadrar; igual a `recorte_ator.versao_do_video`)."""
    return (p.get('enquadramento') or {}).get('versao')


def proxy_voz(id: str, p: dict, limpeza: str) -> Path:
    """O proxy da prévia com a voz limpa (o vídeo do proxy de agora: muda a cada Reenquadrar)."""
    versao = versao_do_video(p)
    return projeto.pasta(id) / 'midia' / 'proxy' / f'{_bruto(p)["id"]}_voz_{limpeza}{f"_v{versao}" if versao else ""}.mp4'


def estado_voz(id: str) -> dict:
    """Onde está a voz da escolha atual: `pronta` (com o arquivo, o proxy e a `versao` do vídeo dele), `fila`, `rodando`,
    `erro`, `falta` (ainda não pedida, ou o proxy é de outra versão do vídeo) ou `sem` (sem limpeza: a voz do bruto)."""
    p = projeto.ler(id)
    limpeza = do_projeto(p)['voz']['limpeza']
    if limpeza == 'sem':
        return {'estado': 'sem', 'limpeza': 'sem'}
    e = ((p.get('audio') or {}).get('limpezas') or {}).get(limpeza) or {}
    if e.get('estado') == 'pronta' and arquivo_voz(id, _bruto(p)['id'], limpeza).exists() and proxy_voz(id, p, limpeza).exists():
        return {**e, 'limpeza': limpeza, 'proxy': str(proxy_voz(id, p, limpeza).relative_to(projeto.pasta(id))), 'versao': versao_do_video(p)}
    if e.get('estado') == 'pronta':  # o arquivo sumiu ou o proxy é de outra versão do vídeo: refaz
        e = {}
    return {'estado': e.get('estado', 'falta'), 'limpeza': limpeza, 'progresso': e.get('progresso', 0), 'erro': e.get('erro')}


def canais(arq: Path) -> int:
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', str(arq)],
                       capture_output=True, text=True)
    try:
        return max(int(r.stdout.strip().split(',')[0]), 1)
    except ValueError:
        return 1


def para_mono(arq: Path) -> str:
    """O filtro que deixa a voz mono pela média dos canais (no bruto dual-mono, o mesmo nível de cada canal). Explícito:
    o `aformat`/`-ac 1` do ffmpeg só faz a média em formatos inteiros; em float, soma a +3 dB."""
    n = canais(arq)
    return 'anull' if n == 1 else 'pan=mono|c0=' + '+'.join(f'{1 / n:.6f}*c{k}' for k in range(n))


def lufs(arq: Path, como_voz: bool = False) -> float:
    """A sonoridade integrada (LUFS, EBU R128) de um arquivo de áudio; `como_voz`: como a voz entra na mistura (mono pela
    média e igual nos dois canais: um mono medido sozinho daria 3 LU a menos do que soa nos dois canais)."""
    af = f'{para_mono(arq)},{VOZ_ESTEREO},ebur128' if como_voz else 'ebur128'
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-vn', '-af', af, '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    if not m:
        raise RuntimeError('Não deu para medir a sonoridade')
    return float(m[-1])


def lufs_da_voz(id: str, limpeza: str | None = None) -> float:
    """A sonoridade da voz da escolha (a limpa ou a do bruto) como ela entra na mistura, medida uma vez e guardada no
    projeto (`audio.voz_lufs.<bruto>_<nível>`): o fundo fica `FUNDO_DB` abaixo dela, na prévia e no MP4."""
    p = projeto.ler(id)
    limpeza = limpeza or do_projeto(p)['voz']['limpeza']
    f = _bruto(p)
    chave = f'{f["id"]}_{limpeza}'
    guardado = ((p.get('audio') or {}).get('voz_lufs') or {}).get(chave)
    if guardado is not None:
        return guardado
    arq = projeto.pasta(id) / f['arquivo'] if limpeza == 'sem' else arquivo_voz(id, f['id'], limpeza)
    if not arq.exists():
        raise FileNotFoundError(arq)
    v = round(lufs(arq, como_voz=True), 1)

    def guardar(x):
        a = x.setdefault('audio', {})
        a.pop('lufs', None)  # o cache de antes (o mono medido sozinho, 3 LU abaixo)
        a.setdefault('voz_lufs', {})[chave] = v
    with _trava:
        projeto.atualizar(id, guardar)
    return v


def ganho_fundo(voz_lufs: float, nivel_db: float) -> float:
    """O ganho (dB) da faixa de fundo: `FUNDO_DB` abaixo da voz, mais o fader."""
    from . import trilhas

    return round(voz_lufs + FUNDO_DB - trilhas.LUFS + nivel_db, 1)


def _marcar(id: str, limpeza: str, **campos) -> None:
    with _trava:
        projeto.atualizar(id, lambda p: p.setdefault('audio', {}).setdefault('limpezas', {}).setdefault(limpeza, {}).update(campos))


def _esquecer(id: str, limpeza: str) -> None:
    """A limpeza volta a `falta` (sem estado): é pedida de novo quando o proxy do vídeo de agora existir."""
    with _trava:
        projeto.atualizar(id, lambda p: ((p.get('audio') or {}).get('limpezas') or {}).pop(limpeza, None))


def pedir_voz(id: str, refazer: bool = False) -> dict:
    """Põe na fila a limpeza escolhida quando ela falta (nunca feita, ou o proxy com ela é de outra versão do vídeo) e o
    proxy do vídeo de agora existe (um Reenquadrar o tira enquanto o refaz). Uma que falhou fica em `erro` até o criador
    pedir de novo (`refazer`: o PUT com a limpeza); o isolamento (pago) também só roda pedido assim, ou se a voz dele já
    existe (falta só o proxy)."""
    with _trava_pedido:
        e = estado_voz(id)
        if refazer and e['estado'] == 'erro':
            _esquecer(id, e['limpeza'])
            e = estado_voz(id)
        if e['estado'] != 'falta':
            return e
        p = projeto.ler(id)
        f = _bruto(p)
        if not f.get('proxy'):
            return e
        if e['limpeza'] == 'isolamento' and not refazer and not arquivo_voz(id, f['id'], 'isolamento').exists():
            return e
        _marcar(id, e['limpeza'], estado='fila', progresso=0, erro=None)
        _fila.submit(_limpar, id, e['limpeza'])
        return estado_voz(id)


def retomar_interrompidos() -> None:
    """As limpezas que o servidor parou no meio: as locais voltam a `falta` (a escolhida é pedida de novo); o
    isolamento (pago) vira erro, para o criador pedir de novo na tela."""
    for resumo in projeto.listar():
        p = projeto.ler(resumo['id'])
        parou = [k for k, e in ((p.get('audio') or {}).get('limpezas') or {}).items() if e.get('estado') in ('fila', 'rodando')]
        for limpeza in parou:
            if limpeza == 'isolamento':
                _marcar(resumo['id'], limpeza, estado='erro', erro='interrompida (o servidor reiniciou): peça de novo')
            else:
                _esquecer(resumo['id'], limpeza)
        if parou:
            pedir_voz(resumo['id'])


def gerar_wav(id: str, limpeza: str) -> Path:
    """A voz limpa (`midia/voz/<bruto>_<nível>.wav`), feita se ainda não existe; devolve o arquivo."""
    with _trava_voz:
        return _gerar_wav(id, limpeza)


def _gerar_wav(id: str, limpeza: str) -> Path:
    p = projeto.ler(id)
    f = _bruto(p)
    destino = arquivo_voz(id, f['id'], limpeza)
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    entrada = destino.with_name(f'{f["id"]}_{limpeza}_original.wav')
    parcial = destino.with_suffix('.parte.wav')
    try:
        bruto = projeto.pasta(id) / f['arquivo']
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(bruto), '-vn', '-af', para_mono(bruto), '-ar', '48000', str(entrada)],
                       check=True, capture_output=True)
        if limpeza == 'isolamento':
            _isolar(entrada, parcial)
        else:
            _deepfilter(entrada, parcial, LIMPEZAS[limpeza] or 0)
        os.replace(parcial, destino)
    finally:
        entrada.unlink(missing_ok=True)
        parcial.unlink(missing_ok=True)
    return destino


def _limpar(id: str, limpeza: str) -> None:
    try:
        _marcar(id, limpeza, estado='rodando', progresso=0.05)
        voz = gerar_wav(id, limpeza)
        lufs_da_voz(id, limpeza)
        _marcar(id, limpeza, progresso=0.8)
        p = projeto.ler(id)
        f, versao = _bruto(p), versao_do_video(p)
        if not f.get('proxy'):  # um Reenquadrar começou: o proxy com a voz é feito quando o novo proxy existir
            return _esquecer(id, limpeza)
        destino = proxy_voz(id, p, limpeza)
        _proxy_com_voz(projeto.pasta(id) / f['proxy'], voz, destino)
        p = projeto.ler(id)
        if versao_do_video(p) != versao or not _bruto(p).get('proxy'):  # reenquadrado no meio: o vídeo é o velho
            destino.unlink(missing_ok=True)
            return _esquecer(id, limpeza)
        _marcar(id, limpeza, estado='pronta', progresso=1, erro=None)
        # os proxies das outras limpezas, um pouco depois: a prévia ainda toca o anterior até ver esta pronta
        if APAGAR_DEPOIS:
            t = threading.Timer(APAGAR_DEPOIS, _apagar_outros, (id, limpeza))
            t.daemon = True
            t.start()
        else:
            _apagar_outros(id, limpeza)
    except Exception as e:  # noqa: BLE001 — o erro vai para a tela
        traceback.print_exc()
        _marcar(id, limpeza, estado='erro', erro=str(e)[:300])


def _apagar_outros(id: str, limpeza: str) -> None:
    """Apaga os proxies com a voz das outras limpezas e versões do vídeo (~50 MB cada para 2 min; refeitos em segundos
    se a escolha voltar, o wav fica) — só se `limpeza` ainda é a escolhida e está pronta: uma limpeza que terminou
    depois de o criador voltar para outra não apaga o vídeo que a prévia está tocando."""
    try:
        p = projeto.ler(id)
        if do_projeto(p)['voz']['limpeza'] != limpeza:
            return
        e = estado_voz(id)
        if e.get('estado') != 'pronta':
            return
        destino = projeto.pasta(id) / e['proxy']
        for velho in destino.parent.glob(f'{_bruto(p)["id"]}_voz_*.mp4'):
            if velho != destino and not velho.name.endswith('.parte.mp4'):
                velho.unlink(missing_ok=True)
    except (FileNotFoundError, ValueError, KeyError, StopIteration):
        pass  # o projeto sumiu (ou não tem bruto): nada a apagar


def _deepfilter(entrada: Path, saida: Path, limite: float) -> None:
    r = subprocess.run([*DEEPFILTER, str(Path(__file__).with_name('_voz_deepfilter.py')), str(entrada), str(saida), str(limite)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not saida.exists():
        raise RuntimeError(f'DeepFilterNet falhou: {r.stderr[-300:]}')


def _isolar(entrada: Path, saida: Path) -> None:
    """O Voice Isolator do ElevenLabs (pago; manda a voz a um terceiro): só com ELEVENLABS_API_KEY em backend/.env."""
    import httpx

    comum.carregar_env()
    chave = os.environ.get('ELEVENLABS_API_KEY')
    if not chave:
        raise RuntimeError('Falta a ELEVENLABS_API_KEY em backend/.env')
    with entrada.open('rb') as f:
        r = httpx.post(ISOLAMENTO_URL, headers={'xi-api-key': chave}, files={'audio': (entrada.name, f, 'audio/wav')}, timeout=600)
    if r.status_code >= 400:
        raise RuntimeError(f'ElevenLabs respondeu {r.status_code}: {r.text[:200]}')
    bruto = saida.with_suffix('.isolado')
    bruto.write_bytes(r.content)
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(bruto), '-ac', '1', '-ar', '48000', str(saida)], check=True, capture_output=True)
    finally:
        bruto.unlink(missing_ok=True)


def _proxy_com_voz(proxy: Path, voz: Path, destino: Path) -> None:
    """O proxy da prévia com a voz trocada (o vídeo copiado, sem recodificar; a voz mono, que o navegador toca igual
    nos dois canais)."""
    if not proxy.exists():
        raise RuntimeError('O proxy do vídeo ainda não existe')
    parcial = destino.with_name(destino.stem + '.parte.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(proxy), '-i', str(voz), '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(parcial)], check=True, capture_output=True)
    os.replace(parcial, destino)


# ---------------------------------------------------------------- as falas (o ducking do fundo)

def falas(palavras_saida: list[dict]) -> list[tuple[float, float]]:
    """Os trechos em que o ator fala, no tempo da saída: as palavras juntas quando a pausa é menor que `JUNTA`."""
    out: list[list[float]] = []
    for w in sorted(palavras_saida, key=lambda w: w['saida_ini']):
        if out and w['saida_ini'] - out[-1][1] < JUNTA:
            out[-1][1] = max(out[-1][1], w['saida_fim'])
        else:
            out.append([w['saida_ini'], w['saida_fim']])
    return [(round(a, 3), round(b, 3)) for a, b in out]


def _suave(u: str) -> str:
    return f'({u}*{u}*(3-2*{u}))'


def expressao_ducking(trechos: list[tuple[float, float]], ducking_db: float = DUCKING_DB) -> str:
    """O ganho do fundo no tempo `t` (expressão do `volume` do ffmpeg, eval=frame): 1 longe das falas e
    10^(−ducking/20) durante elas, com rampas suaves (`SUBIDA` antes, `DESCIDA` depois). Igual a `audio.ts`."""
    if not trechos or ducking_db <= 0:
        return '1'
    termos = []
    for a, b in trechos:
        sobe = _suave(f'clip((t-{a - SUBIDA:.3f})/{SUBIDA},0,1)')
        desce = _suave(f'clip(({b + DESCIDA:.3f}-t)/{DESCIDA},0,1)')
        termos.append(f'min({sobe},{desce})')
    return f'1-{1 - db(-ducking_db):.4f}*min({"+".join(termos)},1)'


def ganho_ducking(trechos: list[tuple[float, float]], t: float, ducking_db: float = DUCKING_DB) -> float:
    """O mesmo ganho em Python (para os testes)."""
    def s(u: float) -> float:
        u = min(max(u, 0), 1)
        return u * u * (3 - 2 * u)
    k = sum(min(s((t - (a - SUBIDA)) / SUBIDA), s(((b + DESCIDA) - t) / DESCIDA)) for a, b in trechos)
    return 1 - (1 - db(-ducking_db)) * min(k, 1)


# ---------------------------------------------------------------- a mistura na exportação (SPEC §13, camada A)

def cadeia_voz(timbre: str, ganho_db: float) -> str:
    """Os filtros da voz depois da limpeza: passa-altas, timbre, compressor e o fader do ator."""
    f = [f'highpass=f={PASSA_ALTAS}']
    f += [f'equalizer=f={fr}:t=q:w={q}:g={g}' for fr, g, q in TIMBRES[timbre]]
    c = COMPRESSOR
    f.append(f"acompressor=threshold={db(c['limiar']):.5f}:ratio={c['razao']}:attack={c['ataque'] * 1000:.0f}:release={c['soltura'] * 1000:.0f}:knee={db(c['joelho']):.3f}")
    f.append(f'volume={ganho_db:.1f}dB')
    return ','.join(f)


def voltas_do_fundo(laco: tuple[float, float], duracao: float, cruza: float = CRUZA_FUNDO) -> list[tuple[float, float]]:
    """Os pedaços da faixa (no tempo dela) que cobrem `duracao`: a 1ª volta do 0 até o fim do laço e as outras dentro
    dele, cada uma emendada na anterior com um crossfade de `cruza` s. Igual a `pedacosDoFundo` em `audio.ts`."""
    ini, fim = laco
    cruza = min(cruza, (fim - ini) / 2)
    if duracao <= fim:
        return [(0.0, fim)]
    voltas = math.ceil((duracao - fim) / (fim - ini - cruza))
    return [(0.0, fim)] + [(ini, fim)] * voltas


def filtros(a: dict, clipes: list[dict], eventos_som: list[dict], primeira_entrada: int, saida: str, duracao: float,
            medida: dict | None = None) -> tuple[list[str], list[str]]:
    """O áudio inteiro da P3, de entradas próprias (a voz — limpa ou do bruto — e a faixa de fundo; os sons vêm de
    `sons.filtro_mistura`): a voz cortada nos clipes da V1 (como o `_ator`), a cadeia da voz (e a voz em estéreo, ganho 1
    nos dois canais), os sons de cada grupo no seu fader, o fundo nas voltas do laço com crossfade, fade e ducking, e o
    −14 LUFS (`medida`: o ganho medido por `medir`, e um limitador de pico; sem ela, o `loudnorm` dinâmico).
    `a`: `{voz: Path, voz_lufs, timbre, niveis, fundo: Path | None, laco: (ini, fim) | None, fundo_mudo, falas: [(ini, fim)],
    ducking_db}`. Devolve (entradas, filtros), com a mistura em [`saida`]."""
    from . import sons
    from .exportacao import FADE

    entradas = ['-i', str(a['voz'])]
    n = len(clipes)
    f = [f'[{primeira_entrada}:a]aresample=48000,{para_mono(Path(a["voz"]))},asplit={n}' + ''.join(f'[pv{k}]' for k in range(n))]
    for k, c in enumerate(clipes):
        dur = c['fim'] - c['inicio']
        f.append(f"[pv{k}]atrim=start={c['inicio']:.4f}:end={c['fim']:.4f},asetpts=PTS-STARTPTS,"
                 f'afade=t=in:d={FADE},afade=t=out:st={max(dur - FADE, 0):.4f}:d={FADE}[pc{k}]')
    f.append(''.join(f'[pc{k}]' for k in range(n)) + f'concat=n={n}:v=0:a=1,{cadeia_voz(a["timbre"], a["niveis"]["ator"])},'
             f'{VOZ_ESTEREO}[pvoz]')
    # os sons, cada grupo no seu fader
    ev = [{**e, 'ganho': float(e.get('ganho', 0.3)) * db(a['niveis']['transicoes' if e.get('grupo') == 'transicoes' else 'presets'])} for e in eventos_som]
    ent_s, f_s = sons.filtro_mistura(ev, primeira_entrada + 1, 'pvoz', 'pmix')
    entradas += ent_s
    f += f_s
    atual = 'pmix'
    if a.get('fundo') and not a.get('fundo_mudo'):
        idx = primeira_entrada + entradas.count('-i')
        # cada volta numa entrada própria (o mesmo arquivo), emendadas com crossfade de potência constante
        voltas = voltas_do_fundo(tuple(a.get('laco') or (0.0, duracao)), duracao)
        for k, (de, ate) in enumerate(voltas):
            entradas += ['-i', str(a['fundo'])]
            f.append(f'[{idx + k}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start={de:.3f}:end={ate:.3f},asetpts=PTS-STARTPTS[pf{k}]')
        cruza = min(CRUZA_FUNDO, (voltas[-1][1] - voltas[-1][0]) / 2)
        for k in range(1, len(voltas)):
            f.append(f'[{"pf0" if k == 1 else f"pfx{k - 1}"}][pf{k}]acrossfade=d={cruza:.3f}:c1=qsin:c2=qsin[pfx{k}]')
        ganho = ganho_fundo(a['voz_lufs'], a['niveis']['fundo'])
        f.append(f"[{'pf0' if len(voltas) == 1 else f'pfx{len(voltas) - 1}'}]atrim=duration={duracao:.4f},asetpts=PTS-STARTPTS,"
                 f"afade=t=out:st={max(duracao - FADE_FUNDO, 0):.4f}:d={FADE_FUNDO},volume={ganho:.1f}dB,"
                 f"volume='{expressao_ducking(a.get('falas') or [], a.get('ducking_db', DUCKING_DB))}':eval=frame[pfd]")
        f.append(f'[{atual}][pfd]amix=inputs=2:duration=first:normalize=0[pmixf]')
        atual = 'pmixf'
    if medida:
        fim = f"volume={medida['ganho']:.2f}dB,alimiter=limit={db(LIMITE_DB):.4f}:attack=5:release=50:level=0:latency=1"
    else:
        fim = f'loudnorm=I={LUFS}:TP={PICO}:LRA=11'
    f.append(f'[{atual}]{fim},aresample=48000,aformat=channel_layouts=stereo[{saida}]')
    return entradas, f


def _medir_mistura(a: dict, clipes: list[dict], eventos_som: list[dict], duracao: float, ganho: float) -> dict:
    """A sonoridade (LUFS) e o pico verdadeiro (dBTP) da mistura com o ganho e o limitador (só o áudio: rápido)."""
    entradas, f = filtros(a, clipes, eventos_som, 0, 'pfim', duracao, {'ganho': ganho})
    f.append('[pfim]ebur128=peak=true[pmed]')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *entradas, '-filter_complex', ';'.join(f), '-map', '[pmed]', '-t', f'{duracao:.4f}',
                        '-f', 'null', '-'], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'ffmpeg (medida do áudio) falhou: {r.stderr[-300:]}')
    i = re.findall(r'I:\s+(-?[\d.]+|-inf) LUFS', r.stderr)
    pico = re.findall(r'Peak:\s+(-?[\d.]+|-inf) dBFS', r.stderr)
    if not i:
        raise RuntimeError('A medida do áudio não veio')
    return {'i': float(i[-1]), 'pico': float(pico[-1]) if pico else None}


def medir(a: dict, clipes: list[dict], eventos_som: list[dict], duracao: float) -> dict:
    """O ganho do −14 LUFS: parte da sonoridade da voz (o grosso da mistura) e corrige pelo medido na mistura inteira,
    já com o limitador (que tira um pouco dos picos), até ficar a 0,3 LU do alvo (em geral, 1 ou 2 passadas do áudio
    sozinho). Devolve `{ganho, i, pico}`."""
    ganho = min(max(LUFS - (a['voz_lufs'] + a['niveis']['ator']), -GANHO_MAX), GANHO_MAX)
    m = {}
    for _ in range(3):
        m = _medir_mistura(a, clipes, eventos_som, duracao, ganho)
        if m['i'] == float('-inf'):
            break  # silêncio: não há o que normalizar
        erro = LUFS - m['i']
        if abs(erro) <= 0.3:
            break
        ganho = min(max(ganho + erro, -GANHO_MAX), GANHO_MAX)
    return {'ganho': round(ganho, 2), **m}


def da_exportacao(id: str, p: dict, clipes: list[dict]) -> dict:
    """O que a exportação precisa do áudio do projeto: a voz (a limpa; sem limpeza, a do bruto), as escolhas, a faixa
    de fundo (e o laço dela) e as falas no tempo da saída. Se a limpeza falhar (o DeepFilterNet não instala, o
    ElevenLabs não responde), a voz do bruto, com um `aviso`: a exportação não falha por isso."""
    from . import direcao_projeto, trilhas

    a = do_projeto(p)
    f = _bruto(p)
    limpeza, aviso = a['voz']['limpeza'], None
    # a limpeza escolhida, feita agora se ainda não existe (o DeepFilterNet leva segundos; o isolamento só roda se foi escolhido)
    voz = projeto.pasta(id) / f['arquivo']
    if limpeza != 'sem':
        try:
            voz = gerar_wav(id, limpeza)
        except Exception as e:  # noqa: BLE001 — o vídeo sai com a voz original e o aviso vai para a tela
            traceback.print_exc()
            limpeza, aviso = 'sem', f'Não deu para limpar a voz ({str(e)[:160]}): o vídeo saiu com a voz original.'
    fundo = trilhas.arquivo(a['fundo']) if a['fundo'] and trilhas.existe(a['fundo']) else None
    try:
        palavras = projeto.ler_palavras(id)
    except (FileNotFoundError, ValueError):
        palavras = []
    return {'voz': voz, 'voz_lufs': lufs_da_voz(id, limpeza), 'timbre': a['voz']['timbre'], 'niveis': a['niveis'], 'fundo': fundo,
            'laco': trilhas.laco(a['fundo']) if fundo else None, 'fundo_mudo': a['fundo_mudo'],
            'falas': falas(direcao_projeto.palavras_na_saida(palavras, clipes)), 'ducking_db': DUCKING_DB, 'aviso': aviso}
