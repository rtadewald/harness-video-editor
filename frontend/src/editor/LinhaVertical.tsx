import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Maximize2, Minus, Plus, X } from 'lucide-react'
import RoteiroCortes from './RoteiroCortes'
import { formatarDuracao, ms3, type Clipe, type Palavra, type Silencio, type Transcricao, type TranscricaoCompleta } from '@/api'
import { cn } from '@/lib/utils'
import type { Corte, Selecao } from './cortes'
import { useAtalhoZoom } from './useAtalhoZoom'

// colunas, da esquerda para a direita: régua · forma de onda · barras de tempo exato · palavras · cortes
const X_ONDA = 52
const L_ONDA = 84
const X_BARRA = X_ONDA + L_ONDA + 4 // barra do tempo refinado (e, ao lado, a do Whisper)
const X_PALAVRAS = X_BARRA + 30
const L_CORTES = 118
const ALT_PALAVRA = 17
const ALT_COMPACTO = 34 // altura de um corte compactado, qualquer que seja a duração dele
const PX_MIN_PALAVRAS = 60
const PX_MAX = 6000
const ZONA_MORTA_PX = 3 // a alça só começa a andar depois disso
const LISTRAS = 'repeating-linear-gradient(135deg, rgba(245,119,87,0.20) 0 5px, rgba(245,119,87,0.05) 5px 10px)'

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
  silencios: Silencio[]
  /** Motores de transcrição: qual está na tela, qual comparar e como trocar. */
  transcricoes: Record<string, Transcricao>
  ativa: string
  aoAtivar: (vid: string) => void
  comparar: string | null
  setComparar: (vid: string | null) => void
  comparacao: TranscricaoCompleta | null
  tentarMotor: (vid: string) => void
  /** Move uma borda de trecho mantido (o que arrastar nas pontas de um corte expandido). */
  ajustar: (clipeId: string, lado: 'inicio' | 'fim', t: number) => Promise<void>
  /** Refaz os trechos com as margens de Configurações, sem chamar a IA. */
  aoRecalcular: () => void
  /** Corta (`manter=false`) ou devolve ao vídeo (`manter=true`) um intervalo do bruto, mesmo no meio de um trecho mantido. */
  editarFaixa: (ini: number, fim: number, manter: boolean) => Promise<void>
}

/** Borda de corte sendo arrastada: `t` é o ponto atual, `orig` de onde saiu, `min`/`max` até onde pode ir. */
/** Trecho que está sendo escolhido com a ferramenta de cortar: do ponto onde o mouse desceu até onde está agora. */
type Faixa = { t0: number; t1: number; y0: number; moveu: boolean }

/** `linear`: a alça de um corte compactado anda no tempo real (px por segundo), não na faixa comprimida dele. */
type Arrasto = { cid: string; lado: 'inicio' | 'fim'; t: number; orig: number; min: number; max: number; y0: number; moveu: boolean; linear?: boolean }

/** Um pedaço do bruto na timeline: trecho mantido (proporcional ao tempo) ou corte (proporcional se expandido, linha fixa se compactado). */
type Seg = { t0: number; t1: number; y0: number; y1: number; corte: Corte | null; compacto: boolean }

/** Mapa entre o tempo do bruto e a posição vertical (cortes compactados encurtam o caminho). */
type Mapa = { segs: Seg[]; total: number; yDe: (t: number) => number; tDe: (y: number) => number; oculto: (t: number) => boolean }

/** Timeline VERTICAL da etapa de Cortes: o tempo corre de cima para baixo e cada palavra fica ao lado do seu instante.
 *  Os cortes ficam compactados em uma linha; o ícone ⇕ expande cada um para o tempo real. */
