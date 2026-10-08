/** Curvas de movimento (cubic-bezier, como no CSS). Regra de Rodrigo (out/2026): nenhuma transição linear — tudo acelera
 *  ou desacelera com elegância. `bezier(x1, y1, x2, y2)` devolve a função t → progresso, para animar pelo tempo do vídeo. */
const solvers = new Map<string, (t: number) => number>()

/** A curva pronta para usar (o solver é montado uma vez por curva: a prévia e a exportação chamam a cada quadro). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const chave = `${x1},${y1},${x2},${y2}`
  let f = solvers.get(chave)
  if (!f) solvers.set(chave, (f = montar(x1, y1, x2, y2)))
  return f
}

/** Prende entre 0 e 1. */
export const limite01 = (v: number) => Math.max(0, Math.min(1, v))

function montar(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
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
