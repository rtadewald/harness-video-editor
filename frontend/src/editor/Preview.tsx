import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import { formatarTempo } from '@/api'
import CanvasLook from './CanvasLook'
import EfeitoNoPalco from '@/transicoes/EfeitoNoPalco'

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
  /** Desenho por cima do vídeo (ex.: o esboço do layout da Direção visual). */
  sobreposicao?: ReactNode
  /** As transições entre planos no palco (o efeito e o som): só nas etapas em que o quadro está montado (Inserts e
   *  Transições); no Pré-processamento e na Direção, o ator fica limpo para avaliar o look e ouvir as emendas. */
  transicoes?: boolean
  /** A legenda, por cima de tudo (fora do efeito das transições, como na exportação: SPEC §13). */
  legenda?: ReactNode
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
          {/* as transições entre planos agem sobre tudo o que está no palco */}
          <EfeitoNoPalco tempo={p.tempo} tocando={p.tocando} altura={tela.h} desligado={!p.transicoes}>
          <video
            ref={p.videoRef}
            src={p.src}
            preload="auto"
            playsInline
            onClick={p.alternar}
            className="size-full cursor-pointer object-cover"
            style={{ objectPosition: `${p.enquadramentoX * 100}% 50%` }}
          />
          {/* o look do ator (LUT + vinheta), por cima do próprio vídeo */}
          <CanvasLook video={p.videoRef} posX={p.enquadramentoX} />

          {p.sobreposicao}
          </EfeitoNoPalco>
          {p.legenda}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-cream">
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
        <div className="flex rounded-full border border-line-dark p-0.5 text-[11px] font-semibold" title="Velocidade de reprodução">
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
