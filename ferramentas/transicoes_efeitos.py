"""Ferramenta do Claude: os efeitos das transições entre planos que são um vídeo (docs/transicoes.md), gerados por nós
(ficam no git, em backend/transicoes_efeitos/). Hoje, a **luz colorida** (light leak), recriada quadro a quadro das
referências (48-image-to-html-manychat em 6,9 s e 55,2 s): faixas largas e quase verticais (azul-esverdeado → limão →
cinza) entrando pela esquerda, cobrindo o quadro todo por um instante com uma mancha escura (lente) e sumindo. VP9 com
transparência: a prévia sobrepõe o vídeo e o ffmpeg o mesmo arquivo (o decodificador libvpx mantém o alfa).

    uv run --project backend python ferramentas/transicoes_efeitos.py
"""
import subprocess, sys
import numpy as np
W, H, FPS, DUR = 540, 960, 30, 0.45
PALETA = np.array([[30, 170, 160], [70, 200, 120], [200, 220, 70], [200, 204, 204], [120, 130, 215], [40, 90, 200]], float) / 255

def quadro(t):
    """t em 0–DUR: a luz entra pela esquerda, cobre o quadro em volta de 0,2 s (o corte) e sai pela direita, com uma mancha escura."""
    y, x = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]
    d = x * 1.0 + y * 0.18  # faixas largas, quase verticais
    u = t / DUR
    frente = -0.3 + u * 3.6  # a frente da luz andando (cobre tudo em ~0,2 s)
    # a cor: a paleta deslizando pelas faixas
    pos = np.clip(d * 2.4 + (u - 0.45) * 2.2, 0, len(PALETA) - 1.001)
    i = np.floor(pos).astype(int); f = (pos - i)[..., None]
    f = f * f * (3 - 2 * f)
    cor = PALETA[i % len(PALETA)] * (1 - f) + PALETA[(i + 1) % len(PALETA)] * f
    # a mancha escura (lente), meio à esquerda, que acompanha a luz
    cx, cy = 0.38 + 0.12 * u, 0.47
    g = np.exp(-(((x - cx) / 0.17) ** 2 + ((y - cy) / 0.1) ** 2))
    cor = cor * (1 - 0.95 * g[..., None]) + np.array([0.02, 0.02, 0.08]) * g[..., None]
    # a opacidade: a varredura (a luz cobre de onde a frente já passou) e o envelope no tempo (sobe, cobre, some)
    varre = np.clip((frente - d) / 0.45, 0, 1)
    env = np.interp(u, [0, 0.3, 0.4, 0.55, 0.75, 1], [0, 0.8, 1, 1, 0.3, 0])
    a = np.clip(varre * env, 0, 1)
    return np.dstack([cor, a])

from pathlib import Path
saida = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / 'backend' / 'transicoes_efeitos' / 'luz.webm')
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '2M', '-auto-alt-ref', '0', saida], stdin=subprocess.PIPE)
for k in range(int(DUR * FPS)):
    ff.stdin.write((quadro(k / FPS) * 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
