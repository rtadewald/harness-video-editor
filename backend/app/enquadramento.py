"""Enquadramento de 16:9 para 9:16 pelo rosto (docs/preprocessamento.md, "Enquadramento"). Um bruto horizontal vira um
bruto 9:16 antes de tudo (o resto do processo parte dele; o original fica em `midia/original/`): o rosto é medido no
original (`rosto.medir`), a câmera segue o rosto devagar — uma zona morta e uma mola com velocidade máxima, numa passada
só (sem adiantar o ator), que cede quando o rosto vai sair de uma faixa segura do quadro, e uma suavização curta sem
fase — e o ffmpeg recorta cada quadro na posição do caminho (`sendcmd` no `crop`). Dá para refazer com outra suavidade
ou um deslocamento fixo ("Reenquadrar"): o tempo é o mesmo, então os cortes e o resto continuam valendo."""
import math
import shutil
import statistics
import subprocess
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import comum, midia, projeto

# a suavidade da câmera: a zona morta (fração da largura do recorte em que o rosto anda sem a câmera andar), a
# velocidade máxima (fração da largura do recorte por segundo) e a rigidez da mola (1/s)
SUAVIDADES = {'calma': {'zona': 0.10, 'vel': 0.10, 'mola': 1.5}, 'normal': {'zona': 0.08, 'vel': 0.2, 'mola': 2.5},
              'agil': {'zona': 0.05, 'vel': 0.25, 'mola': 4.0}}
# a faixa segura (o quanto o centro do rosto pode se afastar do centro do recorte, em fração da largura dele): fora dela,
# a mola puxa mais (`PUXA`, 1/s²) e a velocidade máxima cede. `LIMITE`: a trava antes da suavização (o rosto entre 20% e
# 80% do quadro); `BORDA`: a trava depois dela (entre 10% e 90%), que só age num salto do rosto (outra pessoa, um erro)
FAIXA = 0.2
PUXA = 30.0
LIMITE = 0.3
BORDA = 0.4
SUAVIZA = 0.25  # o desvio da suavização final (s): tira o tranco das acelerações sem adiantar a câmera mais que ~0,5 s
MEDIANA = 5  # amostras: a mediana móvel do rosto tira uma detecção errada isolada sem atrasar um deslocamento
PADRAO = {'suavidade': 'normal', 'desloca': 0.0}
_fila = ThreadPoolExecutor(max_workers=1)
_trava = threading.Lock()
_travas: dict[str, threading.Lock] = {}  # uma por projeto: o pipeline e o Reenquadrar nunca geram o 9:16 ao mesmo tempo


def horizontal(fonte: dict) -> bool:
    return (fonte.get('largura') or 0) > (fonte.get('altura') or 0)


def largura_recorte(largura: int, altura: int) -> int:
    """A largura do recorte 9:16 na altura inteira do original (par, para o codificador)."""
    return min(int(round(altura * 9 / 16 / 2)) * 2, largura - largura % 2)


def _gauss(xs: list[float], sigma: float) -> list[float]:
    """Média gaussiana centrada (sem atraso nem adianto), com as pontas repetidas."""
    r = int(3 * sigma)
    if r < 1:
        return list(xs)
    pesos = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-r, r + 1)]
    total = sum(pesos)
    n = len(xs)
    return [sum(xs[min(max(i + j, 0), n - 1)] * w for j, w in zip(range(-r, r + 1), pesos)) / total for i in range(n)]


