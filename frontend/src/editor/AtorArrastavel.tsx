import { useEffect, useRef, useState } from 'react'
import { Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import { caixaDoAtor, ZOOM, type AjusteAtor, type Geometria } from './ator'
import type { Divisao } from './divisao'

/** O ator arrastável no vídeo (etapa Inserts, P5), como o card do comentário: clicar seleciona (contorno amarelo),
 *  arrastar move e a alça do canto muda o tamanho. No "ator embaixo" (janela, recortado, canto) move o centro e muda a
 *  escala; na tela dividida, a alça "Ator" desloca o enquadramento dentro da área e a do canto dá zoom (para mais ou
 *  para menos que o automático). `mudar(campos, salvar)`: a prévia acompanha o arraste e o servidor recebe ao soltar
 *  (quem recebe guarda o que vale na tela: `ajusteNaFolga`). */
export default function AtorArrastavel(p: { g: Geometria; d: Divisao; aj: AjusteAtor; mudar: (campos: AjusteAtor, salvar: boolean) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState(false)
  useEffect(() => {
    if (!sel) return
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setSel(false)
    window.addEventListener('pointerdown', fora)
    return () => window.removeEventListener('pointerdown', fora)
  }, [sel])
  const c = caixaDoAtor(p.g, p.d)
  const metade = p.g.modo === 'metade'
  const quadro = () => caixa.current!.parentElement!.getBoundingClientRect()
  const arrastar = (e: React.PointerEvent, oque: 'mover' | 'tamanho') => {
    e.stopPropagation()
    e.preventDefault()
    setSel(true)
    const q = quadro()
    const x0 = e.clientX
    const y0 = e.clientY
    const base = { ...p.aj }
    let ultimo: AjusteAtor | null = null
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / q.width
      const dy = (ev.clientY - y0) / q.height
      let n: AjusteAtor
      if (oque === 'mover')
        n = metade
          ? { dx: Math.max(-0.5, Math.min(0.5, (base.dx ?? 0) + dx)), dy: Math.max(-0.5, Math.min(0.5, (base.dy ?? 0) + dy)) }
          : { x: Math.max(0, Math.min(1, p.g.tx + p.g.s / 2 + dx)), y: Math.max(0, Math.min(1, p.g.ty + p.g.s / 2 + dy)) }
      else if (metade) n = { zoom: Math.max(ZOOM.min, Math.min(ZOOM.max, (base.zoom ?? 1) * (1 + dy * 2))) }
      else {
        // o canto de baixo à direita segue o cursor; o centro fica parado. A janela e o recortado apoiados embaixo (a
        // posição de fábrica) continuam apoiados: crescem para cima, sem passar da borda de baixo
        const s = Math.max(0.15, Math.min(1, p.g.s + Math.max(dx, dy) * 2))
        const apoiado = p.g.modo !== 'canto' && (base.y == null || p.g.ty + p.g.s >= 0.995)
        n = { escala: s, x: p.g.tx + p.g.s / 2, y: apoiado ? undefined : p.g.ty + p.g.s / 2 }
      }
      ultimo = n
      p.mudar(n, false)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (ultimo) p.mudar(ultimo, true)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const pct = (v: number) => `${v * 100}%`
  return (
    <div
      ref={caixa}
      className={cn('absolute z-20', metade ? 'pointer-events-none' : 'pointer-events-auto cursor-move', sel && 'outline-2 outline-yellow outline-dashed')}
      style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }}
      onPointerDown={metade ? undefined : (e) => arrastar(e, 'mover')}
      title={metade ? undefined : 'Arraste para mover o ator; a alça do canto muda o tamanho'}
    >
      {metade && (
        <button
          onPointerDown={(e) => arrastar(e, 'mover')}
          className="pointer-events-auto absolute top-2 left-2 flex cursor-move items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-cream"
          title="Arraste para mover o ator dentro da área; a alça do canto dá zoom"
        >
          <Move className="size-3" /> Ator
        </button>
      )}
      {(sel || metade) && (
        <span
          onPointerDown={(e) => arrastar(e, 'tamanho')}
          className={cn('pointer-events-auto absolute size-3.5 cursor-nwse-resize rounded-[3px] bg-yellow ring-2 ring-black/40', metade ? 'right-2 bottom-2' : '-right-1.5 -bottom-1.5')}
          title={metade ? 'Arraste para dar zoom no ator' : 'Arraste para mudar o tamanho do ator'}
        />
      )}
    </div>
  )
}
