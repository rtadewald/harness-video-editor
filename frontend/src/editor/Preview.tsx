import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import { formatarTempo, type Item } from '@/api'
import { Marca } from '@/components/Marca'

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  enquadramentoX: number
  tempo: number
  duracao: number
  tocando: boolean
  alternar: () => void
  velocidade: number
  setVelocidade: (v: number) => void
  buscar: (s: number) => void
  /** Etapa de Cortes: mostra também a posição no arquivo original. */
  bruto?: number
  insert?: Item
  motion?: Item
  legenda?: string
}

/** Monitor 9:16. Recorte parado: bruto vertical só preenche; horizontal usa o centro do enquadramento. */
export default function Preview(p: Props) {
  const area = useRef<HTMLDivElement>(null)
  const [tela, setTela] = useState({ w: 0, h: 0 })

  // o maior 9:16 que cabe no espaço livre, sem empurrar o painel ao lado
  useLayoutEffect(() => {
    const el = area.current!
    const medir = () => {
      const h = Math.min(el.clientHeight, (el.clientWidth * 16) / 9)
      setTela({ w: (h * 9) / 16, h })
    }
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col items-center gap-3">
      <div ref={area} className="flex min-h-0 w-full flex-1 items-start justify-center">
        <div
          className="relative overflow-hidden rounded-[3px] bg-black shadow-[0_20px_60px_#0006] ring-1 ring-line-dark"
          style={{ width: tela.w, height: tela.h }}
        >
          <video
            ref={p.videoRef}
            src={p.src}
            preload="auto"
            playsInline
            onClick={p.alternar}
            className="size-full cursor-pointer object-cover"
            style={{ objectPosition: `${p.enquadramentoX * 100}% 50%` }}
          />

          {p.insert && (
            <div className="absolute inset-x-0 top-0 flex h-1/2 flex-col justify-between bg-blue p-4 text-cream">
              <span className="eyebrow opacity-80">Insert · V2 · simulado</span>
              <span className="text-[22px] leading-tight tracking-[-0.04em] break-all">{p.insert.rotulo}</span>
              <span className="self-start bg-cream px-2.5 py-1.5 text-[9px] font-semibold tracking-[0.1em] text-ink">
                TELA DIVIDIDA ↗
              </span>
            </div>
          )}
          {p.motion && (
            <div className="absolute inset-x-5 top-[14%] rotate-[-3deg] rounded-[6px] bg-yellow p-4 text-ink shadow-[0_8px_30px_#0004]">
              <Marca className="mb-2 size-6 animate-[otto-spin_6s_linear_infinite] text-coral" />
              <span className="eyebrow block opacity-70">Motion · V3 · simulado</span>
              <span className="mt-1 block text-[20px] leading-tight font-semibold tracking-[-0.04em]">{p.motion.rotulo}</span>
            </div>
          )}
          {p.legenda && (
            <p className="absolute inset-x-4 bottom-[18%] text-center text-[22px] leading-tight font-extrabold tracking-[-0.03em] text-cream [text-shadow:0_2px_12px_#000a]">
              {p.legenda}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-cream">
        <button onClick={() => p.buscar(0)} className="grid size-9 place-items-center rounded-full text-fog hover:text-cream" aria-label="Voltar ao início">
          <SkipBack className="size-4" />
        </button>
        <button
          onClick={p.alternar}
          className="grid size-11 place-items-center rounded-full bg-cream text-ink transition-[transform,background] duration-300 hover:-translate-y-0.5 hover:bg-yellow"
          aria-label={p.tocando ? 'Pausar' : 'Tocar'}
        >
          {p.tocando ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <span className="min-w-32 text-[11px] tabular-nums text-fog">
          <b className="font-semibold text-cream">{formatarTempo(p.tempo)}</b> / {formatarTempo(p.duracao)}
          {p.bruto != null && <span className="ml-2 text-yellow">bruto {formatarTempo(p.bruto)}</span>}
        </span>
        <div className="ml-2 flex rounded-full border border-line-dark p-0.5 text-[11px] font-semibold" title="Velocidade de reprodução">
          {[0.25, 0.5, 1, 2].map((v) => (
            <button
              key={v}
              onClick={() => p.setVelocidade(v)}
              aria-pressed={p.velocidade === v}
              className={`h-6 rounded-full px-2 tabular-nums ${p.velocidade === v ? 'bg-cream text-ink' : 'text-fog hover:text-cream'}`}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