export default function LinhaVertical(p: Props) {
  const rolagem = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [px, setPx] = useState(110) // pixels por segundo
  const [scroll, setScroll] = useState(0)
  const [altura, setAltura] = useState(600)
  const [largura, setLargura] = useState(600)
  const [arrastando, setArrastando] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [roteiro, setRoteiro] = useState(false)
  const [cortando, setCortando] = useState(false) // ferramenta de corte: arrastar sobre a onda escolhe o trecho a cortar
  const [faixa, setFaixa] = useState<Faixa | null>(null)
  const novoCorte = useRef<{ t0: number; t1: number } | null>(null)
  const pendente = useRef<{ chave: string; t: number } | null>(null) // ajuste por teclado em andamento
  const fila = useRef<Promise<void>>(Promise.resolve())
  const ancora = useRef<{ t: number; y: number } | null>(null)
  const revelar = useRef(false)

  const pxFit = Math.max((altura - 30) / Math.max(p.duracao, 1), 1)
  const intervalos = useMemo(() => [...p.clipes].sort((a, b) => a.inicio - b.inicio).map((c) => [c.inicio, c.fim] as const), [p.clipes])

  // mapa entre tempo do bruto e posição vertical, considerando os cortes compactados
  const m: Mapa = useMemo(() => {
    const segs: Seg[] = []
    let t = 0
    let y = 0
    const add = (t0: number, t1: number, corte: Corte | null) => {
      if (t1 - t0 < 1e-6) return
      const compacto = corte != null && !expandidos.has(corte.n)
      const alto = compacto ? ALT_COMPACTO : (t1 - t0) * px
      segs.push({ t0, t1, y0: y, y1: y + alto, corte, compacto })
      y += alto
    }
    for (const c of [...p.cortes].sort((a, b) => a.ini - b.ini)) {
      add(t, c.ini, null)
      add(c.ini, c.fim, c)
      t = Math.max(t, c.fim)
    }
    add(t, p.duracao, null)
    const achaT = (tt: number) => segs.find((s) => tt <= s.t1 + 1e-9) ?? segs[segs.length - 1]
    const achaY = (yy: number) => segs.find((s) => yy <= s.y1) ?? segs[segs.length - 1]
    return {
      segs,
      total: y,
      yDe: (tt: number) => {
        const s = achaT(Math.min(Math.max(tt, 0), p.duracao))
        return s.y0 + ((Math.min(Math.max(tt, s.t0), s.t1) - s.t0) / (s.t1 - s.t0)) * (s.y1 - s.y0)
      },
      tDe: (yy: number) => {
        const s = achaY(yy)
        return s.t0 + ((Math.min(Math.max(yy, s.y0), s.y1) - s.y0) / (s.y1 - s.y0)) * (s.t1 - s.t0)
      },
      oculto: (tt: number) => achaT(tt).compacto,
    }
  }, [p.cortes, p.duracao, expandidos, px])

  useLayoutEffect(() => {
    const el = rolagem.current!
    const medir = () => {
      setAltura(el.clientHeight)
      setLargura(el.clientWidth)
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // depois do zoom, o instante sob o cursor continua no mesmo lugar da tela
  useLayoutEffect(() => {
    const a = ancora.current
    if (!a || !rolagem.current) return
    rolagem.current.scrollTop = m.yDe(a.t) - a.y
    ancora.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [px])

  const zoomPara = (novo: number, y = altura / 2) => {
    ancora.current = { t: m.tDe(scroll + y), y }
    setPx(Math.min(Math.max(novo, pxFit), PX_MAX))
  }
  useAtalhoZoom(() => zoomPara(px * 1.6), () => zoomPara(px / 1.6))

  useEffect(() => {
    const el = rolagem.current!
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomPara(px * Math.exp(-e.deltaY * 0.004), e.clientY - el.getBoundingClientRect().top)
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  })

  // tocando, a cabeça de reprodução fica na parte de cima da janela
  useEffect(() => {
    const r = rolagem.current
    if (!r || !p.tocando) return
    const y = m.yDe(p.bruto)
    if (y < r.scrollTop + 30 || y > r.scrollTop + r.clientHeight - 90) r.scrollTop = y - r.clientHeight * 0.3
  }, [p.bruto, m, p.tocando])

  const alternarCorte = (n: number) =>
    setExpandidos((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(n)) novo.add(n)
      return novo
    })

  // seleção feita fora da timeline traz o item para a janela; palavra escondida num corte compactado o expande
  useEffect(() => {
    if (!p.selecao) return
    const sel = p.selecao
    if (sel.tipo === 'palavra') {
      const w = p.palavras.find((x) => x.id === sel.id)
      const c = w && m.segs.find((s) => s.corte && w.inicio >= s.t0 - 1e-6 && w.inicio <= s.t1 && s.compacto)?.corte
      if (c) setExpandidos((a) => new Set(a).add(c.n))
    }
    revelar.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selecao])
  useLayoutEffect(() => {
    const r = rolagem.current
    if (!revelar.current || !r || !p.selecao) return
    revelar.current = false
    const sel = p.selecao
    const faixa =
      sel.tipo === 'palavra'
        ? (() => {
            const w = p.palavras.find((x) => x.id === sel.id)
            return w ? ([w.inicio, w.fim] as const) : null
          })()
        : (() => {
            const c = p.cortes.find((x) => x.n === sel.n)
            return c ? ([c.ini, c.fim] as const) : null
          })()
    if (!faixa) return
    const y0 = m.yDe(faixa[0])
    const y1 = m.yDe(faixa[1])
    const alto = y1 - y0 > r.clientHeight * 0.8
    if (y0 < r.scrollTop + 20 || y1 > r.scrollTop + r.clientHeight - 20) r.scrollTop = alto ? y0 - 60 : (y0 + y1) / 2 - r.clientHeight / 2
  })

  // forma de onda: só as linhas de pixels que estão na janela; cortes compactados não têm onda
  useEffect(() => {
    const c = canvas.current
    if (!c || !p.picos) return
    const dpr = window.devicePixelRatio || 1
    c.width = L_ONDA * dpr
    c.height = altura * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const meio = L_ONDA / 2
    let k = 0
    let si = 0
    for (let y = 0; y < altura; y++) {
      const Y = scroll + y
      while (si < m.segs.length - 1 && m.segs[si].y1 < Y) si++
      const s = m.segs[si]
      if (!s || Y > s.y1) break
      if (s.compacto) continue
      const t0 = s.t0 + (Y - s.y0) / px
      const t1 = t0 + 1 / px
      if (t0 > p.duracao) break
      const i0 = Math.floor(t0 * p.picosPorSegundo)
      const i1 = Math.min(Math.max(Math.ceil(t1 * p.picosPorSegundo), i0 + 1), p.picos.length)
      let mx = 0
      for (let i = i0; i < i1; i++) if (p.picos[i] > mx) mx = p.picos[i]
      while (k < intervalos.length && intervalos[k][1] < t0) k++
      const fica = k < intervalos.length && intervalos[k][0] <= (t0 + t1) / 2
      g.fillStyle = fica ? '#dce7ca' : 'rgba(245,119,87,0.8)'
      const w = (mx / 255) * (meio - 2)
      g.fillRect(meio - w, y, Math.max(w * 2, 1), 1)
    }
  }, [p.picos, p.picosPorSegundo, p.duracao, px, scroll, altura, intervalos, m])

  // com um motor para comparar, o texto se divide em duas colunas: A (o que está sendo visto) e B (o comparado)
  const comparando = p.comparacao != null
  const larguraA = Math.max(Math.floor((largura - X_PALAVRAS - L_CORTES) / 2) - 14, 120)
  const xB = X_PALAVRAS + larguraA + 8

  const tempoNoPonteiro = (e: PointerEvent<HTMLElement>) => {
    const caixa = rolagem.current!.getBoundingClientRect()
    return Math.min(Math.max(m.tDe(rolagem.current!.scrollTop + e.clientY - caixa.top), 0), p.duracao)
  }
  const arrastar = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setArrastando(true)
      p.buscarBruto(tempoNoPonteiro(e))
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => arrastando && p.buscarBruto(tempoNoPonteiro(e)),
    onPointerUp: () => setArrastando(false),
  }

  // O ponto novo é o original + o quanto o mouse andou desde que a alça foi pega (não a posição absoluta do mouse,
  // senão a borda dá um salto de até metade da altura da alça ao começar a arrastar).
  const moverBorda = (e: PointerEvent<HTMLElement>) => {
    if (!arrasto) return
    const dy = e.clientY - arrasto.y0
    if (!arrasto.moveu && Math.abs(dy) < ZONA_MORTA_PX) return
    const t = arrasto.linear ? arrasto.orig + dy / px : m.tDe(m.yDe(arrasto.orig) + dy)
    setArrasto({ ...arrasto, moveu: true, t: Math.min(Math.max(t, arrasto.min), arrasto.max) })
  }
  const soltarBorda = async () => {
    const a = arrasto
    setArrasto(null)
    if (a && a.moveu && Math.abs(a.t - a.orig) > 0.0005) await p.ajustar(a.cid, a.lado, a.t)
  }

  const faixaMao = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* sem ponteiro ativo (eventos sintéticos) */
      }
      const t = tempoNoPonteiro(e)
      setFaixa({ t0: t, t1: t, y0: e.clientY, moveu: false })
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!faixa) return
      setFaixa({ ...faixa, t1: tempoNoPonteiro(e), moveu: faixa.moveu || Math.abs(e.clientY - faixa.y0) >= ZONA_MORTA_PX })
    },
    onPointerUp: async () => {
      const f = faixa
      setFaixa(null)
      if (!f?.moveu) return
      const [a, b] = [Math.min(f.t0, f.t1), Math.max(f.t0, f.t1)]
      if (b - a < 0.02) return
      novoCorte.current = { t0: a, t1: b }
      await p.editarFaixa(a, b, false)
      setTimeout(() => (novoCorte.current = null), 2000) // se o corte foi recusado, não sobra pendência
    },
  }

  // o corte recém-criado já abre expandido e selecionado, para ajustar as bordas
  useEffect(() => {
    const n = novoCorte.current
    if (!n) return
    const meio = (n.t0 + n.t1) / 2
    const c = p.cortes.find((x) => x.ini <= meio && meio <= x.fim)
    if (!c) return
    novoCorte.current = null
    setExpandidos((a) => new Set(a).add(c.n))
    p.selecionar({ tipo: 'corte', n: c.n })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cortes])

  // Esc sai da ferramenta de cortar
  useEffect(() => {
    if (!cortando) return
    const sair = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setCortando(false)
      setFaixa(null)
    }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [cortando])

  /** Onde um instante cai em relação à fala: dentro de uma palavra (o corte a atravessaria), numa pausa ou entre palavras. */
  const ondeCai = (tt: number) => {
    const w = p.palavras.find((x) => tt > x.inicio + 0.002 && tt < x.fim - 0.002)
    if (w) return { texto: `dentro de “${w.texto}” (${Math.round((tt - w.inicio) * 1000)} ms depois do início)`, aviso: true }
    return p.silencios.some((s) => s.inicio - 0.002 <= tt && tt <= s.fim + 0.002) ? { texto: 'em pausa', aviso: false } : { texto: 'entre palavras', aviso: false }
  }

  /** Ajuste fino pelo teclado numa alça selecionada: ↑/↓ andam 10 ms (Shift 1 ms, Alt 50 ms). Cada toque vai para a fila. */
  const nudge = (e: React.KeyboardEvent, a: { cid: string; lado: 'inicio' | 'fim'; t: number; min: number; max: number }) => {
    const sentido = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
    if (!sentido) return
    e.preventDefault()
    e.stopPropagation()
    const chave = `${a.cid}:${a.lado}`
    const base = pendente.current?.chave === chave ? pendente.current.t : a.t
    const alvo = Math.min(Math.max(base + sentido * (e.altKey ? 0.05 : e.shiftKey ? 0.001 : 0.01), a.min), a.max)
    pendente.current = { chave, t: alvo }
    fila.current = fila.current
      .then(() => p.ajustar(a.cid, a.lado, alvo))
      .finally(() => {
        if (pendente.current?.t === alvo) pendente.current = null
      })
  }

  // pontas do corte = bordas dos trechos mantidos vizinhos; o topo move o fim do trecho de cima, a base o início do de
  // baixo. No corte compactado também (pedido de Rodrigo, out/2026: ajustar sem expandir), andando no tempo real.
  const alcasDo = (c: Corte, s: Seg) => {
    const alcas = [
      c.antes && { cid: c.antes.id, lado: 'fim' as const, t: c.ini, y: s.y0, min: c.antes.inicio + 0.05, max: c.fim - 0.02, auto: c.antes.auto?.fim },
      c.depois && { cid: c.depois.id, lado: 'inicio' as const, t: c.fim, y: s.y1, min: c.ini + 0.02, max: c.depois.fim - 0.05, auto: c.depois.auto?.inicio },
    ]
    return alcas.map((a) => {
      if (!a) return null
      const ajustada = a.auto != null && Math.abs(a.auto - a.t) > 0.0005
      return (
        <div
          key={a.lado}
          className="group absolute inset-x-0 z-[16] flex h-3 -translate-y-1/2 cursor-row-resize touch-none items-center justify-center"
          style={{ top: a.y }}
          title={`Arraste para ajustar este limite (${ms3(a.t)} s).${ajustada ? ` · a IA tinha posto ${ms3(a.auto!)}` : ''}`}
          tabIndex={0}
          data-alca
          onKeyDown={(e) => nudge(e, a)}
          onPointerDown={(e) => {
            e.stopPropagation()
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* sem ponteiro ativo (eventos sintéticos): segue sem captura */
            }
            setArrasto({ cid: a.cid, lado: a.lado, t: a.t, orig: a.t, min: a.min, max: a.max, y0: e.clientY, moveu: false, linear: s.compacto })
          }}
          onPointerMove={moverBorda}
          onPointerUp={soltarBorda}
        >
          <span className={cn('h-1 w-12 rounded-full group-focus:bg-yellow', ajustada ? 'bg-yellow' : 'bg-coral/80 group-hover:bg-yellow')} />
          <span className="pointer-events-none absolute left-2 hidden rounded-[3px] bg-deeper/95 px-1 text-[9px] font-semibold text-yellow tabular-nums group-focus:block group-hover:block">{ms3(a.t)} s · ↑↓ ajustam</span>
        </div>
      )
    })
  }

  // régua: só nos trechos proporcionais ao tempo
  const passo = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * px >= 44) ?? 60
  const casas = passo >= 1 ? 0 : passo >= 0.1 ? 1 : passo >= 0.01 ? 2 : 3
  const rotuloTempo = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(casas).padStart(casas ? casas + 3 : 2, '0')}`
  const marcas = m.segs.flatMap((s) => {
    if (s.compacto || s.y1 < scroll - 20 || s.y0 > scroll + altura + 20) return []
    const ta = s.t0 + Math.max(scroll - s.y0, 0) / px
    const tb = s.t0 + Math.min(scroll + altura - s.y0, s.y1 - s.y0) / px
    return Array.from({ length: Math.max(Math.floor(tb / passo) - Math.ceil(ta / passo) + 1, 0) }, (_, i) => {
      const t = (Math.ceil(ta / passo) + i) * passo
      return { t, y: s.y0 + (t - s.t0) * px }
    })
  })

  const naJanela = (y0: number, y1: number) => y1 >= scroll - 60 && y0 <= scroll + altura + 60
  const sel = p.selecao
  const todosExpandidos = p.cortes.length > 0 && p.cortes.every((c) => expandidos.has(c.n))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-r border-line-dark bg-deeper text-cream">
      {roteiro && <RoteiroCortes palavras={p.palavras} buscar={p.buscarBruto} fechar={() => setRoteiro(false)} />}
      <div className="shrink-0 border-b border-line-dark px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow truncate text-fog">
            Bruto {formatarDuracao(p.duracao)} → <b className="text-cream">{formatarDuracao(p.clipes.reduce((s, c) => s + c.fim - c.inicio, 0))}</b> · {p.cortes.length} cortes
          </span>
          <div className="flex items-center text-fog">
            <Icone rotulo="Afastar" onClick={() => zoomPara(px / 1.6)}><Minus /></Icone>
            <Icone rotulo="Aproximar" onClick={() => zoomPara(px * 1.6)}><Plus /></Icone>
            <Icone rotulo="Caber o bruto todo na janela" onClick={() => zoomPara(pxFit)}><Maximize2 /></Icone>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <div className="flex rounded-full border border-line-dark p-0.5" title="Tecla B alterna">
            {([true, false] as const).map((modo) => (
              <button key={String(modo)} onClick={() => p.setPular(modo)} className={cn('h-6 rounded-full px-2.5', p.pular === modo ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
                {modo ? 'Resultado' : 'Bruto'}
              </button>
            ))}
          </div>
          <Chave
            ligado={cortando}
            onClick={() => {
              setCortando((v) => !v)
              setFaixa(null)
            }}
            dica="Ferramenta de corte: arraste sobre a onda para escolher um trecho e cortá-lo, mesmo no meio de um trecho mantido (por exemplo, uma pausa). Esc sai."
          >
            ✂ Cortar trecho
          </Chave>
          <button
            onClick={() => setRoteiro(true)}
            title="O roteiro como a IA deixou: frase a frase, com o que foi cortado riscado"
            className="flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-2.5 text-fog hover:border-cream/50 hover:text-cream"
          >
            Roteiro
          </button>
          <button
            onClick={p.aoRecalcular}
            title="Reaplica as margens e o limite de pausas de Configurações aos trechos, sem chamar a IA. Descarta os ajustes manuais de borda e os cortes feitos à mão."
            className="flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-2.5 text-fog hover:border-cream/50 hover:text-cream"
          >
            Recalcular
          </button>
          <button
            onClick={() => setExpandidos(todosExpandidos ? new Set() : new Set(p.cortes.map((c) => c.n)))}
            disabled={p.cortes.length === 0}
            title={todosExpandidos ? 'Volta todos os cortes para uma linha só' : 'Abre todos os cortes no tempo real'}
            className="flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-2.5 text-fog hover:border-cream/50 hover:text-cream disabled:opacity-50 [&_svg]:size-3.5"
          >
            {todosExpandidos ? <ChevronsDownUp /> : <ChevronsUpDown />}
            {todosExpandidos ? 'Compactar tudo' : 'Expandir tudo'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[11px]">
          <span className="eyebrow text-fog">Ver</span>
          <Seletor valor={p.ativa} aoMudar={(v) => v && p.aoAtivar(v)} transcricoes={p.transcricoes} excluir={null} />
          <span className="eyebrow text-fog" title="Barras amarelas ao lado das palavras: onde esse motor marcou cada uma">Comparar</span>
          <Seletor valor={p.comparar ?? ''} aoMudar={(v) => p.setComparar(v || null)} transcricoes={p.transcricoes} excluir={p.ativa} vazio="— nenhum —" />
        </div>
        {cortando && <p className="mt-1.5 text-[11px] leading-[1.5] text-yellow">✂ Arraste sobre a onda para escolher o trecho a cortar. Esc sai.</p>}
        {Object.entries(p.transcricoes)
          .filter(([, v]) => v.status === 'erro' || v.status === 'sem_chave')
          .map(([vid, v]) => (
            <p key={vid} className="mt-1.5 flex items-start gap-2 text-[10px] leading-[1.5] text-fog">
              <span className="min-w-0 flex-1">
                <b className={v.status === 'erro' ? 'text-coral' : 'text-yellow'}>{v.nome}:</b> {v.erro}
              </span>
              <button onClick={() => p.tentarMotor(vid)} className="shrink-0 rounded-full border border-line-dark px-2 py-0.5 font-semibold hover:border-cream/50 hover:text-cream">
                Tentar de novo
              </button>
            </p>
          ))}
      </div>

      {/* o nome de cada motor sobre a sua coluna (e o aviso de zoom), numa faixa fora da rolagem: nada fica por cima
          das palavras nem dos cortes */}
      <div className="shrink-0 border-b border-line-dark text-[9px] leading-none font-semibold tracking-wide">
        <div className="relative h-[18px]">
          <span className="absolute top-[5px] whitespace-nowrap text-cream" style={{ left: X_PALAVRAS + 6 }}>
            {p.transcricoes[p.ativa]?.nome}
          </span>
          {comparando && (
            <span className="absolute top-[5px] whitespace-nowrap text-yellow" style={{ left: xB + 36 }}>
              {p.comparacao!.nome}
            </span>
          )}
        </div>
        {px < PX_MIN_PALAVRAS && (
          <p className="pr-3 pb-1.5 font-normal tracking-normal text-fog/70" style={{ paddingLeft: X_PALAVRAS + 6 }}>
            Aproxime (+ ou Ctrl/⌘ + roda do mouse) para ver as palavras.
          </p>
        )}
      </div>
      <div ref={rolagem} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="relative select-none" style={{ height: m.total + 60 }}>
          {/* cortes expandidos: faixa listrada no tempo real */}
          {m.segs.map((s) =>
            s.corte && !s.compacto ? (
              <div
                key={s.corte.n}
                className={cn('absolute inset-x-0 border-y', sel?.tipo === 'corte' && sel.n === s.corte.n ? 'border-yellow' : 'border-coral/50')}
                style={{ top: s.y0, height: Math.max(s.y1 - s.y0, 1), background: LISTRAS }}
              />
            ) : null,
          )}

          {sel?.tipo === 'palavra' &&
            (() => {
              const w = p.palavras.find((x) => x.id === sel.id)
              if (!w || m.oculto(w.inicio)) return null
              return <div className="pointer-events-none absolute right-0 bg-yellow/12 ring-1 ring-yellow/50" style={{ left: X_ONDA, top: m.yDe(w.inicio), height: Math.max((w.fim - w.inicio) * px, 1) }} />
            })()}

          {/* régua + onda + barras: arrastar aqui move a cabeça de reprodução */}
          <div {...(cortando ? faixaMao : arrastar)} className={cn('absolute top-0 bottom-0 left-0 z-10', cortando ? 'cursor-crosshair' : 'cursor-ns-resize', arrastando && 'cursor-grabbing')} style={{ width: X_PALAVRAS }}>
            {marcas.map((mk) => (
              <span key={mk.t} className="absolute left-0 w-[50px] border-t border-line-dark pr-1.5 text-right text-[9px] leading-none text-fog/80 tabular-nums" style={{ top: mk.y }}>
                <span className="relative -top-[5px]">{rotuloTempo(mk.t)}</span>
              </span>
            ))}
            <div className="absolute top-0 bottom-0" style={{ left: X_ONDA, width: L_ONDA }}>
              {p.picos ? (
                <canvas ref={canvas} className="pointer-events-none sticky top-0 block" style={{ width: L_ONDA, height: altura }} />
              ) : (
                <p className="p-2 text-[10px] text-fog">Carregando a onda…</p>
              )}
            </div>
          </div>

          {/* palavras de cada motor, cada uma ao lado do seu instante (o rótulo desce se colidir e uma linha o liga ao seu tempo) */}
          <ColunaPalavras
            tipo="a"
            palavras={p.palavras}
            m={m}
            px={px}
            total={m.total + 60}
            janela={naJanela}
            xBarra={X_BARRA}
            xRotulo={X_PALAVRAS}
            direita={comparando ? largura - (X_PALAVRAS + larguraA) : L_CORTES}
            bruto={p.bruto}
            escolhida={sel?.tipo === 'palavra' ? sel.id : null}
            aoClicar={(w) => {
              p.selecionar({ tipo: 'palavra', id: w.id })
              p.buscarBruto(w.inicio)
            }}
          />
          {comparando && p.comparacao && (
            <ColunaPalavras
              tipo="b"
              palavras={p.comparacao.palavras}
              m={m}
              px={px}
              total={m.total + 60}
              janela={naJanela}
              xBarra={xB}
              xRotulo={xB + 30}
              direita={L_CORTES}
              bruto={p.bruto}
              escolhida={null}
              aoClicar={(w) => p.buscarBruto(w.inicio)}
            />
          )}

          {/* cortes: compactados (uma linha com ⇕) ou expandidos (chip à direita com ⇳ para compactar de novo) */}
          {m.segs.map((s) => {
            const c = s.corte
            if (!c) return null
            const escolhido = sel?.tipo === 'corte' && sel.n === c.n
            const selecionar = () => {
              p.selecionar({ tipo: 'corte', n: c.n })
              p.buscarBruto(c.ini)
            }
            if (s.compacto) {
              const texto = c.removidas.map((w) => w.texto).join(' ')
              return (
                <span key={c.n}>
                {alcasDo(c, s)}
                <div
                  className={cn('absolute inset-x-0 z-[15] flex items-center gap-2 border-y pr-1.5 pl-3 text-[11px]', escolhido ? 'border-yellow bg-yellow/10' : 'border-coral/50')}
                  style={{ top: s.y0, height: ALT_COMPACTO, backgroundImage: LISTRAS }}
                  onDoubleClick={() => alternarCorte(c.n)}
                >
                  <button onClick={selecionar} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`✂${c.n} · ${ms3(c.ini)} → ${ms3(c.fim)} s`}>
                    <b className={cn('shrink-0', escolhido ? 'text-yellow' : 'text-coral')}>✂{c.n}</b>
                    <span className="shrink-0 tabular-nums text-fog">
                      −{(c.fim - c.ini).toFixed(1).replace('.', ',')} s{c.removidas.length > 0 ? ` · ${c.removidas.length} pal.` : ' · pausa'}
                    </span>
                    {texto && <span className="truncate text-fog/60 line-through decoration-coral/60">{texto}</span>}
                  </button>
                  <button
                    onClick={() => void p.editarFaixa(c.ini, c.fim, true)}
                    aria-label={`Excluir ✂${c.n}`}
                    title="Excluir este corte: o trecho volta para o vídeo"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-coral/25 text-coral hover:bg-yellow hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                  <button
                    onClick={() => alternarCorte(c.n)}
                    aria-label={`Expandir ✂${c.n}`}
                    title="Expandir: ver o que foi cortado no tempo real"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-coral text-cream hover:bg-yellow hover:text-ink"
                  >
                    <ChevronsUpDown className="size-3.5" />
                  </button>
                </div>
                </span>
              )
            }
            return (
              <span key={c.n}>
                {alcasDo(c, s)}
                {/* faixa do corte: o controle gruda no topo da janela enquanto o corte aparece, e sai junto com ele */}
                <div className="pointer-events-none absolute right-1.5 z-10" style={{ top: s.y0, height: Math.max(s.y1 - s.y0, 1) }}>
                <div className="pointer-events-auto sticky top-2 mt-2 flex w-fit items-center gap-1">
                  <button
                    onClick={() => void p.editarFaixa(c.ini, c.fim, true)}
                    aria-label={`Excluir ✂${c.n}`}
                    title="Excluir este corte: o trecho volta para o vídeo"
                    className="grid size-5 place-items-center rounded-full bg-coral/25 text-coral hover:bg-yellow hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                  <button
                    onClick={() => alternarCorte(c.n)}
                    aria-label={`Compactar ✂${c.n}`}
                    title="Compactar este corte"
                    className="grid size-5 place-items-center rounded-full bg-coral/25 text-coral hover:bg-yellow hover:text-ink"
                  >
                    <ChevronsDownUp className="size-3" />
                  </button>
                  <button
                    onClick={selecionar}
                    title={`✂${c.n} · ${ms3(c.ini)} → ${ms3(c.fim)} s · −${(c.fim - c.ini).toFixed(2).replace('.', ',')} s`}
                    className={cn('h-[20px] rounded-full px-2 text-[10px] font-semibold tabular-nums', escolhido ? 'bg-yellow text-ink' : 'bg-coral text-cream hover:bg-yellow hover:text-ink')}
                    style={{ width: L_CORTES - 38 }}
                  >
                    ✂{c.n} · −{(c.fim - c.ini).toFixed(1).replace('.', ',')} s
                  </button>
                </div>
                </div>
              </span>
            )
          })}

          {/* trecho que está sendo escolhido para cortar */}
          {faixa?.moveu && (() => {
            const [a, b] = [Math.min(faixa.t0, faixa.t1), Math.max(faixa.t0, faixa.t1)]
            return (
              <div className="pointer-events-none absolute inset-x-0 z-30 border-y-2 border-yellow bg-coral/30" style={{ top: m.yDe(a), height: Math.max(m.yDe(b) - m.yDe(a), 2) }}>
                <span className="absolute top-1 right-2 rounded-[3px] bg-yellow px-1.5 py-0.5 text-[10px] font-semibold text-ink tabular-nums">
                  ✂ −{(b - a).toFixed(3).replace('.', ',')} s · {ms3(a)} → {ms3(b)}
                </span>
              </div>
            )
          })()}

          {/* borda sendo arrastada: de onde saiu (tracejado) e onde vai cair (linha amarela com o tempo) */}
          {arrasto && (
            <>
              <div className="pointer-events-none absolute inset-x-0 z-30 border-t border-dashed border-yellow/60" style={{ top: m.yDe(arrasto.orig) }} />
              <div className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-yellow" style={{ top: arrasto.linear ? m.yDe(arrasto.orig) + (arrasto.t - arrasto.orig) * px : m.yDe(arrasto.t) }}>
                <span className={cn('absolute top-1 right-2 rounded-[3px] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', ondeCai(arrasto.t).aviso ? 'bg-coral text-cream' : 'bg-yellow text-ink')}>
                  {ms3(arrasto.t)} s · {arrasto.t - arrasto.orig >= 0 ? '+' : '−'}
                  {Math.abs(Math.round((arrasto.t - arrasto.orig) * 1000))} ms · {ondeCai(arrasto.t).texto}
                </span>
              </div>
            </>
          )}

          {/* cabeça de reprodução; o tempo fica centrado na linha, ou logo abaixo dela no topo (ali a metade de cima
              sairia da área de rolagem) */}
          <div className="pointer-events-none absolute inset-x-0 z-20 h-px bg-cream" style={{ top: m.yDe(p.bruto) }}>
            <span className={cn('absolute top-0 left-0 rounded-r-[2px] bg-cream px-1 py-px text-[9px] font-semibold text-ink tabular-nums', m.yDe(p.bruto) >= 8 && '-translate-y-1/2')}>
              {ms3(p.bruto)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

type ColunaProps = {
  /** 'a' é o motor que está sendo visto (tem seleção e cores de mantido/removido); 'b' é o comparado. */
  tipo: 'a' | 'b'
  palavras: Palavra[]
  m: Mapa
  px: number
  total: number
  janela: (y0: number, y1: number) => boolean
  xBarra: number
  xRotulo: number
  direita: number
  bruto: number
  escolhida: string | null
  aoClicar: (w: Palavra) => void
}

/** Uma coluna de palavras: a barra do tempo exato de cada uma e o rótulo ao lado. Se dois rótulos colidem, o de baixo desce
 *  e uma linha o liga ao seu instante. Palavras dentro de cortes compactados ficam escondidas. */
function ColunaPalavras(c: ColunaProps) {
  const mostrar = c.px >= PX_MIN_PALAVRAS
  const ys = useMemo(() => c.palavras.map((w) => (c.m.oculto(w.inicio) ? null : c.m.yDe(w.inicio))), [c.palavras, c.m])
  // o rótulo desce até o começo do próximo corte compactado, nunca por cima dele: o que não cabe fica só com a barra, e o
  // último rótulo que coube mostra quantos ficaram de fora (+N; aproximar os mostra)
  const { tops, fora } = useMemo(() => {
    const barreiras = c.m.segs.filter((s) => s.compacto).map((s) => s.y0)
    const fora = new Map<number, number>()
    let livre = -Infinity
    let b = 0
    let ultimo = -1
    const tops = ys.map((y, i) => {
      if (y == null) return null
      while (b < barreiras.length && barreiras[b] <= y) b++
      const top = Math.max(y, livre)
      if (top + ALT_PALAVRA > (barreiras[b] ?? Infinity) + 0.5) {
        if (ultimo >= 0) fora.set(ultimo, (fora.get(ultimo) ?? 0) + 1)
        return null
      }
      livre = top + ALT_PALAVRA
      ultimo = i
      return top
    })
    return { tops, fora }
  }, [ys, c.m])
  const a = c.tipo === 'a'

  return (
    <>
      {c.palavras.map((w, i) => {
        const y = ys[i]
        if (y == null || !c.janela(y, y + (w.fim - w.inicio) * c.px)) return null
        return (
          <i
            key={`b${w.id}`}
            className={cn('pointer-events-none absolute w-[6px] rounded-[1px]', a ? (w.mantida ? 'bg-mint' : 'bg-coral') : 'bg-yellow/80')}
            style={{ left: c.xBarra, top: y, height: Math.max((w.fim - w.inicio) * c.px - 1, 1) }}
          />
        )
      })}
      {mostrar && (
        <svg className="pointer-events-none absolute top-0" style={{ left: c.xBarra + 6, width: 24, height: c.total }}>
          {c.palavras.map((w, i) => {
            const y0 = ys[i]
            const top = tops[i]
            if (y0 == null || top == null || Math.abs(top - y0) < 3 || !c.janela(y0, top)) return null
            const ini = y0 + Math.max((w.fim - w.inicio) * c.px, 2) / 2
            const fim = top + ALT_PALAVRA / 2
            return <path key={w.id} d={`M0,${ini} C10,${ini} 10,${fim} 24,${fim}`} fill="none" stroke={!a ? '#f9db6d' : w.mantida ? '#dce7ca' : '#f57757'} strokeOpacity={0.45} />
          })}
        </svg>
      )}
      {mostrar &&
        c.palavras.map((w, i) => {
          const top = tops[i]
          if (top == null || !c.janela(top, top + ALT_PALAVRA)) return null
          const atual = c.bruto >= w.inicio && c.bruto < w.fim
          const mais = fora.get(i)
          return (
            <button
              key={w.id}
              onClick={() => c.aoClicar(w)}
              title={`${w.id} · ${ms3(w.inicio)} → ${ms3(w.fim)} s (${Math.round((w.fim - w.inicio) * 1000)} ms)${mais ? ` · mais ${mais} palavra(s) até o corte: aproxime para vê-las` : ''}`}
              className={cn(
                'absolute flex items-center justify-between gap-2 overflow-hidden rounded-[3px] px-1.5 text-left text-[12px] leading-none whitespace-nowrap',
                !a ? 'text-yellow hover:bg-yellow/10' : w.mantida ? 'text-cream hover:bg-cream/10' : 'text-fog/70 line-through decoration-coral decoration-[1.5px] hover:bg-coral/10',
                atual && 'bg-yellow !text-ink hover:bg-yellow',
                c.escolhida === w.id && 'ring-2 ring-yellow',
              )}
              style={{ top, height: ALT_PALAVRA, left: c.xRotulo, right: c.direita }}
            >
              <span className="truncate">{w.texto}</span>
              {mais && <span className="shrink-0 text-[10px] text-fog/70">+{mais}</span>}
            </button>
          )
        })}
    </>
  )
}

const ROTULO_STATUS: Record<Transcricao['status'], string> = {
  pronto: '',
  pendente: ' — na fila',
  rodando: ' — rodando…',
  erro: ' — erro',
  sem_chave: ' — sem chave de API',
}

/** Lista de motores; os que ainda não estão prontos aparecem desabilitados, com o motivo. */
function Seletor({ valor, aoMudar, transcricoes, excluir, vazio }: { valor: string; aoMudar: (v: string) => void; transcricoes: Record<string, Transcricao>; excluir: string | null; vazio?: string }) {
  return (
    <select
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      className="h-7 min-w-0 rounded-full border border-line-dark bg-deeper px-2.5 text-[11px] font-semibold text-cream outline-none focus:border-cream/60"
    >
      {vazio && <option value="">{vazio}</option>}
      {Object.entries(transcricoes)
        .filter(([vid]) => vid !== excluir)
        .map(([vid, v]) => (
          <option key={vid} value={vid} disabled={v.status !== 'pronto'}>
            {v.nome}
            {ROTULO_STATUS[v.status]}
          </option>
        ))}
    </select>
  )
}

function Icone({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo} className="grid size-7 place-items-center rounded-full hover:bg-cream/10 hover:text-cream [&_svg]:size-3.5">
      {children}
    </button>
  )
}

function Chave({ ligado, onClick, dica, children }: { ligado: boolean; onClick: () => void; dica: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={dica} className={cn('h-7 rounded-full border px-2.5', ligado ? 'border-yellow text-yellow' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream')}>
      {children}
    </button>
  )
}
