import { bezier } from './curvas'
import type { Curva } from './enriquecimento'

/** O desenho da curva (o progresso ao longo do tempo), como ícone do preset. */
export default function IconeCurva({ curva }: { curva: Curva }) {
  const f = bezier(...curva)
  const pontos = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24
    return `${2 + t * 32},${22 - f(t) * 18}`
  }).join(' ')
  return (
    <svg viewBox="0 0 36 26" className="h-6 w-9">
      <line x1="2" y1="22" x2="34" y2="22" className="stroke-current opacity-25" strokeWidth={1} />
      <polyline points={pontos} className="fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