def caminho(amostras: list[dict], por_segundo: float, largura: int, altura: int, suavidade: str = 'normal', desloca: float = 0) -> list[float]:
    """O centro do recorte (fração da largura do original) em cada amostra do rosto. `desloca`: um deslocamento fixo
    do rosto dentro do recorte (fração da largura do recorte; positivo: o rosto mais para a esquerda do quadro). Sem
    rosto num trecho (amostra com confiança 0, preenchida pela vizinha), a câmera fica onde estava; sem rosto no vídeo
    inteiro, o recorte fica no centro (um caminho de um ponto só)."""
    s = SUAVIDADES.get(suavidade, SUAVIDADES['normal'])
    cw = largura_recorte(largura, altura) / largura
    lo, hi = cw / 2, 1 - cw / 2
    achado = [a.get('cx') for a in amostras if a.get('conf') and a.get('cx') is not None]
    if not achado:
        return [round(min(max(0.5 + desloca * cw, lo), hi), 5)]
    rosto, ult = [], achado[0]
    for a in amostras:  # nos buracos, o rosto fica onde foi visto por último (no começo, onde aparece primeiro)
        if a.get('conf') and a.get('cx') is not None:
            ult = a['cx']
        rosto.append(ult)
    m = MEDIANA // 2
    alvos = [statistics.median(rosto[max(i - m, 0):i + m + 1]) + desloca * cw for i in range(len(rosto))]
    dt = 1 / por_segundo
    zona, vmax, k, faixa = s['zona'] * cw, s['vel'] * cw, s['mola'], FAIXA * cw
    x, v, ida = min(max(alvos[0], lo), hi), 0.0, []
    for a in alvos:
        erro = a - x
        lado = 1 if erro > 0 else -1
        # dentro da zona morta, a câmera não persegue; fora, vai até deixar o rosto na borda da zona
        meta = x if abs(erro) <= zona else a - zona * lado
        fora = max(abs(erro) - faixa, 0)  # o quanto o rosto passou da faixa segura
        # mola criticamente amortecida, com velocidade limitada; fora da faixa, puxa mais e o limite cede
        acel = k * k * (meta - x) - 2 * k * v + PUXA * fora * lado
        lim = vmax + 2 * k * fora
        v = min(max(v + acel * dt, -lim), lim)
        x += v * dt
        ida.append(x)
    travada = [min(max(c, a - LIMITE * cw), a + LIMITE * cw) for c, a in zip(ida, alvos)]
    suave = _gauss(travada, SUAVIZA * por_segundo)
    return [round(min(max(min(max(c, a - BORDA * cw), a + BORDA * cw), lo), hi), 5) for c, a in zip(suave, alvos)]


def comandos_crop(centros: list[float], por_segundo: float, largura: int, altura: int, fps: float, duracao: float) -> str:
    """Os comandos do `sendcmd` para o `crop@c`: o x (px) de cada quadro, interpolado entre as amostras."""
    cw = largura_recorte(largura, altura)
    centros = centros or [0.5]  # sem caminho: o recorte no centro
    n = max(int(duracao * fps) + 1, 1)
    ts = [k / fps for k in range(n)]
    xs = []
    for t in ts:
        i = t * por_segundo
        a = min(int(i), len(centros) - 1)
        b = min(a + 1, len(centros) - 1)
        c = centros[a] + (centros[b] - centros[a]) * (i - a)
        xs.append(int(round(c * largura - cw / 2)))
    return ''.join(f'{t:.4f} crop@c x {min(max(x, 0), largura - cw)};\n' for t, x in zip(ts, xs))


