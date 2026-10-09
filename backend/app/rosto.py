"""O rosto do ator ao longo do vídeo (SPEC §8.7, docs/rosto.md › A medida): o detector de rosto do MediaPipe (BlazeFace
de curta distância, local, sem serviço pago) roda sobre o proxy a ~6 quadros por segundo e grava, para cada instante, a
caixa do rosto (centro, largura e altura, em fração do quadro) e a confiança, em `midia/rosto/<bruto>.json`. Os buracos
(rosto não achado, virado) são preenchidos com a medida vizinha (com confiança 0). Roda uma vez por projeto, em segundo
plano, depois do proxy (como o recorte do ator). Serve a duas áreas: o enquadramento 16:9 → 9:16 (P1, que mede o
original reduzido com `medir`) e o ator nas áreas que sobram da tela dividida (P5, com `rosto_mediano`)."""
import statistics
import subprocess
import tempfile
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from typing import Callable

from . import comum, midia, projeto

MODELO = comum.DADOS / 'modelos' / 'blaze_face_short_range.tflite'
URL_MODELO = ('https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/'
              'blaze_face_short_range.tflite')
POR_SEGUNDO = 6  # amostras por segundo
CONFIANCA_MIN = 0.5
# um detector: recebe um quadro RGB (numpy, altura × largura × 3) e o instante em ms; devolve os rostos achados como
# (x, y, largura, altura, confiança), em pixels
Detector = Callable[[object, int], list[tuple[float, float, float, float, float]]]

_fila = ThreadPoolExecutor(max_workers=1)
_trava = threading.Lock()


def pasta(id: str) -> Path:
    return projeto.pasta(id) / 'midia' / 'rosto'


def arquivo(id: str, bruto: str) -> Path:
    return pasta(id) / f'{bruto}.json'


def _marcar(id: str, **campos) -> None:
    with _trava:
        projeto.atualizar(id, lambda p: p.setdefault('rosto', {}).update(campos))


def estado(id: str) -> dict:
    return projeto.ler(id).get('rosto') or {'estado': 'nenhum'}


def retomar_interrompidos() -> None:
    """Se o servidor caiu no meio, recomeça as medidas que ficaram na fila ou rodando."""
    for resumo in projeto.listar():
        r = projeto.ler(resumo['id']).get('rosto') or {}
        if r.get('estado') in ('fila', 'rodando'):
            _marcar(resumo['id'], estado='erro')
            pedir(resumo['id'])


def pedir(id: str, refazer: bool = False) -> dict:
    """Põe a medida na fila (se ainda não foi feita, falhou ou `refazer`); nunca duas ao mesmo tempo (a checagem e a
    marcação vão juntas, sob a trava)."""
    entrou = []

    def marcar(p: dict) -> None:
        r = p.get('rosto') or {}
        if r.get('estado') in ('fila', 'rodando') or (r.get('estado') == 'pronto' and not refazer):
            return
        p['rosto'] = {**r, 'estado': 'fila', 'progresso': 0, 'erro': None}
        entrou.append(True)
    with _trava:
        projeto.atualizar(id, marcar)
    if entrou:
        _fila.submit(_rodar, id)
    return projeto.ler(id).get('rosto') or {'estado': 'nenhum'}


def _bruto(p: dict) -> tuple[str, Path]:
    f = next(f for f in p['fontes'] if f['papel'] == 'bruto')
    return f['id'], projeto.pasta(p['id']) / (f.get('proxy') or f'midia/proxy/{f["id"]}.mp4')


