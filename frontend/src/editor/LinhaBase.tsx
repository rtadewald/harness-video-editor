import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useAtalhoZoom } from './useAtalhoZoom'

export type Trilha = { id: string; nome: string; alt: number }
/** O que as trilhas recebem para se desenhar: o x de um instante, o topo da trilha k e o instante sob um clientX. */
export type Geometria = { x: (t: number) => number; faixa: (k: number) => number; tDe: (clientX: number) => number; px: number }

const ROTULO = 88 // coluna dos nomes das trilhas

/** A base das linhas do tempo horizontais do editor (Inserts, Transições; estilo editor de vídeo): a barra com as
 *  ferramentas e o zoom, a régua (clicar ou arrastar anda pelo vídeo), os nomes das trilhas fixos ao rolar, a cabeça de
 *  reprodução (seguida enquanto toca) e, por cima, o que cada etapa desenha nas trilhas (`children`). */
export default function LinhaBase(p: {
  duracao: number
  trilhas: Trilha[]
  tempo: number
  tocando: boolean
  buscar: (t: number) => void
  ferramentas?: ReactNode
  children: (g: Geometria) => ReactNode
}) {
  // a área que rola: num ref (para os efeitos) e num estado (o `tDe` que as trilhas recebem no desenho lê dela)
  const rolagem = useRef<HTMLDivElement | null>(null)
  const [area, setArea] = useState<HTMLDivElement | null>(null)
  const prender = useCallback((el: HTMLDivElement | null) => {
    rolagem.current = el
    setArea(el)
  }, [])
  const [px, setPx] = useState(14)
  useAtalhoZoom(() => setPx((v) => Math.min(v * 1.4, 400)), () => setPx((v) => Math.max(v / 1.4, 2)))
  const largura = Math.max(p.duracao * px, 200)
  const x = (t: number) => t * px

  // ajustar à largura disponível (na primeira vez e no botão)
  const ajustar = () => {
    const el = rolagem.current
    if (el) setPx(Math.max((el.clientWidth - ROTULO - 24) / Math.max(p.duracao, 1), 2))
  }
  useEffect(ajustar, [p.duracao]) // eslint-disable-line react-hooks/exhaustive-deps

  // segue a cabeça de reprodução enquanto toca
  useEffect(() => {
    const el = rolagem.current
    if (!el || !p.tocando) return
    const xt = x(p.tempo) + ROTULO
    if (xt < el.scrollLeft + ROTULO + 40 || xt > el.scrollLeft + el.clientWidth - 80) el.scrollLeft = xt - ROTULO - el.clientWidth * 0.3
  })

  // clicar ou arrastar na régua anda pelo vídeo
  const { duracao } = p
  const tDe = useCallback(
    (clientX: number) => {
      if (!area) return 0
      return Math.max(0, Math.min((clientX - area.getBoundingClientRect().left + area.scrollLeft - ROTULO) / px, duracao))
    },
    [area, px, duracao],
  )
  const navegar = (e: React.PointerEvent) => {
    p.buscar(tDe(e.clientX))
    const mover = (ev: PointerEvent) => p.buscar(tDe(ev.clientX))
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const passo = [1, 2, 5, 10, 15, 30, 60].find((s) => s * px >= 60) ?? 120
  const marcas = Array.from({ length: Math.floor(p.duracao / passo) + 1 }, (_, k) => k * passo)
  const rotuloT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  const faixa = (k: number) => p.trilhas.slice(0, k).reduce((a, t) => a + t.alt + 4, 22)

  return (
    <div className="flex min-h-0 flex-col border-t border-line-dark">
      <div className="flex items-center gap-2 border-b border-line-dark px-3 py-1.5 text-[11px] text-fog">
        <span className="eyebrow text-sage">Linha do tempo</span>
        {p.ferramentas}
        <span className="ml-auto" />
        <button onClick={() => setPx((v) => Math.max(v / 1.4, 2))} className="grid size-7 place-items-center rounded-full hover:text-cream" aria-label="Afastar">
          <Minus className="size-3.5" />
        </button>
        <button onClick={() => setPx((v) => Math.min(v * 1.4, 400))} className="grid size-7 place-items-center rounded-full hover:text-cream" aria-label="Aproximar">
          <Plus className="size-3.5" />
        </button>
        <button onClick={ajustar} className="flex items-center gap-1 rounded-full px-2 py-1 font-semibold hover:text-cream" title="Ajustar o vídeo inteiro à largura">
          <Maximize2 className="size-3" /> Ajustar
        </button>
      </div>
      <div ref={prender} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden select-none">
        <div className="relative" style={{ width: largura + ROTULO + 24, height: faixa(p.trilhas.length) + 4 }}>
          {/* nomes das trilhas (fixos ao rolar) */}
          <div className="sticky left-0 z-30 h-full border-r border-line-dark bg-deep" style={{ width: ROTULO }}>
            {p.trilhas.map((t, k) => (
              <span key={t.id} className="absolute left-3 flex items-center text-[11px] text-fog" style={{ top: faixa(k), height: t.alt }}>
                {t.nome}
              </span>
            ))}
          </div>

          <div className="absolute top-0" style={{ left: ROTULO, width: largura }}>
            {/* régua */}
            <div onPointerDown={navegar} className="absolute inset-x-0 top-0 h-5 cursor-pointer border-b border-line-dark">
              {marcas.map((t) => (
                <span key={t} className="absolute top-0 flex h-full items-start gap-1 border-l border-fog/40 pl-1 text-[9.5px] text-fog tabular-nums" style={{ left: x(t) }}>
                  {rotuloT(t)}
                </span>
              ))}
            </div>

            {p.children({ x, faixa, tDe, px })}

            {/* cabeça de reprodução */}
            <div className="pointer-events-none absolute top-0 z-20 w-0.5 bg-coral" style={{ left: x(p.tempo), height: faixa(p.trilhas.length) }} />
          </div>
        </div>
      </div>
    </div>
  )
}