def renderizar(original: Path, destino: Path, centros: list[float], por_segundo: float, info: dict, progresso=lambda f: None) -> None:
    """O bruto 9:16: cada quadro recortado na posição do caminho, na altura original, HEVC de alta qualidade pelo chip
    do Mac; o áudio copiado como está."""
    largura, altura = info['largura'], info['altura']
    cw = largura_recorte(largura, altura)
    fps = _fps(info.get('fps'))
    cmds = destino.with_suffix('.cmds')
    destino.parent.mkdir(parents=True, exist_ok=True)
    cmds.write_text(comandos_crop(centros, por_segundo, largura, altura, fps, info['duracao']))
    x0 = int(round(centros[0] * largura - cw / 2)) if centros else (largura - cw) // 2
    filtro = f"sendcmd=f='{str(cmds).replace(chr(39), chr(92) + chr(39))}',crop@c=w={cw}:h={altura}:x={x0}:y=0"
    tmp = destino.with_name(destino.stem + '.parte.mp4')
    cmd = ['ffmpeg', '-v', 'error', '-y', '-progress', 'pipe:1', '-nostats', '-i', str(original), '-vf', filtro,
           '-c:v', 'hevc_videotoolbox', '-q:v', '80', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', str(tmp)]
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as ff:
        for linha in ff.stdout:
            if linha.startswith('out_time_us=') and linha.strip()[12:].isdigit() and info['duracao']:
                progresso(min(int(linha.strip()[12:]) / 1e6 / info['duracao'], 1))
        erro = ff.stderr.read()
    if ff.returncode:
        tmp.unlink(missing_ok=True)
        cmds.unlink(missing_ok=True)
        raise RuntimeError(f'ffmpeg (enquadramento) falhou: {erro[-300:]}')
    tmp.replace(destino)
    cmds.unlink(missing_ok=True)


def _fps(f) -> float:
    try:
        a, b = str(f).split('/')
        return float(a) / float(b) if float(b) else 30.0
    except (ValueError, AttributeError):
        return float(f or 30)


# ---------------------------------------------------------------- no projeto

class Ocupado(RuntimeError):
    """Já há um enquadramento (ou o processamento do vídeo) em andamento neste projeto."""


DESTINO = 'midia/bruto_9x16.mp4'


def arquivo_rosto(id: str) -> Path:
    return projeto.pasta(id) / 'midia' / 'rosto' / 'original.json'


def do_projeto(p: dict) -> dict:
    return {**PADRAO, **{k: v for k, v in (p.get('enquadramento') or {}).items() if k in ('suavidade', 'desloca', 'estado', 'progresso', 'erro', 'original', 'versao')}}


def _marcar(id: str, **campos) -> None:
    with _trava:
        projeto.atualizar(id, lambda p: p.setdefault('enquadramento', {}).update(campos))


def _trava_do(id: str) -> threading.Lock:
    with _trava:
        return _travas.setdefault(id, threading.Lock())


def _parametros(e: dict) -> dict:
    return {'suavidade': e['suavidade'], 'desloca': e['desloca']}


def aplicar(id: str, progresso=lambda f: None) -> dict:
    """Num bruto 16:9: mede o rosto no original (uma vez), calcula o caminho e gera o bruto 9:16, que passa a ser o bruto do
    projeto (o original vai para `midia/original/`). Num bruto vertical, não faz nada; se o 9:16 já existe com a mesma
    suavidade e o mesmo deslocamento (o "Tentar de novo" do processamento), não refaz. Devolve o que fez."""
    with _trava_do(id):
        return _aplicar(id, progresso)


def _aplicar(id: str, progresso) -> dict:
    from . import rosto
    base = projeto.pasta(id)
    p = projeto.ler(id)
    fonte = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    e = do_projeto(p)
    original_rel = e.get('original') or (fonte['arquivo'] if horizontal(fonte) else None)
    if not original_rel:
        return {'pulado': 'vertical'}
    destino = base / DESTINO
    if (p.get('enquadramento') or {}).get('feito') == _parametros(e) and fonte['arquivo'] == DESTINO and destino.exists():
        return {'reaproveitado': True}
    original = base / original_rel
    if not e.get('original'):  # a primeira vez: o original vai para midia/original/ (intocado)
        guardado = base / 'midia' / 'original' / original.name
        guardado.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(original), str(guardado))
        original = guardado
        original_rel = str(guardado.relative_to(base))

        def guardar(q):  # o bruto aponta para o original guardado até o 9:16 ficar pronto (nunca para um arquivo que sumiu)
            next(x for x in q['fontes'] if x['papel'] == 'bruto')['arquivo'] = original_rel
            q.setdefault('enquadramento', {})['original'] = original_rel
        with _trava:
            projeto.atualizar(id, guardar)
    info = midia.inspecionar(original)
    arq_rosto = arquivo_rosto(id)
    if arq_rosto.exists():
        medida = comum.ler_json(arq_rosto)
    else:
        medida = rosto.medir(original, lambda f: progresso(f * 0.4))
        comum.salvar_json(arq_rosto, medida)
    centros = caminho(medida['amostras'], medida['por_segundo'], info['largura'], info['altura'], e['suavidade'], e['desloca'])
    tinha_proxy = bool(fonte.get('proxy'))
    renderizar(original, destino, centros, medida['por_segundo'], info, lambda f: progresso(0.4 + f * 0.6))

    def trocar(q):
        f = next(x for x in q['fontes'] if x['papel'] == 'bruto')
        f.update({'arquivo': DESTINO, **midia.inspecionar(destino)})
        f.pop('proxy', None)  # o proxy é refeito do 9:16 (o arquivo antigo fica até o novo o substituir)
        enq = q.get('enquadramento') or {}
        q['enquadramento'] = {**enq, 'x': 0.5, 'original': original_rel, 'feito': _parametros(e), 'versao': int(enq.get('versao') or 0) + 1}
    with _trava:
        projeto.atualizar(id, trocar)
    if tinha_proxy:  # o 9:16 mudou: o recorte e o rosto do ator, feitos do proxy antigo, são refeitos com o novo
        _invalidar_ator(id)
    achados = sum(1 for a in medida['amostras'] if a.get('conf'))
    return {'recorte': largura_recorte(info['largura'], info['altura']), 'rostos': achados, **({} if achados else {'aviso': 'sem rosto: recorte no centro'})}


def _invalidar_ator(id: str) -> None:
    """Tira o recorte e o rosto do ator (o proxy vai mudar). Um que ainda esteja rodando sobre o vídeo antigo termina
    depois, vê que a versão do 9:16 mudou e descarta o resultado (`recorte_ator.versao_do_video`); o novo é pedido
    quando o proxy novo fica pronto."""
    projeto.atualizar(id, lambda p: [p.pop(k, None) for k in ('recorte', 'rosto')])
    for pasta in ('recorte', 'rosto'):
        for arq in (projeto.pasta(id) / 'midia' / pasta).glob('f*'):
            arq.unlink(missing_ok=True)