def _rodar(id: str) -> None:
    from .recorte_ator import versao_do_video
    versao = None
    try:
        _marcar(id, estado='rodando')
        p = projeto.ler(id)
        versao = versao_do_video(p)
        bid, proxy = _bruto(p)
        # sem proxy registrado (sendo refeito depois de um Reenquadrar), a medida não pode sair do vídeo antigo
        if not next(f for f in p['fontes'] if f['papel'] == 'bruto').get('proxy') or not proxy.exists():
            raise RuntimeError('O proxy do vídeo ainda não existe')
        medida = medir(proxy, lambda f: _marcar(id, progresso=round(f, 3)))
        if versao_do_video(projeto.ler(id)) != versao:  # reenquadrado no meio: a medida do vídeo antigo não vale
            return
        destino = arquivo(id, bid)
        destino.parent.mkdir(parents=True, exist_ok=True)
        comum.salvar_json(destino, medida, indent=None)
        achados = sum(a['conf'] > 0 for a in medida['amostras'])
        _marcar(id, estado='pronto', progresso=1, bruto=bid, amostras=len(medida['amostras']), achados=achados)
    except Exception as e:
        traceback.print_exc()
        if versao_do_video(projeto.ler(id)) == versao:
            _marcar(id, estado='erro', erro=str(e)[:300])


def _baixar_modelo() -> None:
    """O modelo (~230 KB, do MediaPipe) fica fora do git: baixa na primeira vez."""
    if MODELO.exists():
        return
    import urllib.request
    MODELO.parent.mkdir(parents=True, exist_ok=True)
    tmp = MODELO.with_suffix('.parte')
    urllib.request.urlretrieve(URL_MODELO, tmp)
    tmp.replace(MODELO)


def detector_mediapipe():
    """O detector de rosto do MediaPipe no modo de vídeo (abre e fecha com `with`)."""
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    _baixar_modelo()
    opcoes = vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=str(MODELO)), running_mode=vision.RunningMode.VIDEO,
                                        min_detection_confidence=CONFIANCA_MIN)

    @contextmanager
    def abrir():
        with vision.FaceDetector.create_from_options(opcoes) as det:
            def detectar(rgb, ms: int):
                r = det.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ms)
                return [(d.bounding_box.origin_x, d.bounding_box.origin_y, d.bounding_box.width, d.bounding_box.height,
                         d.categories[0].score if d.categories else 0.0) for d in r.detections]
            yield detectar
    return abrir()


