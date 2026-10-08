import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { urlBancoMiniatura, type ItemRef, type MidiaLigada, type PedidoInsert } from '@/api'
import { cn } from '@/lib/utils'
import { COR_ELEMENTO, COR_PLANO } from '@/referencias/LinhaDirecao'
import { corteDe, enriquecimentoDe, type Formato, type Qual } from './enriquecimento'
import { useAtalhoZoom } from './useAtalhoZoom'

export type PlanoLinha = ItemRef & { n: number; fala: string }
type Aba = 'midias' | 'motion' | 'enriquecimento'

const ROTULO = 88 // coluna dos nomes das trilhas
const TRILHAS: { id: 'planos' | 'midias' | 'elementos'; nome: string; alt: number }[] = [
  { id: 'planos', nome: 'Planos', alt: 34 },
  { id: 'midias', nome: 'Mídias', alt: 42 },
  { id: 'elementos', nome: 'Elementos', alt: 24 },
]
const TEM_MOTION = ['motion_tela_cheia', 'tela_dividida_motion']

/** Timeline horizontal da etapa Inserts (só leitura; estilo editor de vídeo): régua, planos, mídias e elementos. */
export default function LinhaInserts(p: {
  duracao: number
  planos: PlanoLinha[]
  elementos: ItemRef[]
  palavras: { id: string; texto: string; inicio: number; fim: number }[]
  pedidos: Map<string, PedidoInsert>
  nomes: Record<string, string>
  tempo: number
  tocando: boolean
  selecionado: string | null
  buscar: (t: number) => void
  selecionar: (plano: string, aba?: Aba) => void
  /** Com 2 mídias: clicar num bloco seleciona o plano; mudar onde a 2ª começa (fração do insert; null = no meio). */
  escolherMidia: (plano: string) => void
  ajustarCorte: (pid: string, v: number | null, salvar: boolean) => void
}) {
  const rolagem = useRef<HTMLDivElement>(null)
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
  const tDe = (clientX: number) => {
    const el = rolagem.current!
    return Math.max(0, Math.min((clientX - el.getBoundingClientRect().left + el.scrollLeft - ROTULO) / px, p.duracao))
  }
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
  const faixa = (k: number) => TRILHAS.slice(0, k).reduce((a, t) => a + t.alt + 4, 22)

  return (
    <div className="flex min-h-0 flex-col border-t border-line-dark">
      <div className="flex items-center gap-2 border-b border-line-dark px-3 py-1.5 text-[11px] text-fog">
        <span className="eyebrow text-sage">Linha do tempo</span>
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
      <div ref={rolagem} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden select-none">
        <div className="relative" style={{ width: largura + ROTULO + 24, height: faixa(TRILHAS.length) + 4 }}>
          {/* nomes das trilhas (fixos ao rolar) */}
          <div className="sticky left-0 z-30 h-full border-r border-line-dark bg-deep" style={{ width: ROTULO }}>
            {TRILHAS.map((t, k) => (
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

            {/* planos */}
            {p.planos.map((pl) => {
              const ped = p.pedidos.get(pl.id)
              const motion = TEM_MOTION.includes(pl.tipo)
              const mudado = Object.keys(ped?.enriquecimento ?? {}).length > 0
              return (
                <button
                  key={pl.id}
                  onClick={() => p.selecionar(pl.id)}
                  className={cn(
                    'absolute flex items-center gap-1 overflow-hidden rounded-[4px] px-1.5 text-left text-[10.5px] font-semibold whitespace-nowrap',
                    COR_PLANO[pl.tipo],
                    motion && 'border border-dashed border-ink/50',
                    p.selecionado === pl.id && 'z-10 shadow-[0_0_0_2px_#f9db6d]',
                  )}
                  style={{ left: x(pl.inicio) + 1, width: Math.max(x(pl.fim - pl.inicio) - 2, 2), top: faixa(0), height: TRILHAS[0].alt }}
                  title={`${pl.n} · ${p.nomes[pl.tipo]}${pl.descricao ? ` — ${pl.descricao}` : ''}`}
                >
                  <span className="shrink-0 opacity-70">{pl.n}</span>
                  <span className="truncate">{p.nomes[pl.tipo]}</span>
                  {mudado && <span className="shrink-0 text-yellow">✦</span>}
                </button>
              )
            })}

            {/* mídias */}
            {p.planos.map((pl) => {
              const ped = p.pedidos.get(pl.id)
              const lugar = { left: x(pl.inicio) + 1, width: Math.max(x(pl.fim - pl.inicio) - 2, 2), top: faixa(1), height: TRILHAS[1].alt }
              if (TEM_MOTION.includes(pl.tipo))
                return (
                  <button
                    key={pl.id}
                    onClick={() => p.selecionar(pl.id, 'motion')}
                    className="absolute overflow-hidden rounded-[4px] border border-dashed border-yellow/40 px-1 text-[9.5px] whitespace-nowrap text-yellow/80"
                    style={lugar}
                  >
                    em construção
                  </button>
                )
              if (!ped) return null
              if (ped.midias.length === 2)
                return (
                  <TrilhaDupla
                    key={pl.id}
                    pl={pl}
                    ped={ped}
                    x={x}
                    tDe={tDe}
                    lugar={lugar}
                    palavras={p.palavras}
                    selecionado={p.selecionado === pl.id}
                    escolher={() => p.escolherMidia(pl.id)}
                    ajustar={(v, salvar) => p.ajustarCorte(ped.id, v, salvar)}
                  />
                )
              return (
                <button
                  key={pl.id}
                  onClick={() => p.selecionar(pl.id, 'midias')}
                  className={cn(
                    'absolute flex items-center gap-0.5 overflow-hidden rounded-[4px] bg-cream/[0.05] p-0.5 ring-1 ring-line-dark',
                    p.selecionado === pl.id && 'ring-2 ring-yellow',
                  )}
                  style={lugar}
                  title="Mídias deste insert"
                >
                  {ped.midias.length ? (
                    ped.midias.map((m) => <img key={m.id} src={urlBancoMiniatura(m.banco)} alt="" className="h-full w-auto shrink-0 rounded-[2px] bg-black object-cover" style={{ aspectRatio: '16 / 9' }} />)
                  ) : (
                    <span className="mx-auto text-[9.5px] whitespace-nowrap text-coral">+ mídia</span>
                  )}
                </button>
              )
            })}

            {/* elementos */}
            {p.elementos.map((el) => (
              <div
                key={el.id}
                className={cn('absolute overflow-hidden rounded-[3px] px-1 text-[9.5px] leading-[24px] font-semibold whitespace-nowrap', COR_ELEMENTO[el.tipo])}
                style={{ left: x(el.inicio), width: Math.max(x(el.fim - el.inicio), 4), top: faixa(2), height: TRILHAS[2].alt }}
                title={`${p.nomes[el.tipo]}${el.texto ? `: “${el.texto}”` : ''}`}
              >
                {el.texto || p.nomes[el.tipo]}
              </div>
            ))}

            {/* cabeça de reprodução */}
            <div className="pointer-events-none absolute top-0 z-20 w-0.5 bg-coral" style={{ left: x(p.tempo), height: faixa(TRILHAS.length) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

const MIN_MIDIA = 0.5 // s: nenhuma das duas mídias fica com menos que isto
const IMA_PX = 10 // a emenda gruda no começo de uma palavra a até 10 px (Shift solta o ímã)

/** As 2 mídias de um insert na trilha Mídias: na sequência, uma depois da outra; nos layouts em que as duas aparecem
 *  juntas, a 1ª o insert todo (em cima) e a 2ª do corte até o fim (embaixo). A alça muda onde a 2ª começa; duplo clique
 *  volta ao meio; clicar num bloco seleciona o plano. */
function TrilhaDupla(p: {
  pl: PlanoLinha
  ped: PedidoInsert
  x: (t: number) => number
  tDe: (clientX: number) => number
  lugar: { left: number; width: number; top: number; height: number }
  palavras: { inicio: number }[]
  selecionado: boolean
  escolher: () => void
  ajustar: (v: number | null, salvar: boolean) => void
}) {
  const e = enriquecimentoDe(p.ped as PedidoInsert & { formato: Formato })
  const dur = Math.max(p.pl.fim - p.pl.inicio, 0.01)
  const tc = p.pl.inicio + corteDe(e, dur) * dur
  const juntas = e.entre !== 'sequencia'
  const [a, b] = p.ped.midias
  const { top, height } = p.lugar
  const arrastar = (ev: React.PointerEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
    let ultimo: number | null = null
    const onde = (cx: number, livre: boolean) => {
      let t = p.tDe(cx)
      if (!livre) {
        // ímã: o começo da palavra mais perto, se estiver a poucos pixels
        const perto = p.palavras.filter((w) => w.inicio > p.pl.inicio + MIN_MIDIA && w.inicio < p.pl.fim - MIN_MIDIA)
          .reduce<number | null>((m, w) => (m == null || Math.abs(w.inicio - t) < Math.abs(m - t) ? w.inicio : m), null)
        if (perto != null && Math.abs(p.x(perto) - p.x(t)) <= IMA_PX) t = perto
      }
      // juntas, a 2ª pode começar com a 1ª (ímã no início); na sequência, a 1ª fica pelo menos 0,5 s
      if (juntas && !livre && p.x(t) - p.x(p.pl.inicio) <= IMA_PX) t = p.pl.inicio
      t = Math.max(p.pl.inicio + (juntas ? 0 : MIN_MIDIA), Math.min(p.pl.fim - MIN_MIDIA, t))
      return Math.round(Math.max(juntas ? 0 : 0.05, Math.min(0.95, (t - p.pl.inicio) / dur)) * 1000) / 1000
    }
    const mover = (m: PointerEvent) => {
      ultimo = onde(m.clientX, m.shiftKey)
      p.ajustar(ultimo, false)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (ultimo != null) p.ajustar(ultimo, true)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const bloco = (m: MidiaLigada, q: Qual, ini: number, fim: number, cima: number, alt: number) => (
    <button
      key={m.id}
      onClick={(ev) => {
        ev.stopPropagation()
        p.escolher()
      }}
      className={cn(
        'absolute flex items-center gap-1 overflow-hidden rounded-[4px] bg-cream/[0.05] p-0.5 text-[9.5px] font-semibold text-cream/80 ring-1 ring-line-dark',
        p.selecionado && 'ring-2 ring-yellow',
      )}
      style={{ left: p.x(ini) + 1, width: Math.max(p.x(fim - ini) - 2, 2), top: cima, height: alt }}
      title={`${q}ª mídia`}
    >
      <img src={urlBancoMiniatura(m.banco)} alt="" className="h-full w-auto shrink-0 rounded-[2px] bg-black object-cover" style={{ aspectRatio: '16 / 9' }} />
      <span className="shrink-0 rounded-full bg-black/50 px-1">{q}</span>
    </button>
  )
  return (
    <>
      {juntas ? (
        <>
          {bloco(a, 1, p.pl.inicio, p.pl.fim, top, height / 2 - 1)}
          {bloco(b, 2, tc, p.pl.fim, top + height / 2 + 1, height / 2 - 1)}
        </>
      ) : (
        <>
          {bloco(a, 1, p.pl.inicio, tc, top, height)}
          {bloco(b, 2, tc, p.pl.fim, top, height)}
        </>
      )}
      {/* a alça: onde a 2ª mídia começa */}
      <div
        onPointerDown={arrastar}
        onDoubleClick={(ev) => {
          ev.stopPropagation()
          p.ajustar(null, true)
        }}
        className="group absolute z-20 flex w-2.5 -translate-x-1/2 cursor-ew-resize justify-center"
        style={{ left: p.x(tc), top: top - 3, height: height + 6 }}
        title="Arraste para mudar onde a 2ª mídia começa (gruda no começo das palavras; Shift solta). Duplo clique: no meio."
      >
        <span className="h-full w-0.5 rounded-full bg-yellow/70 group-hover:w-1 group-hover:bg-yellow" />
      </div>
    </>
  )
}
