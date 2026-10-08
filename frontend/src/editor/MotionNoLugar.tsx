import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { RelogioRender } from './Fundo'

type Janela = Window & { __ir?: (t: number) => Promise<void> }
declare global {
  interface Window {
    /** Na exportação: o que os motions ainda estão pintando (a página de render espera antes da foto). */
    __motionsPintando?: Set<Promise<unknown>>
  }
}

const PALCO = { vertical: { w: 1080, h: 1920 }, dividida: { w: 1080, h: 960 } }

/** Um motion tocando (SPEC §8.5): a página dele num iframe do tamanho do palco, escalada para caber na área do plano (a
 *  tela toda ou a metade de cima). Quem manda no tempo é quem usa: a cada instante, `__ir(rel)` leva a cena até lá. */
export default function MotionNoLugar(p: { src: string; formato: 'vertical' | 'dividida'; rel: number; className?: string; noLugar?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)
  const quadro = useRef<HTMLIFrameElement>(null)
  const [escala, setEscala] = useState(0)
  const [pronto, setPronto] = useState(false)
  const exportando = useContext(RelogioRender) != null
  const palco = PALCO[p.formato]

  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setEscala(el.clientWidth / palco.w)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [palco.w])
  useEffect(() => setPronto(false), [p.src])

  useEffect(() => {
    if (!pronto) return
    const ir = (quadro.current?.contentWindow as Janela | null)?.__ir
    if (!ir) return
    const pintando = ir(p.rel)
    if (exportando) {
      const pendentes = (window.__motionsPintando ??= new Set())
      pendentes.add(pintando)
      void pintando.finally(() => pendentes.delete(pintando))
    }
  }, [p.rel, pronto, exportando])

  return (
    <div
      ref={caixa}
      className={cn('pointer-events-none overflow-hidden', p.noLugar !== false && 'absolute', p.noLugar !== false && (p.formato === 'vertical' ? 'inset-0' : 'inset-x-0 top-0 h-1/2'), p.className)}
    >
      {escala > 0 && (
        <iframe
          ref={quadro}
          src={p.src}
          title="motion"
          onLoad={() => setPronto(true)}
          data-pronto={pronto ? '1' : '0'}
          className="origin-top-left border-0"
          style={{ width: palco.w, height: palco.h, transform: `scale(${escala})` }}
        />
      )}
    </div>
  )
}