def _quadros(video: Path, por_segundo: int):
    """Os quadros do vídeo a `por_segundo` por segundo, em RGB, como o espectador vê (pelo ffmpeg, já com a rotação do
    metadado): (índice, quadro, largura, altura, duração do vídeo). Se o ffmpeg falha (arquivo truncado ou corrompido)
    ou entrega bem menos quadros do que a duração pede, levanta RuntimeError — para não passar por "vídeo sem rosto"."""
    import numpy as np
    info = midia.inspecionar(video)
    w, h, duracao = info['largura'], info['altura'], info['duracao']
    # o detector não precisa de mais que ~1280 px (as medidas saem em fração do quadro): um 4K reduzido não passa ~25 MB
    # por quadro pelo cano
    k_esc = min(1.0, 1280 / max(w, h, 1))
    w, h = max(int(w * k_esc) // 2 * 2, 2), max(int(h * k_esc) // 2 * 2, 2)
    with tempfile.TemporaryFile() as erros:  # num arquivo, para o stderr nunca encher o cano e travar o ffmpeg
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(video), '-vf', f'fps={por_segundo},scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                              stdout=subprocess.PIPE, stderr=erros)
        tamanho = w * h * 3
        k = 0
        leu_tudo = False
        try:
            while True:
                buf = ff.stdout.read(tamanho)
                if len(buf) < tamanho:
                    leu_tudo = True
                    break
                yield k, np.frombuffer(buf, np.uint8).reshape(h, w, 3), w, h, duracao
                k += 1
        finally:
            ff.stdout.close()
            codigo = ff.wait()
        if leu_tudo:  # quem parou de ler no meio (de propósito) não confere nada
            erros.seek(0)
            msg = erros.read().decode('utf-8', 'replace').strip().splitlines()
            if codigo != 0:
                raise RuntimeError(f'O ffmpeg falhou ao ler o vídeo ({codigo}): {msg[-1] if msg else "sem mensagem"}')
            if duracao and k < duracao * por_segundo / 2:
                raise RuntimeError(f'O vídeo parece incompleto: {k} quadros em {duracao:.1f} s')


def medir(video: Path, progresso: Callable[[float], None] = lambda f: None, abrir_detector=None,
          por_segundo: int = POR_SEGUNDO) -> dict:
    """Mede o rosto em `video`: `{por_segundo, largura, altura, amostras: [{t, cx, cy, w, h, conf}]}` (posição e tamanho em
    fração do quadro; com mais de um rosto, vale o maior — o mais perto da câmera). `abrir_detector` (para os testes) é
    um gerenciador de contexto que entrega um `Detector`; o padrão é o do MediaPipe."""
    amostras: list[dict | None] = []
    largura = altura = 0
    with (abrir_detector or detector_mediapipe()) as detectar:
        for k, rgb, w, h, duracao in _quadros(video, por_segundo):
            largura, altura = w, h
            t = k / por_segundo
            rostos = detectar(rgb, round(t * 1000))
            if rostos:
                x, y, rw, rh, conf = max(rostos, key=lambda r: r[2] * r[3])
                amostras.append({'t': round(t, 3), 'cx': round((x + rw / 2) / w, 4), 'cy': round((y + rh / 2) / h, 4),
                                 'w': round(rw / w, 4), 'h': round(rh / h, 4), 'conf': round(float(conf), 3)})
            else:
                amostras.append({'t': round(t, 3), 'conf': None})
            if k % (por_segundo * 5) == 0 and duracao:
                progresso(min(t / duracao, 0.99))
    return {'por_segundo': por_segundo, 'largura': largura, 'altura': altura, 'amostras': preencher(amostras)}


def preencher(amostras: list[dict]) -> list[dict]:
    """Os buracos (sem rosto) recebem a caixa da medida mais próxima no tempo (empate: a anterior), com confiança 0.
    Sem nenhum rosto no vídeo, não sobra amostra."""
    achadas = [i for i, a in enumerate(amostras) if a.get('conf') is not None]
    if not achadas:
        return []
    out = []
    j = 0  # índice em `achadas` da primeira achada em i ou depois
    for i, a in enumerate(amostras):
        while j < len(achadas) and achadas[j] < i:
            j += 1
        if a.get('conf') is not None:
            out.append(a)
            continue
        antes = achadas[j - 1] if j > 0 else None
        depois = achadas[j] if j < len(achadas) else None
        viz = antes if depois is None or (antes is not None and i - antes <= depois - i) else depois
        out.append({**{k: amostras[viz][k] for k in ('cx', 'cy', 'w', 'h')}, 't': a['t'], 'conf': 0})
    return out


def ler(id: str) -> dict | None:
    """A medida do rosto do bruto do projeto (ou None, se ainda não foi feita)."""
    bid, _ = _bruto(projeto.ler(id))
    arq = arquivo(id, bid)
    return comum.ler_json(arq) if arq.exists() else None


def rosto_mediano(id: str, ini: float, fim: float) -> dict | None:
    """A caixa típica do rosto num intervalo do bruto (s): a mediana de cada medida (cx, cy, w, h) nas amostras de
    dentro dele — as medidas de verdade; se não houver, as preenchidas; num intervalo sem amostra, a mais próxima.
    None se o rosto ainda não foi medido ou não aparece no vídeo."""
    m = ler(id)
    amostras = (m or {}).get('amostras') or []
    if not amostras:
        return None
    dentro = [a for a in amostras if ini <= a['t'] <= fim]
    escolha = [a for a in dentro if a['conf'] > 0] or dentro or [min(amostras, key=lambda a: abs(a['t'] - (ini + fim) / 2))]
    return {k: round(statistics.median(a[k] for a in escolha), 4) for k in ('cx', 'cy', 'w', 'h')}
