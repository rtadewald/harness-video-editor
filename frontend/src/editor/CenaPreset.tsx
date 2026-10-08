import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Fundo from './Fundo'
import { cantosNoTempo, estadoCard, janela, matrizDosCantos, zoomMidia, type Receita } from './presets'

/** Um preset tocando (SPEC §8.4): cada card na pose do instante, com a sua mídia dentro. As medidas são % da área do
 *  insert (a tela toda ou a metade de cima), em unidades de container, então a mesma receita serve na prévia, na
 *  miniatura do banco e na exportação. `midia(k, rel)` desenha a mídia do card k, `rel` s depois de ele aparecer. */
export default function CenaPreset(p: { receita: Receita; rel: number; dur: number; fundo: string; midia: (k: number, rel: number, topo: boolean) => ReactNode; className?: string }) {
  const r = p.receita
  // o tamanho da área em px: os cards guiados pelos cantos (`quadros`) precisam de px para a matrix3d
  const caixa = useRef<HTMLDivElement>(null)
  const [tam, setTam] = useState<[number, number] | null>(null)
  const temQuadros = r.cards.some((c) => c.quadros?.length)
  useEffect(() => {
    const el = caixa.current
    if (!el || !temQuadros) return
    const ro = new ResizeObserver(() => setTam([el.clientWidth, el.clientHeight]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [temQuadros])
  return (
    <div ref={caixa} className={cn('pointer-events-none absolute isolate overflow-hidden', p.className, r.fundo === 'nenhum' && 'bg-black')} style={{ containerType: 'size' }}>
      {r.fundo === 'proprio' && <Fundo id={p.fundo} />}
      {r.cards.map((c, k) => {
        const e = estadoCard(c, p.rel, p.dur)
        if (!e || e.opacidade <= 0.001) return null
        const rep = c.repouso
        const ini = janela(c, p.dur).ini
        if (c.quadros?.length) {
          if (!tam) return null
          const { fim } = janela(c, p.dur)
          const q = cantosNoTempo(c.quadros, (p.rel - ini) / Math.max(fim - ini, 0.01)).map(([x, y]) => [(x / 100) * tam[0], (y / 100) * tam[1]] as [number, number])
          const w = (rep.w / 100) * tam[0], h = (rep.h / 100) * tam[1]
          return (
            <div
              key={k}
              className="absolute top-0 left-0 origin-top-left"
              style={{ width: w, height: h, zIndex: rep.z, opacity: e.opacidade, transform: matrizDosCantos(w, h, q), filter: rep.desfoque ? `blur(${(rep.desfoque / 10.8).toFixed(3)}cqw)` : undefined }}
            >
              <div className="size-full overflow-hidden" style={{ borderRadius: `${(rep.raio * rep.w) / 100}cqw` }}>
                {p.midia(c.midia ?? k, Math.max(p.rel - ini, 0), c.ajuste === 'topo')}
              </div>
            </div>
          )
        }
        const giro3d = rep.rx + e.rx || rep.ry + e.ry ? `perspective(138.9cqw) rotateX(${rep.rx + e.rx}deg) rotateY(${rep.ry + e.ry}deg) ` : ''
        return (
          <div
            key={k}
            className="absolute"
            style={{
              left: `${rep.cx - rep.w / 2}%`,
              top: `${rep.cy - (rep.h * (e.altura ?? 1)) / 2}%`,
              width: `${rep.w}%`,
              height: `${rep.h * (e.altura ?? 1)}%`,
              zIndex: rep.z,
              opacity: e.opacidade,
              transform: `translate(${e.dx}cqw, ${e.dy}cqh) ${giro3d}rotate(${rep.rot + e.rot}deg) scale(${e.escala})`,
              filter: e.desfoque + (rep.desfoque ?? 0) > 0.05 ? `blur(${((e.desfoque + (rep.desfoque ?? 0)) / 10.8).toFixed(3)}cqw)` : undefined,
            }}
          >
            <div
              className={cn('size-full overflow-hidden', rep.sombra && 'shadow-[0_30px_70px_-12px_rgba(0,0,0,0.45),0_12px_24px_-8px_rgba(0,0,0,0.3)]', c.ajuste === 'contain' && 'bg-black')}
              style={{ borderRadius: `${(rep.raio * rep.w) / 100}cqw` }}
            >
              {c.zoom ? (
                <div className="size-full" style={{ transform: `scale(${zoomMidia(c, p.rel, p.dur)})`, transformOrigin: `${c.zoom.ox}% ${c.zoom.oy}%` }}>
                  {p.midia(c.midia ?? k, Math.max(p.rel - ini, 0), c.ajuste === 'topo')}
                </div>
              ) : (
                p.midia(c.midia ?? k, Math.max(p.rel - ini, 0), c.ajuste === 'topo')
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