def estado(id: str) -> dict:
    """O enquadramento para a tela: a suavidade, o deslocamento, o estado e, se o vídeo veio 16:9, o original, as
    medidas e o caminho da câmera (para desenhar o recorte andando sobre o original). `aplica`: o vídeo veio 16:9 (já
    convertido, com `original`, ou um projeto de antes do enquadramento, ainda horizontal)."""
    p = projeto.ler(id)
    e = do_projeto(p)
    fonte = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    out = {**e, 'aplica': bool(e.get('original')) or horizontal(fonte)}
    if e.get('original') and arquivo_rosto(id).exists():
        info = midia.inspecionar(projeto.pasta(id) / e['original'])
        medida = comum.ler_json(arquivo_rosto(id))
        out |= {'largura': info['largura'], 'altura': info['altura'], 'por_segundo': medida['por_segundo'],
                'recorte': largura_recorte(info['largura'], info['altura']) / info['largura'],
                'caminho': caminho(medida['amostras'], medida['por_segundo'], info['largura'], info['altura'], e['suavidade'], e['desloca'])}
    return out


def _ocupado(p: dict) -> str | None:
    if (p.get('enquadramento') or {}).get('estado') in ('fila', 'rodando'):
        return 'O vídeo já está sendo reenquadrado'
    pl = p.get('pipeline') or {}
    andando = ('rodando',) if pl.get('erro') else ('pendente', 'rodando')  # depois de um erro, o que ficou pendente não anda
    if any(v.get('status') in andando for k, v in (pl.get('passos') or {}).items() if k != 'variantes'):
        return 'Espere o processamento do vídeo terminar'
    return None


def reenquadrar(id: str, suavidade: str | None, desloca: float | None) -> dict:
    """Muda a suavidade e/ou o deslocamento e refaz o bruto 9:16 em segundo plano; depois o proxy, o recorte e o rosto
    do ator (os cortes e a transcrição continuam: o tempo é o mesmo). Num projeto de antes do enquadramento ainda
    horizontal, converte. Levanta `Ocupado` se já houver um em andamento ou o processamento do vídeo não tiver terminado."""
    if suavidade is not None and suavidade not in SUAVIDADES:
        raise ValueError('Suavidade desconhecida')
    campos = {}
    if suavidade is not None:
        campos['suavidade'] = suavidade
    if desloca is not None:
        campos['desloca'] = comum.numero(desloca, -0.4, 0.4, 3)
    erro = []

    def marcar(p):
        fonte = next(f for f in p['fontes'] if f['papel'] == 'bruto')
        if not do_projeto(p).get('original') and not horizontal(fonte):
            erro.append(ValueError('Este vídeo já é vertical: o enquadramento não se aplica'))
        elif motivo := _ocupado(p):
            erro.append(Ocupado(motivo))
        else:
            p.setdefault('enquadramento', {}).update(campos, estado='fila', progresso=0, erro=None)
    with _trava:  # a checagem e a marcação juntas: dois cliques (ou duas abas) não enfileiram dois
        projeto.atualizar(id, marcar)
    if erro:
        raise erro[0]
    _fila.submit(_refazer, id)
    return estado(id)


def retomar_interrompidos() -> None:
    """Se o servidor caiu no meio de um Reenquadrar, apaga o que sobrou do render e recomeça."""
    for resumo in projeto.listar():
        p = projeto.ler(resumo['id'])
        if (p.get('enquadramento') or {}).get('estado') in ('fila', 'rodando'):
            midia_ = projeto.pasta(p['id']) / 'midia'
            for sobra in ('bruto_9x16.parte.mp4', 'bruto_9x16.cmds'):
                (midia_ / sobra).unlink(missing_ok=True)
            _marcar(p['id'], estado='fila', progresso=0, erro=None)
            _fila.submit(_refazer, p['id'])


def _refazer(id: str) -> None:
    """O 9:16 novo e, depois, o proxy (que pede de novo o recorte e o rosto do ator). Só fica 'pronto' com o proxy novo
    no lugar, para a tela recarregar o player já com ele."""
    from . import pipeline
    try:
        _marcar(id, estado='rodando')
        aplicar(id, lambda f: _marcar(id, progresso=round(f * 0.9, 3)))
        _marcar(id, progresso=0.9)
        if not pipeline.refazer_proxy(id):
            raise RuntimeError(projeto.ler(id).get('pipeline', {}).get('erro') or 'o proxy falhou')
        _marcar(id, estado='pronto', progresso=1)
    except Exception as e:
        traceback.print_exc()
        _marcar(id, estado='erro', erro=str(e)[:300])
