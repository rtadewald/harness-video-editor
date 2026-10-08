import { useEffect, useState } from 'react'
import type { ItemBanco } from '@/api'
import { cn } from '@/lib/utils'
import { ajustesEfetivos, comAjustes, type Ajustes } from './ajustes'
import CenaPreset from './CenaPreset'
import { areaDoInsert, divisaoDe, estiloDaPessoa, estiloDoAtor, receitaParaInsert } from './divisao'
import Fundo from './Fundo'
import { noFormato, type Preset } from './presets'

/** Uma situação de uso de um preset, para avaliar na página Presets: o modo de tela, quantas mídias e as proporções. */
export type Tela = 'dividida' | 'vertical' | 'atras'
export type Proporcoes = 'pe' | 'mista' | 'deitada' | '4:3' | '16:9' | '1:1'
export type Sim = { tela: Tela; n: number; prop: Proporcoes }

export const TELAS: { id: Tela; nome: string }[] = [
  { id: 'dividida', nome: 'Tela dividida' },
  { id: 'vertical', nome: 'Tela cheia' },
  { id: 'atras', nome: 'Ator embaixo' },
]
/** As proporções de cada caso: com 1 mídia, uma só; com várias, as combinações que acontecem. */
export const PROPORCOES = (n: number): { id: Proporcoes; nome: string }[] =>
  n === 1
    ? [
        { id: 'pe', nome: '9:16' },
        { id: '1:1', nome: '1:1' },
        { id: '4:3', nome: '4:3' },
        { id: '16:9', nome: '16:9' },
      ]
    : [
        { id: 'pe', nome: 'Todas 9:16' },
        { id: 'mista', nome: '9:16 + horizontais' },
        { id: 'deitada', nome: 'Só horizontais' },
      ]

const ASPECTO: Record<string, number> = { pe: 9 / 16, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 }
export function aspectosSim(s: Sim): number[] {
  return Array.from({ length: s.n }, (_, k) =>
    s.n === 1 ? (ASPECTO[s.prop] ?? 16 / 9) : s.prop === 'pe' ? 9 / 16 : s.prop === 'deitada' ? (k % 2 ? 4 / 3 : 16 / 9) : k % 2 ? 16 / 9 : 9 / 16,
  )
}

/** Vídeos de verdade para simular: do banco, por proporção, e o ator (o vídeo de um projeto e o recorte da pessoa). */
export type MidiasSim = { pe: string[]; h43: string[]; h169: string[]; ator: { video: string; pessoa: string | null } | null }

/** A mídia k da simulação, pela proporção dela: um vídeo do banco com essa proporção (rodando entre os que há). */
export function midiaSim(m: MidiasSim | null, aspecto: number, k: number): string | null {
  if (!m) return null
  const l = aspecto < 0.8 ? m.pe : aspecto > 1.5 ? (m.h169.length ? m.h169 : m.h43) : m.h43.length ? m.h43 : m.h169
  return l.length ? l[k % l.length] : null
}

/** Um vídeo em loop, mudo, tocando sozinho. */
const Video = ({ src, className, style }: { src: string; className?: string; style?: React.CSSProperties }) => (
  <video src={src} autoPlay loop muted playsInline preload="auto" className={className} style={style} />
)

/** O quadro 9:16 inteiro com o preset na situação `sim`: o fundo, o ator (o vídeo de um projeto; sem ele, um boneco) e o
 *  insert com as mesmas regras do editor (divisão pela proporção, card na proporção da mídia, ajustes). As mídias são
 *  vídeos do banco com a proporção certa (`midias`); sem eles, `midia(k)`. */
