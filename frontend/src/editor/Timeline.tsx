import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { formatarDuracao, formatarTempo, type Palavra, type Timeline as TTimeline } from '@/api'
import { cn } from '@/lib/utils'
import type { Sequencia } from './sequencia'

type Trilha = 'LEG' | 'V3' | 'V2' | 'V1' | 'A1'
const TRILHAS: { id: Trilha; altura: number }[] = [
  { id: 'LEG', altura: 26 },
  { id: 'V3', altura: 34 },
  { id: 'V2', altura: 34 },
  { id: 'V1', altura: 46 },
  { id: 'A1', altura: 40 },
]
const REGUA = 26

type Props = {
  seq: Sequencia
  duracaoBruto: number
  timeline: TTimeline
  palavras: Palavra[]
  tempo: number
  tocando: boolean
  ativa: Trilha
  buscar: (s: number) => void
  refazendo: boolean
  aoRefazer: () => void
}

export default function Timeline({ seq, duracaoBruto, timeline, palavras, tempo, tocando, ativa, buscar, refazendo, aoRefazer }: Props) {
  const rolagem = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(0) // pixels por segundo
  const [arrastando, setArrastando] = useState(false)

  const ajustar = () => {
    const w = rolagem.current?.clientWidth ?? 800
    setPx(Math.max((w - 24) / Math.max(seq.duracao, 1), 1))
  }
  useLayoutEffect(() => ajustar(), [seq.duracao]) // eslint-disable-line react-hooks/exhaustive-deps

  // durante a reprodução, a cabeça nunca sai da tela
  useEffect(() => {
    const r = rolagem.current
    if (!r || !tocando) return
    const x = tempo * px
    if (x < r.scrollLeft || x > r.scrollLeft + r.clientWidth - 40) r.scrollLeft = x - 40
  }, [tempo, px, tocando])

  const buscarNoPonteiro = (e: PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    buscar((e.clientX - caixa.left) / px)
  }

  const passo = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * px >= 70) ?? 60
  const marcas = Array.from({ length: Math.floor(seq.duracao / passo) + 1 }, (_, i) => i * passo)
  const largura = seq.duracao * px + 24
  const textoDe = (ini: string, fim: string) => {
    const a = palavras.findIndex((p) => p.id === ini)
    const b = palavras.findIndex((p) => p.id === fim)
    return palavras.slice(a, b + 1).map((p) => p.texto).join(' ')
  }

  const blocos: Record<Trilha, { id: string; ini: number; fim: number; texto: string }[]> = {
    V1: seq.clipes.map((c) => ({ id: c.id, ini: c.saida_ini, fim: c.saida_fim, texto: textoDe(c.palavra_ini, c.palavra_fim) })),
    A1: seq.clipes.map((c) => ({ id: c.id, ini: c.saida_ini, fim: c.saida_fim, texto: '' })),
    V2: posicionar(timeline.V2.map((i) => ({ ...i, texto: i.rotulo }))),
    V3: posicionar(timeline.V3.map((i) => ({ ...i, texto: i.rotulo }))),
    LEG: posicionar(timeline.LEG),
  }
  function posicionar(itens: { id: string; texto: string; palavra_ini: string; palavra_fim: string }[]) {
    return itens.flatMap((i) => {
      const r = seq.intervalo(i)
      return r ? [{ id: i.id, ini: r.ini, fim: r.fim, texto: i.texto }] : []
    })
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-deeper text-cream">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line-dark px-3">
        <span className="eyebrow text-fog">
          Timeline · bruto {formatarDuracao(duracaoBruto)} → <b className="text-cream">{formatarDuracao(seq.duracao)}</b> · {seq.clipes.length} trechos
        </span>
        <div className="flex items-center gap-1 text-fog">
          <button
            onClick={aoRefazer}
            disabled={refazendo}
            title="Pede à IA uma nova seleção do texto final (não retranscreve)"
            className="mr-2 flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-3 text-[11px] font-semibold hover:border-cream/50 hover:text-cream disabled:opacity-60"
          >
            <RotateCcw className={cn('size-3', refazendo && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
            {refazendo ? 'IA refazendo os cortes…' : 'Refazer cortes com IA'}
          </button>
          <BotaoZoom rotulo="Afastar" onClick={() => setPx((v) => Math.max(v / 1.5, 1))}><Minus /></BotaoZoom>
          <BotaoZoom rotulo="Aproximar" onClick={() => setPx((v) => Math.min(v * 1.5, 400))}><Plus /></BotaoZoom>
          <BotaoZoom rotulo="Caber na tela" onClick={ajustar}><Maximize2 /></BotaoZoom>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-12 shrink-0 border-r border-line-dark pt-[26px]">
          {TRILHAS.map((t) => (
            <div
              key={t.id}
              style={{ height: t.altura }}
              className={cn(
                'flex items-center justify-center border-b border-line-dark text-[10px] font-semibold tracking-[0.12em]',
                t.id === ativa || (ativa === 'V1' && t.id === 'A1') ? 'bg-cream/10 text-cream' : 'text-fog/60',
              )}
            >
              {t.id}
            </div>
          ))}
        </div>

        <div ref={rolagem} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div
            className={cn('relative select-none', arrastando ? 'cursor-grabbing' : 'cursor-text')}
            style={{ width: largura }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setArrastando(true)
              buscarNoPonteiro(e)
            }}
            onPointerMove={(e) => arrastando && buscarNoPonteiro(e)}
            onPointerUp={() => setArrastando(false)}
          >
            <div className="relative border-b border-line-dark" style={{ height: REGUA }}>
              {marcas.map((s) => (
                <span key={s} className="absolute top-0 h-full border-l border-line-dark pt-1 pl-1 text-[9px] text-fog/70 tabular-nums" style={{ left: s * px }}>
                  {formatarDuracao(s)}
                </span>
              ))}
            </div>

            {TRILHAS.map((t) => (
              <div key={t.id} className="relative border-b border-line-dark" style={{ height: t.altura }}>
                {blocos[t.id].map((b, i) => (
                  <Bloco key={b.id} trilha={t.id} indice={i} esquerda={b.ini * px} largura={(b.fim - b.ini) * px} texto={b.texto} />
                ))}
              </div>
            ))}

            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-coral" style={{ left: tempo * px }}>
              <span className="absolute -top-px -left-[5px] h-3 w-[11px] bg-coral [clip-path:polygon(0_0,100%_0,50%_100%)]" />
              <span className="absolute top-3 left-1.5 rounded-[2px] bg-coral px-1 text-[9px] font-semibold text-cream tabular-nums">
                {formatarTempo(tempo)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const COR: Record<Trilha, string> = {
  V1: 'bg-mint text-ink',
  V2: 'bg-blue text-cream',
  V3: 'bg-yellow text-ink',
  LEG: 'bg-cream text-ink',
  A1: 'bg-coral/15 text-coral',
}

function Bloco({ trilha, indice, esquerda, largura, texto }: { trilha: Trilha; indice: number; esquerda: number; largura: number; texto: string }) {
  return (
    <div
      className={cn('absolute inset-y-[3px] overflow-hidden rounded-[3px] border-r-2 border-deeper px-1.5 text-[10px] leading-none whitespace-nowrap', COR[trilha])}
      style={{ left: esquerda, width: Math.max(largura, 2) }}
      title={texto}
    >
      {trilha === 'A1' ? <Onda semente={indice} /> : <span className="flex h-full items-center font-medium">{texto}</span>}
    </div>
  )
}

/** Forma de onda falsa (fase 2): barras pseudoaleatórias e estáveis. */
function Onda({ semente }: { semente: number }) {
  const barras = Array.from({ length: 80 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin((i + 1) * (semente + 3) * 12.9898) % 1))
  return (
    <svg className="size-full" preserveAspectRatio="none" viewBox="0 0 80 10" aria-hidden="true">
      {barras.map((h, i) => (
        <rect key={i} x={i + 0.15} width={0.7} y={5 - h * 4.5} height={h * 9} fill="currentColor" />
      ))}
    </svg>
  )
}

function BotaoZoom({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo} className="grid size-7 place-items-center rounded-full hover:bg-cream/10 hover:text-cream [&_svg]:size-3.5">
      {children}
    </button>
  )
}
