import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Fundo from './Fundo'
import { estadoCard, janela, type Receita } from './presets'

/** Um preset tocando (SPEC §8.4): cada card na pose do instante, com a sua mídia dentro. As medidas são % da área do
 *  insert (a tela toda ou a metade de cima), em unidades de container, então a mesma receita serve na prévia, na
 *  miniatura do banco e na exportação. `midia(k, rel)` desenha a mídia do card k, `rel` s depois de ele aparecer. */
export default function CenaPreset(p: { receita: Receita; rel: number; dur: number; fundo: string; midia: (k: number, rel: number, topo: boolean) => ReactNode; className?: string }) {
  const r = p.receita
  return (
    <div className={cn('pointer-events-none absolute overflow-hidden', p.className, r.fundo === 'nenhum' && 'bg-black')} style={{ containerType: 'size' }}>
      {r.fundo === 'proprio' && <Fundo id={p.fundo} />}
      {r.cards.map((c, k) => {
        const e = estadoCard(c, p.rel, p.dur)
        if (!e || e.opacidade <= 0.001) return null
        const rep = c.repouso
        const ini = janela(c, p.dur).ini
        const giro3d = rep.rx + e.rx || rep.ry + e.ry ? `perspective(138.9cqw) rotateX(${rep.rx + e.rx}deg) rotateY(${rep.ry + e.ry}deg) ` : ''
        return (
          <div
            key={k}
            className="absolute"
            style={{
              left: `${rep.cx - rep.w / 2}%`,
              top: `${rep.cy - rep.h / 2}%`,
              width: `${rep.w}%`,
              height: `${rep.h}%`,
              zIndex: rep.z,
              opacity: e.opacidade,
              transform: `translate(${e.dx}cqw, ${e.dy}cqh) ${giro3d}rotate(${rep.rot + e.rot}deg) scale(${e.escala})`,
              filter: e.desfoque > 0.05 ? `blur(${(e.desfoque / 10.8).toFixed(3)}cqw)` : undefined,
            }}
          >
            <div
              className={cn('size-full overflow-hidden', rep.sombra && 'shadow-[0_30px_70px_-12px_rgba(0,0,0,0.45),0_12px_24px_-8px_rgba(0,0,0,0.3)]', c.ajuste === 'contain' && 'bg-black')}
              style={{ borderRadius: `${(rep.raio * rep.w) / 100}cqw` }}
            >
              {p.midia(k, Math.max(p.rel - ini, 0), c.ajuste === 'topo')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
