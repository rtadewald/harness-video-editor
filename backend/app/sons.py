"""Sons de apoio (SPEC §8.6): a biblioteca do time de audiovisual (cliques, pops, whooshes, risers, digitação), cortada,
compactada e no mesmo volume percebido por `ferramentas/sons_biblioteca.py`, em `sons/biblioteca/` (fora do git:
licença do time). Os presets (de enriquecimento e de motion) têm **momentos de som** — um som e uma intensidade em cada
momento (a entrada de cada card, a troca, a saída, o mergulho, a digitação…) — e a exportação mistura os sons com o
áudio do bruto, cada um no seu instante."""
import re
import subprocess
from pathlib import Path

from . import comum, projeto

RAIZ = comum.DADOS / 'sons' / 'biblioteca'
# o ganho de cada intensidade sobre o som normalizado (pico de energia a -18 dBFS), para uma voz no nível das
# referências (`VOZ_REF`): Baixo fica ~16 dB e Médio ~10 dB abaixo da voz (medido nas referências: os sons de apoio
# do time ficam de 14 a 20 dB abaixo dela). Num vídeo com a voz mais baixa, tudo desce junto (`fator_da_voz`).
INTENSIDADES = {'baixo': 0.25, 'medio': 0.5}
VOZ_REF = -14.0  # dBFS: o nível da fala (percentil 90 da energia em janelas de 50 ms) nas referências
# os momentos de um preset de enriquecimento: quando o som toca (ver `eventosDaReceita` no front)
MOMENTOS = ('entrada', 'troca', 'saida', 'mergulho', 'zoom')
_ID = re.compile(r'[a-z0-9][a-z0-9-]{0,60}')


def catalogo() -> list[dict]:
    """Os sons da biblioteca (id, nome, família, duração, `ataque`: o instante do golpe dentro do arquivo)."""
    arq = RAIZ / 'catalogo.json'
    return comum.ler_json(arq) if arq.exists() else []


def arquivo(sid: str) -> Path:
    if not _ID.fullmatch(sid or ''):
        raise FileNotFoundError(sid)
    p = RAIZ / f'{sid}.m4a'
    if not p.exists():
        raise FileNotFoundError(sid)
    return p


def validar(sons) -> list[dict]:
    """Os momentos de som de uma receita: `momento`, `som` (id da biblioteca; None = sem som), `intensidade` e `atraso`
    (s: onde o golpe do som cai em relação ao momento)."""
    if not isinstance(sons, list):
        return []
    out = []
    for s in sons:
        if not isinstance(s, dict) or s.get('momento') not in MOMENTOS or any(x['momento'] == s['momento'] for x in out):
            continue
        som = s.get('som')
        out.append({'momento': s['momento'], 'som': som if isinstance(som, str) and _ID.fullmatch(som) else None,
                    'intensidade': s.get('intensidade') if s.get('intensidade') in INTENSIDADES else 'baixo',
                    'atraso': comum.numero(s.get('atraso', 0) or 0, -3, 3, 3)})
    return out


