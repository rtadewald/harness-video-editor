/** Curvas de movimento (cubic-bezier, como no CSS). Regra de Rodrigo (out/2026): nenhuma transição linear — tudo acelera
 *  ou desacelera com elegância. `bezier(x1, y1, x2, y2)` devolve a função t → progresso, para animar pelo tempo do vídeo. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const x = (s: number) => ((ax * s + bx) * s + cx) * s
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  const y = (s: number) => ((ay * s + by) * s + cy) * s
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let s = t
    for (let i = 0; i < 8; i++) {
      const d = dx(s)
      if (Math.abs(d) < 1e-6) break
      s -= (x(s) - t) / d
    }
    s = Math.min(1, Math.max(0, s))
    for (let i = 0, a = 0, b = 1; i < 20 && Math.abs(x(s) - t) > 1e-5; i++) {
      if (x(s) < t) a = s
      else b = s
      s = (a + b) / 2
    }
    return y(s)
  }
}

/** Chega rápido e assenta devagar (expo out): entradas. */
export const CHEGAR = bezier(0.16, 1, 0.3, 1)
/** Passa um pouco do ponto e volta (back out): a mola. */
export const MOLA = bezier(0.34, 1.56, 0.64, 1)
/** Começa devagar e sai acelerando: saídas. */
export const SAIR = bezier(0.7, 0, 0.84, 0)
/** Acelera e desacelera (in-out): movimentos longos (zoom, rolagem, misturas). */
export const SUAVE = bezier(0.65, 0, 0.35, 1)
/** Empurrão de câmera bem leve: já começa andando e vai assentando (a "seca + zoom leve", que dura a mídia toda). */
export const ZOOM_LEVE = bezier(0.3, 0.2, 0.4, 1)
