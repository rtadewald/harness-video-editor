import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { bezier } from './curvas'
import { PRESETS_CURVA, iguais, type Curva } from './enriquecimento'

const W = 220
const H = 150
const M = 18 // folga em volta: a curva pode passar de 0 e de 1 (um "overshoot")
const Y0 = 0.25 // quanto do quadro fica abaixo de 0 e acima de 1, em fração da altura útil
const util = H - 2 * M
const px = (x: number) => M + x * (W - 2 * M)
const py = (y: number) => M + util * Y0 + (1 - y) * util * (1 - 2 * Y0)
const deX = (v: number) => (v - M) / (W - 2 * M)
const deY = (v: number) => 1 - (v - M - util * Y0) / (util * (1 - 2 * Y0))
const r2 = (v: number) => Math.round(v * 100) / 100

/** O editor de uma curva (cubic-bezier): arrastar os dois pontos muda a curva na hora (`mudar(c, false)`) e salva ao
 *  soltar (`mudar(c, true)`); os atalhos aplicam curvas prontas. Uma bolinha mostra o ritmo. */
export default function EditorCurva(p: { curva: Curva; mudar: (c: Curva, salvar: boolean) => void }) {
  const [c, setC] = useState<Curva>(p.curva)
  useEffect(() => setC(p.curva), [p.curva])
  const svg = useRef<SVGSVGElement>(null)
  const arrastar = (k: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault()
    const r = svg.current!.getBoundingClientRect()
    let atual = c
    const mover = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, deX(((ev.clientX - r.left) / r.width) * W)))
      const y = Math.min(1.5, Math.max(-0.5, deY(((ev.clientY - r.top) / r.height) * H)))
      atual = (k === 0 ? [r2(x), r2(y), atual[2], atual[3]] : [atual[0], atual[1], r2(x), r2(y)]) as Curva
      setC(atual)
      p.mudar(atual, false)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      p.mudar(atual, true)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const f = bezier(...c)
  const linha = Array.from({ length: 49 }, (_, i) => `${px(i / 48)},${py(f(i / 48))}`).join(' ')
  // a bolinha: anda pela curva em loop (o ritmo do movimento)
  const [t, setT] = useState(0)
  useEffect(() => {
    let id = 0
    const ini = performance.now()
    const passo = (agora: number) => {
      setT(Math.min((((agora - ini) / 1000) % 1.6) / 1.2, 1))
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="grid gap-2">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none rounded-[6px] bg-ink/60 ring-1 ring-line-dark">
        <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(0)} className="stroke-cream/15" />
        <line x1={px(0)} y1={py(1)} x2={px(1)} y2={py(1)} className="stroke-cream/15" />
        <line x1={px(0)} y1={py(0)} x2={px(c[0])} y2={py(c[1])} className="stroke-coral/60" strokeWidth={1.5} />
        <line x1={px(1)} y1={py(1)} x2={px(c[2])} y2={py(c[3])} className="stroke-coral/60" strokeWidth={1.5} />
        <polyline points={linha} className="fill-none stroke-cream" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={px(t)} cy={py(f(t))} r={3.5} className="fill-yellow" />
        {([0, 1] as const).map((k) => (
          <circle key={k} cx={px(c[k * 2])} cy={py(c[k * 2 + 1])} r={7} onPointerDown={arrastar(k)} className="cursor-grab fill-coral stroke-ink active:cursor-grabbing" strokeWidth={2} />
        ))}
      </svg>
      <div className="flex items-center justify-between font-mono text-[10px] text-fog tabular-nums">
        <span>cubic-bezier({c.join(', ')})</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS_CURVA.map((x) => (
          <button
            key={x.nome}
            onClick={() => p.mudar(x.curva, true)}
            className={cn('rounded-full px-2 py-0.5 text-[10.5px] ring-1', iguais(x.curva, c) ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}
          >
            {x.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
