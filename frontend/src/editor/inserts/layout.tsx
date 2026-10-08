import { useState, type ReactNode } from 'react'
import { ChevronDown, Images } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLembrado } from '@/lib/useLembrado'

type Tamanhos = { esq: number; dir: number; linha: number }

const TAMANHOS_PADRAO: Tamanhos = { esq: 440, dir: 400, linha: 200 }

const LIMITES: Record<keyof Tamanhos, [number, number]> = { esq: [300, 760], dir: [300, 680], linha: [150, 420] }

/** Larguras dos cards e altura da linha do tempo, arrastáveis e lembradas neste navegador. */
export function useTamanhos(): [Tamanhos, (lado: keyof Tamanhos, e: React.PointerEvent) => void] {
  const [tam, setTam] = useState<Tamanhos>(() => {
    try {
      return { ...TAMANHOS_PADRAO, ...JSON.parse(localStorage.getItem('inserts.tamanhos') ?? '{}') }
    } catch {
      return TAMANHOS_PADRAO
    }
  })
  const arrastar = (lado: keyof Tamanhos, e: React.PointerEvent) => {
    e.preventDefault()
    const inicio = lado === 'linha' ? e.clientY : e.clientX
    const base = tam[lado]
    let atual = tam
    const mover = (ev: PointerEvent) => {
      const d = (lado === 'linha' ? ev.clientY : ev.clientX) - inicio
      const v = base + (lado === 'esq' ? d : -d) // o card da direita e a linha do tempo crescem para o outro lado
      const [min, max] = LIMITES[lado]
      atual = { ...atual, [lado]: Math.round(Math.max(min, Math.min(max, v))) }
      setTam(atual)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      document.body.style.cursor = ''
      try {
        localStorage.setItem('inserts.tamanhos', JSON.stringify(atual))
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    }
    document.body.style.cursor = lado === 'linha' ? 'ns-resize' : 'ew-resize'
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  return [tam, arrastar]
}

/** A alça de uma borda arrastável (realça ao passar o mouse). */
export function Alca({ lado, pos, arrastar }: { lado: keyof Tamanhos; pos: number | string; arrastar: (lado: keyof Tamanhos, e: React.PointerEvent) => void }) {
  const borda = typeof pos === 'number' ? `${pos}px` : pos
  const estilo: React.CSSProperties =
    lado === 'esq'
      ? { left: `calc(${borda} - 3px)`, top: 0, bottom: 0, width: 6 }
      : lado === 'dir'
        ? { right: `calc(${borda} - 3px)`, top: 0, bottom: 0, width: 6 }
        : { left: 0, right: 0, top: -3, height: 6 }
  return (
    <div
      onPointerDown={(e) => arrastar(lado, e)}
      className={cn('group absolute z-40', lado === 'linha' ? 'cursor-ns-resize' : 'cursor-ew-resize')}
      style={estilo}
      title="Arraste para ajustar"
    >
      <span className={cn('absolute bg-coral opacity-0 transition-opacity group-hover:opacity-100', lado === 'linha' ? 'inset-x-0 top-[2px] h-[2px]' : 'inset-y-0 left-[2px] w-[2px]')} />
    </div>
  )
}

/** Um card que abre e fecha (lembrado), com o título e um resumo no cabeçalho. */
export function Recolhivel(p: { chave: string; titulo: string; resumo?: ReactNode; children: ReactNode; fechado?: boolean }) {
  const { chave, titulo, resumo, children } = p
  const [aberto, setAberto] = useLembrado(`inserts.aberto.${chave}`, !p.fechado)
  return (
    <div className="shrink-0 rounded-[8px] bg-cream/[0.03] ring-1 ring-line-dark">
      <button onClick={() => setAberto(!aberto)} className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left">
        <span className="eyebrow shrink-0 text-sage">{titulo}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{resumo}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-fog transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function Cabecalho({ icone: Icone, titulo, extra }: { icone: typeof Images; titulo: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-dark px-4 py-2.5 text-[11px]">
      <Icone className="size-3.5 text-sage" />
      <span className="eyebrow text-sage">{titulo}</span>
      {extra}
    </div>
  )
}

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="eyebrow text-fog">{rotulo}</p>
      <p className="text-[12.5px] leading-[1.6] text-cream/85">{children}</p>
    </div>
  )
}
