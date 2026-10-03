import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { formatarDuracao, ms3, type Clipe, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import type { Corte, Selecao } from './cortes'

const REGUA = 26
const PALAVRAS = 30
const ONDA = 104
const CORTES = 26
const PX_MAX = 12000 // 1 ms = 12 px; a forma de onda tem um pico a cada 5 ms

type Props = {
  duracao: number
  clipes: Clipe[]
  palavras: Palavra[]
  cortes: Corte[]
  picos: number[] | null
  picosPorSegundo: number
  bruto: number
  tocando: boolean
  pular: boolean
  setPular: (v: boolean) => void
  selecao: Selecao
  selecionar: (s: Selecao) => void
  buscarBruto: (t: number) => void
  refazendo: boolean
  aoRefazer: () => void
}

/** Timeline da etapa de Cortes: o bruto INTEIRO, com o que fica e o que sai desenhado sobre a forma de onda real. */
export default function LinhaBruto(p: Props) {
  const rolagem = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [px, setPx] = useState(10) // pixels por segundo
  const [scroll, setScroll] = useState(0)
  const [largura, setLargura] = useState(900)
  const [arrastando, setArrastando] = useState(false)
  const [verWhisper, setVerWhisper] = useState(false)
  const ancora = useRef<{ t: number; x: number } | null>(null)

  const pxFit = Math.max((largura - 24) / Math.max(p.duracao, 1), 1)
  const intervalos = useMemo(() => [...p.clipes].sort((a, b) => a.inicio - b.inicio).map((c) => [c.inicio, c.fim] as const), [p.clipes])

  // largura visível
  useLayoutEffect(() => {
    const el = rolagem.current!
    const medir = () => setLargura(el.clientWidth)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // começa com o bruto inteiro na tela
  const iniciou = useRef(false)
  useEffect(() => {
    if (iniciou.current || largura < 100) return
    iniciou.current = true
    setPx(pxFit)
  }, [largura, pxFit])

  // zoom mantém o ponto sob o cursor parado
  useLayoutEffect(() => {
    const a = ancora.current
    if (!a || !rolagem.current) return
    rolagem.current.scrollLeft = a.t * px - a.x
    ancora.current = null
  }, [px])

  const zoomPara = (novo: number, x = largura / 2) => {
    const alvo = Math.min(Math.max(novo, pxFit), PX_MAX)
    ancora.current = { t: (scroll + x) / px, x }
    setPx(alvo)
  }

  // ctrl/⌘ + roda do mouse: zoom no cursor (precisa de listener não passivo)
  useEffect(() => {
    const el = rolagem.current!
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const x = e.clientX - el.getBoundingClientRect().left
      zoomPara(px * Math.exp(-e.deltaY * 0.004), x)
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  })

  // durante a reprodução a cabeça nunca sai da tela
  useEffect(() => {
    const r = rolagem.current
    if (!r || !p.tocando) return
    const x = p.bruto * px
    if (x < r.scrollLeft || x > r.scrollLeft + r.clientWidth - 60) r.scrollLeft = x - 80
  }, [p.bruto, px, p.tocando])

  // seleção feita no texto traz o item para a tela
  useEffect(() => {
    const r = rolagem.current
    if (!r || !p.selecao) return
    const t =
      p.selecao.tipo === 'palavra'
        ? (() => {
            const w = p.palavras.find((x) => x.id === (p.selecao as { id: string }).id)
            return w ? (w.inicio + w.fim) / 2 : null
          })()
        : (() => {
            const c = p.cortes.find((x) => x.n === (p.selecao as { n: number }).n)
            return c ? (c.ini + c.fim) / 2 : null
          })()
    if (t == null) return
    const x = t * px
    if (x < r.scrollLeft + 40 || x > r.scrollLeft + r.clientWidth - 40) r.scrollLeft = x - r.clientWidth / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selecao])

  // forma de onda: só o que está na tela, uma coluna de pixels por vez
  useEffect(() => {
    const c = canvas.current
    if (!c || !p.picos) return
    const dpr = window.devicePixelRatio || 1
    c.width = largura * dpr
    c.height = ONDA * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const meio = ONDA / 2
    let k = 0
    for (let x = 0; x < largura; x++) {
      const t0 = (scroll + x) / px
      const t1 = (scroll + x + 1) / px
      if (t0 > p.duracao) break
      const i0 = Math.floor(t0 * p.picosPorSegundo)
      const i1 = Math.min(Math.max(Math.ceil(t1 * p.picosPorSegundo), i0 + 1), p.picos.length)
      let m = 0
      for (let i = i0; i < i1; i++) if (p.picos[i] > m) m = p.picos[i]
      while (k < intervalos.length && intervalos[k][1] < t0) k++
      const fica = k < intervalos.length && intervalos[k][0] <= (t0 + t1) / 2
      g.fillStyle = fica ? '#dce7ca' : 'rgba(245,119,87,0.8)'
      const h = (m / 255) * (meio - 2)
      g.fillRect(x, meio - h, 1, Math.max(h * 2, 1))
    }
    g.fillStyle = 'rgba(217,235,215,0.18)'
    g.fillRect(0, meio, largura, 1)
  }, [p.picos, p.picosPorSegundo, p.duracao, px, scroll, largura, intervalos])

  const buscarNoPonteiro = (e: PointerEvent<HTMLElement>) => {
    const caixa = rolagem.current!.getBoundingClientRect()
    p.buscarBruto(Math.min(Math.max((rolagem.current!.scrollLeft + e.clientX - caixa.left) / px, 0), p.duracao))
  }
  const arrastar = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setArrastando(true)
      buscarNoPonteiro(e)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => arrastando && buscarNoPonteiro(e),
    onPointerUp: () => setArrastando(false),
  }

  // régua: o passo se adapta ao zoom, até milissegundos
  const passo = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * px >= 90) ?? 60
  const casas = passo >= 1 ? 0 : passo >= 0.1 ? 1 : passo >= 0.01 ? 2 : 3
  const t0 = scroll / px
  const t1 = (scroll + largura) / px
  const marcas = Array.from({ length: Math.max(Math.floor(t1 / passo) - Math.ceil(t0 / passo) + 1, 0) }, (_, i) => (Math.ceil(t0 / passo) + i) * passo)
  const rotuloTempo = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(casas).padStart(casas ? casas + 3 : 2, '0')}`

  const visivel = (ini: number, fim: number) => fim * px >= scroll - 40 && ini * px <= scroll + largura + 40
  const sel = p.selecao
  const mostrarPalavras = px >= 30
  const mostrarWhisper = verWhisper && px >= 120

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-deeper text-cream">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line-dark px-3">
        <span className="eyebrow truncate text-fog">
          Bruto {formatarDuracao(p.duracao)} → <b className="text-cream">{formatarDuracao(p.clipes.reduce((s, c) => s + c.fim - c.inicio, 0))}</b> · {p.clipes.length} trechos ·{' '}
          {p.cortes.length} cortes
        </span>
        <div className="flex items-center gap-1 text-fog">
          <span className="mr-1 hidden items-center gap-1 text-[10px] xl:flex">
            <i className="size-2 rounded-[2px] bg-mint" /> fica <i className="ml-1.5 size-2 rounded-[2px] bg-coral" /> sai
          </span>
          <button
            onClick={() => setVerWhisper((v) => !v)}
            title="Mostra, sob cada palavra, onde o Whisper tinha marcado (aproxime para ver)"
            className={cn('h-7 rounded-full border px-3 text-[11px] font-semibold', verWhisper ? 'border-yellow text-yellow' : 'border-line-dark hover:border-cream/50 hover:text-cream')}
          >
            Whisper
          </button>
          <div className="flex rounded-full border border-line-dark p-0.5 text-[11px] font-semibold" title="Tecla B alterna">
            {([true, false] as const).map((modo) => (
              <button
                key={String(modo)}
                onClick={() => p.setPular(modo)}
                className={cn('h-6 rounded-full px-2.5', p.pular === modo ? 'bg-cream text-ink' : 'hover:text-cream')}
              >
                {modo ? 'Tocar resultado' : 'Tocar bruto'}
              </button>
            ))}
          </div>
          <button
            onClick={p.aoRefazer}
            disabled={p.refazendo}
            title="Pede à IA uma nova seleção do texto final (não retranscreve)"
            className="flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-3 text-[11px] font-semibold hover:border-cream/50 hover:text-cream disabled:opacity-60"
          >
            <RotateCcw className={cn('size-3', p.refazendo && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
            {p.refazendo ? 'Refazendo…' : 'Refazer cortes'}
          </button>
          <Zoom rotulo="Afastar" onClick={() => zoomPara(px / 1.6)}><Minus /></Zoom>
          <Zoom rotulo="Aproximar" onClick={() => zoomPara(px * 1.6)}><Plus /></Zoom>
          <Zoom rotulo="Caber na tela" onClick={() => zoomPara(pxFit)}><Maximize2 /></Zoom>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-12 shrink-0 border-r border-line-dark pt-[26px] text-[9px] font-semibold tracking-[0.12em] text-fog/70">
          <div style={{ height: PALAVRAS }} className="flex items-center justify-center border-b border-line-dark">TXT</div>
          <div style={{ height: ONDA }} className="flex items-center justify-center border-b border-line-dark text-cream">BRUTO</div>
          <div style={{ height: CORTES }} className="flex items-center justify-center">✂</div>
        </div>

        <div ref={rolagem} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative select-none" style={{ width: p.duracao * px + 24 }}>
            <div {...arrastar} className={cn('relative cursor-text border-b border-line-dark', arrastando && 'cursor-grabbing')} style={{ height: REGUA }}>
              {marcas.map((s) => (
                <span key={s} className="absolute top-0 h-full border-l border-line-dark pt-1 pl-1 text-[9px] text-fog/80 tabular-nums" style={{ left: s * px }}>
                  {rotuloTempo(s)}
                </span>
              ))}
            </div>

            <div className="relative border-b border-line-dark" style={{ height: PALAVRAS }}>
              {!mostrarPalavras && (
                <p className="sticky left-0 flex h-full items-center px-3 text-[10px] text-fog/70" style={{ width: largura }}>
                  Aproxime (+ ou Ctrl/⌘ + roda do mouse) para ver as palavras
                </p>
              )}
              {mostrarPalavras &&
                p.palavras.map((w) => {
                  if (!visivel(w.inicio, w.fim)) return null
                  const largo = (w.fim - w.inicio) * px
                  const escolhida = sel?.tipo === 'palavra' && sel.id === w.id
                  return (
                    <button
                      key={w.id}
                      onClick={() => {
                        p.selecionar({ tipo: 'palavra', id: w.id })
                        p.buscarBruto(w.inicio)
                      }}
                      title={`${w.id} · ${ms3(w.inicio)} → ${ms3(w.fim)} s (${Math.round((w.fim - w.inicio) * 1000)} ms)`}
                      className={cn(
                        'absolute inset-y-[3px] overflow-hidden rounded-[2px] border-l px-1 text-left text-[10px] leading-none whitespace-nowrap',
                        w.mantida ? 'border-mint bg-mint/12 text-mint' : 'border-coral bg-coral/15 text-coral line-through decoration-coral/70',
                        escolhida && 'bg-yellow !text-ink ring-1 ring-yellow',
                      )}
                      style={{ left: w.inicio * px, width: Math.max(largo - 1, 2) }}
                    >
                      {largo >= 26 && w.texto}
                    </button>
                  )
                })}
            </div>

            <div {...arrastar} className={cn('relative cursor-text border-b border-line-dark', arrastando && 'cursor-grabbing')} style={{ height: ONDA }}>
              {p.cortes.map((c) => (
                <div
                  key={c.n}
                  className={cn('absolute inset-y-0 border-x', sel?.tipo === 'corte' && sel.n === c.n ? 'border-yellow' : 'border-coral/60')}
                  style={{
                    left: c.ini * px,
                    width: Math.max((c.fim - c.ini) * px, 1),
                    background:
                      'repeating-linear-gradient(135deg, rgba(245,119,87,0.30) 0 5px, rgba(245,119,87,0.08) 5px 10px)',
                  }}
                />
              ))}
              {mostrarWhisper &&
                p.palavras.map((w) =>
                  w.inicio_whisper != null && visivel(w.inicio, w.fim) ? (
                    <div
                      key={w.id}
                      className="absolute h-[5px] rounded-full bg-yellow/70"
                      style={{ left: w.inicio_whisper * px, width: Math.max(((w.fim_whisper ?? w.inicio_whisper) - w.inicio_whisper) * px - 1, 2), bottom: 3 }}
                      title={`${w.id} no Whisper: ${ms3(w.inicio_whisper)} → ${ms3(w.fim_whisper ?? 0)} s`}
                    />
                  ) : null,
                )}
              {sel?.tipo === 'palavra' &&
                (() => {
                  const w = p.palavras.find((x) => x.id === sel.id)
                  return w ? (
                    <div className="pointer-events-none absolute inset-y-0 bg-yellow/15 ring-1 ring-yellow/60" style={{ left: w.inicio * px, width: Math.max((w.fim - w.inicio) * px, 1) }} />
                  ) : null
                })()}
              {p.picos ? (
                <canvas ref={canvas} className="pointer-events-none sticky left-0 block" style={{ width: largura, height: ONDA }} />
              ) : (
                <p className="absolute inset-0 grid place-items-center text-[11px] text-fog">Carregando a forma de onda…</p>
              )}
            </div>

            <div className="relative" style={{ height: CORTES }}>
              {p.cortes.map((c) => {
                const escolhido = sel?.tipo === 'corte' && sel.n === c.n
                return (
                  <button
                    key={c.n}
                    onClick={() => {
                      p.selecionar({ tipo: 'corte', n: c.n })
                      p.buscarBruto(c.ini)
                    }}
                    title={`✂${c.n} · ${ms3(c.ini)} → ${ms3(c.fim)} s · −${(c.fim - c.ini).toFixed(2)} s`}
                    className={cn(
                      'absolute top-[3px] h-[20px] -translate-x-1/2 rounded-full px-2 text-[10px] font-semibold',
                      escolhido ? 'bg-yellow text-ink' : 'bg-coral text-cream hover:bg-yellow hover:text-ink',
                    )}
                    style={{ left: ((c.ini + c.fim) / 2) * px }}
                  >
                    ✂{c.n}
                  </button>
                )
              })}
            </div>

            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-cream" style={{ left: p.bruto * px }}>
              <span className="absolute -top-px -left-[5px] h-3 w-[11px] bg-cream [clip-path:polygon(0_0,100%_0,50%_100%)]" />
              <span className="absolute top-3 left-1.5 rounded-[2px] bg-cream px-1 text-[9px] font-semibold text-ink tabular-nums">{ms3(p.bruto)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Zoom({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo} className="grid size-7 place-items-center rounded-full hover:bg-cream/10 hover:text-cream [&_svg]:size-3.5">
      {children}
    </button>
  )
}