def filtro_mistura(eventos: list[dict], primeira_entrada: int, rotulo_voz: str, saida: str) -> tuple[list[str], list[str]]:
    """As entradas e os filtros do ffmpeg que põem os sons por cima da voz: cada evento (`som`, `t` no vídeo final,
    `ganho`, `desde`: de onde tocar dentro do arquivo, `dur` opcional) vira um atraso + volume, e tudo soma com a voz
    (sem normalizar: a voz fica como estava). Devolve (entradas, filtros); sem eventos, só renomeia a voz."""
    validos = []
    for e in eventos:
        try:
            validos.append((arquivo(e['som']), max(float(e['t']), 0.0), float(e.get('ganho', INTENSIDADES['baixo'])),
                            max(float(e.get('desde', 0)), 0.0), e.get('dur'), min(max(float(e.get('vel') or 1), 0.5), 2.0)))
        except (FileNotFoundError, KeyError, TypeError, ValueError):
            continue
    if not validos:
        return [], [f'[{rotulo_voz}]anull[{saida}]']
    # um arquivo de entrada por som (dividido entre os usos): um vídeo com muitos cliques não abre centenas de arquivos
    arquivos = list(dict.fromkeys(v[0] for v in validos))
    entradas = [x for a in arquivos for x in ('-i', str(a))]
    usos = {a: [v for v in validos if v[0] == a] for a in arquivos}
    filtros = [f'[{rotulo_voz}]aresample=48000,aformat=channel_layouts=stereo[voz]']
    rotulos = []
    for i, a in enumerate(arquivos):
        n = len(usos[a])
        filtros.append(f'[{primeira_entrada + i}:a]aresample=48000,aformat=channel_layouts=stereo,asplit={n}' + ''.join(f'[f{i}_{j}]' for j in range(n)))
        for j, (_, t, ganho, desde, dur, vel) in enumerate(usos[a]):
            fade = min(0.12, float(dur) / 2) if dur else 0  # o fade do fim: no máximo metade do som
            # o relógio do trecho volta a zero logo depois do corte (o fade conta a partir dali)
            # `desde` e `dur` no tempo do arquivo; `vel`: o som mais rápido ou mais lento (o tom acompanha, como no navegador)
            corte = f'atrim=start={desde:.4f}' + (f':duration={float(dur) * vel:.4f}' if dur else '') + ',asetpts=PTS-STARTPTS'
            if abs(vel - 1) > 0.001:
                corte += f',asetrate={48000 * vel:.2f},aresample=48000'
            if dur:
                corte += f',afade=t=out:st={float(dur) - fade:.3f}:d={fade:.3f}'
            ms = round(t * 1000)
            filtros.append(f'[f{i}_{j}]{corte},volume={ganho:.3f},adelay={ms}|{ms}[s{i}_{j}]')
            rotulos.append(f'[s{i}_{j}]')
    filtros.append(f'[voz]{"".join(rotulos)}amix=inputs={len(rotulos) + 1}:duration=first:normalize=0[{saida}]')
    return entradas, filtros


def nivel_da_voz(arq: Path, ate: float = 180) -> float:
    """O nível da fala de um vídeo (dBFS): o percentil 90 da energia em janelas de 50 ms, nos primeiros `ate` s."""
    import numpy as np
    r = subprocess.run(['ffmpeg', '-v', 'error', '-t', str(ate), '-i', str(arq), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                       capture_output=True)
    x = np.frombuffer(r.stdout, np.float32).astype(np.float64)
    n = len(x) // 800
    if not n:
        return VOZ_REF
    e = np.sqrt((x[: n * 800].reshape(n, 800) ** 2).mean(axis=1))
    return round(float(20 * np.log10(np.percentile(e, 90) + 1e-9)), 2)


def fator_da_voz(nivel: float | None) -> float:
    """Quanto os sons sobem ou descem para ficar na mesma relação com a voz deste vídeo que nas referências."""
    return 1.0 if nivel is None else round(min(max(10 ** ((nivel - VOZ_REF) / 20), 0.1), 3.0), 4)


def fator_do_projeto(id: str) -> float:
    """O `fator_da_voz` do bruto do projeto (medido uma vez e guardado no projeto)."""
    p = projeto.ler(id)
    fonte = next((f for f in p.get('fontes', []) if f.get('papel') == 'bruto'), None)
    if not fonte:
        return 1.0
    guardado = p.get('nivel_voz') or {}
    if guardado.get('fonte') != fonte['id']:
        db = nivel_da_voz(projeto.pasta(id) / fonte['arquivo'])
        projeto.atualizar(id, lambda x: x.__setitem__('nivel_voz', {'fonte': fonte['id'], 'db': db}))
        guardado = {'db': db}
    return fator_da_voz(guardado['db'])