export default function Simulacao(p: {
  preset: Preset
  sim: Sim
  ajustes?: Ajustes
  t: number
  dur: number
  midia: (k: number) => string
  midias?: MidiasSim | null
  className?: string
  /** Tocando, a simulação tem o próprio relógio, com a duração de um insert de verdade (o trecho da referência é de um
   *  card só: com várias mídias seria curto demais); `reinicio` muda para recomeçar do zero. */
  tocando?: boolean
  reinicio?: number
}) {
  const { preset, sim } = p
  const durSim = Math.max(p.dur, sim.n > 1 ? 1.8 * sim.n : 2.5)
  const [tSim, setTSim] = useState(0)
  useEffect(() => {
    if (!p.tocando) return
    let id = 0
    const ini = performance.now()
    const passo = (agora: number) => {
      const t = ((agora - ini) / 1000) % (durSim + 0.4)
      setTSim(Math.min(t, durSim))
      if (t < 0.02) document.querySelectorAll<HTMLVideoElement>('[data-simulacao] video').forEach((v) => (v.currentTime = 0))
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [p.tocando, durSim, p.reinicio])
  const t = p.tocando ? tSim : p.t
  const dur = p.tocando ? durSim : p.dur
  const formato = sim.tela === 'vertical' ? 'vertical' : 'dividida'
  const aspectos = aspectosSim(sim)
  const ids = aspectos.map((_, k) => `sim${k}`)
  const banco = new Map(aspectos.map((a, k) => [ids[k], { id: ids[k], largura: Math.round(a * 1000), altura: 1000 } as ItemBanco]))
  const ajEf = ajustesEfetivos(preset, p.ajustes, aspectos)
  const pedido = { formato, midias: ids.map((banco) => ({ banco })), enriquecimento: { preset: preset.id, divisao: sim.tela === 'atras' ? 'atras' : null, ajustes: p.ajustes } }
  const divisao = divisaoDe(pedido, banco, [preset])
  const base = noFormato(preset, formato, sim.n).receita
  const receita = comAjustes(receitaParaInsert(comAjustes(base, ajEf, 'antes'), divisao, aspectos, formato), ajEf, 'depois')
  const atorReal = p.midias?.ator
  const ator = sim.tela !== 'vertical' && (
    <div className="pointer-events-none absolute inset-0" style={estiloDoAtor(divisao)}>
      {atorReal ? <Video src={atorReal.video} className="size-full object-cover" /> : <Boneco />}
    </div>
  )
  const pessoa = sim.tela === 'atras' && atorReal?.pessoa ? estiloDaPessoa(divisao) : null
  return (
    <div data-simulacao className={cn('relative aspect-[9/16] w-full overflow-hidden bg-black', p.className)}>
      {(sim.tela === 'atras' || formato === 'dividida') && <Fundo id="gradiente" />}
      {sim.tela === 'dividida' && ator}
      <div className="pointer-events-none absolute" style={areaDoInsert(divisao)}>
        <CenaPreset
          receita={receita}
          rel={t}
          dur={dur}
          fundo="gradiente"
          className="inset-0"
          semFundo={sim.tela === 'atras'}
          midia={(k, _rel, topo) => {
            const v = midiaSim(p.midias ?? null, aspectos[k] ?? 16 / 9, k)
            return v ? <Video src={v} className={cn('size-full object-cover', topo && 'object-top')} /> : <img src={p.midia(k)} alt="" className={cn('size-full object-cover', topo && 'object-top')} />
          }}
        />
      </div>
      {sim.tela === 'atras' && ator}
      {pessoa && atorReal?.pessoa && <Video src={atorReal.pessoa} className="pointer-events-none absolute inset-0 size-full object-cover" style={pessoa} />}
    </div>
  )
}

/** O ator na simulação: uma silhueta sobre um fundo de sala (só para ver onde ele fica e quanto ocupa). */
function Boneco() {
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" className="size-full">
      <defs>
        <linearGradient id="sala" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a5a52" />
          <stop offset="1" stopColor="#24302b" />
        </linearGradient>
      </defs>
      <rect width="90" height="160" fill="url(#sala)" />
      <circle cx="45" cy="52" r="15" fill="#c9a98c" />
      <path d="M12 160 C12 105 30 88 45 88 C60 88 78 105 78 160 Z" fill="#2f3a44" />
    </svg>
  )
}
