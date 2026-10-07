import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { urlBancoArquivo, urlBancoExportacao, versaoBanco, type ItemBanco, type MidiaLigada, type PedidoInsert } from '@/api'
import { cn } from '@/lib/utils'
import { SAIR, SUAVE, bezier } from './curvas'
import { curvaDe, duracaoDe, enriquecimentoDe, type Enriquecimento, type PadraoCurva } from './enriquecimento'
import Fundo, { RelogioRender } from './Fundo'

/** O insert desenhado por cima do ator, igual na prévia da etapa Inserts e na exportação (a página de render). */
export type PedidoNoTempo = PedidoInsert & { t: { inicio: number; fim: number } }

const limite = (v: number) => Math.max(0, Math.min(1, v))

/** Entrada e saída do insert (aproximadas): transform, opacidade e desfoque conforme o tempo dentro do plano. */
function estiloDeEntradaESaida(e: Enriquecimento, rel: number, dur: number, padrao?: PadraoCurva): React.CSSProperties {
  // a entrada anda na curva e na duração escolhidas (padrão: chega rápido e freia em 0,7 s; curvas que passam do ponto passam)
  const curva = bezier(...curvaDe(e, padrao))
  const ENTRADA_S = Math.min(duracaoDe(e, padrao), dur) // nunca mais longa que o próprio trecho
  const bruto = curva(limite(rel / ENTRADA_S)) // pode passar de 1 (curvas que passam do ponto e voltam)
  const pe = limite(bruto)
  const ps = e.saida === 'corte' ? 1 : 1 - SAIR(limite(1 - (dur - rel) / 0.4))
  const t: string[] = []
  let opacidade = 1
  let filtro = ''
  switch (e.entrada) {
    case 'surgir':
      opacidade = pe
      t.push(`scale(${0.94 + 0.06 * bruto})`)
      break
    case 'subir':
      opacidade = pe
      t.push(`translateY(${(1 - bruto) * 40}%)`)
      break
    case 'voo_3d':
      opacidade = pe
      t.push(`perspective(800px) rotateX(${(1 - bruto) * 55}deg) translateY(${(1 - bruto) * 30}%)`)
      break
    case 'zoom_borrado':
      opacidade = pe
      t.push(`scale(${1.25 - 0.25 * bruto})`)
      filtro = `blur(${(1 - pe) * 14}px)`
      break
  }
  if (e.saida === 'sumir') opacidade *= ps
  if (e.saida === 'deslizar') t.push(`translateX(${-(1 - ps) * 60}%)`)
  return { transform: t.join(' ') || undefined, opacity: opacidade, filter: filtro || undefined }
}

/** Um vídeo do banco sincronizado com o tempo do plano (um trecho toca o original do início ao fim dele). */
function VideoNoTempo({ item, rel, tocando, estilo }: { item: ItemBanco; rel: number; tocando: boolean; estilo?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null)
  const exato = useContext(RelogioRender) != null // na exportação, sempre o quadro exato
  const alvo = Math.min((item.inicio ?? 0) + rel, item.fim ?? Infinity)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (Math.abs(v.currentTime - alvo) > (exato ? 0.001 : tocando ? 0.3 : 0.03)) v.currentTime = alvo
    if (tocando && v.paused) void v.play().catch(() => {})
    if (!tocando && !v.paused) v.pause()
  })
  return <video ref={ref} src={exato ? urlBancoExportacao(item) : urlBancoArquivo(item.id) + versaoBanco(item)} muted playsInline preload="auto" className="size-full object-cover" style={estilo} />
}

/** As mídias do insert do momento por cima do vídeo, com o enriquecimento aproximado: layout, entrada e saída, como as
 *  mídias se combinam e o movimento. */
export default function InsertNoLugar(p: { pedido: PedidoNoTempo; banco: Map<string, ItemBanco>; tempo: number; tocando: boolean; fundo: string; padrao?: PadraoCurva }) {
  const { pedido, banco, tempo, tocando } = p
  const exportando = useContext(RelogioRender) != null // o contador "1/2" é só da prévia
  // por enquanto (decisão de Rodrigo, out/2026) só layout e entrada valem; o resto fica parado, em corte seco
  const e = { ...enriquecimentoDe(pedido), entre: 'sequencia_corte', movimento: 'parado', saida: 'corte' }
  const n = pedido.midias.length
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  const rel = Math.max(tempo - pedido.t.inicio, 0)
  const caixa = pedido.formato === 'vertical' ? 'inset-0' : 'inset-x-0 top-0 h-1/2'
  if (!n) return <div className={cn('pointer-events-none absolute grid place-items-center bg-black/55 p-6 text-center text-[12px] text-cream/80', caixa)}>Insert sem mídia</div>

  // movimento da mídia (dentro do layout)
  const movimento = (item?: ItemBanco): React.CSSProperties =>
    e.movimento === 'zoom_lento'
      ? { transform: `scale(${1 + 0.06 * SUAVE(limite(rel / dur))})` }
      : e.movimento === 'zoom_ponto'
        ? { transform: `scale(${1 + 0.25 * SUAVE(limite((rel / dur) * 2))})`, transformOrigin: '50% 35%' }
        : e.movimento === 'rolagem' && item?.tipo === 'imagem'
          ? { objectPosition: `50% ${SUAVE(limite(rel / dur)) * 100}%` }
          : {}
  const midia = (m: MidiaLigada, relM: number, extra?: React.CSSProperties) => {
    const item = banco.get(m.banco)
    const estilo = { ...movimento(item), ...extra }
    return item?.tipo === 'video' ? (
      <VideoNoTempo key={m.id} item={item} rel={relM} tocando={tocando} estilo={estilo} />
    ) : (
      <img key={m.id} src={urlBancoArquivo(m.banco)} alt="" className="size-full object-cover" style={estilo} />
    )
  }

  // como as mídias se combinam
  const parte = dur / n
  const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0)
  let conteudo: ReactNode
  if (n === 1 || e.entre === 'sequencia_corte') conteudo = midia(pedido.midias[k], rel - k * parte)
  else if (e.entre === 'sequencia_transicao') {
    const prox = Math.min(k + 1, n - 1)
    const mistura = prox !== k ? SUAVE(limite((rel - (k + 1) * parte + 0.3) / 0.3)) : 0
    conteudo = (
      <div className="relative size-full">
        <div className="absolute inset-0">{midia(pedido.midias[k], rel - k * parte)}</div>
        {mistura > 0 && <div className="absolute inset-0" style={{ opacity: mistura }}>{midia(pedido.midias[prox], 0)}</div>}
      </div>
    )
  } else
    conteudo = (
      <div className={cn('grid size-full gap-1 bg-black', e.entre === 'lado_a_lado' ? 'grid-flow-col auto-cols-fr' : e.entre === 'grade' ? 'grid-cols-2' : 'grid-flow-row auto-rows-fr')}>
        {pedido.midias.map((m) => (
          <div key={m.id} className="min-h-0 overflow-hidden">
            {midia(m, rel)}
          </div>
        ))}
      </div>
    )

  // layout (moldura) + entrada e saída
  const animacao = estiloDeEntradaESaida(e, rel, dur, p.padrao)
  const emCard = ['card', 'card_metade', 'janela_3d', 'janela_3d_metade', 'inclinado', 'destaque'].includes(e.layout)
  const moldura: React.CSSProperties =
    e.layout === 'janela_3d' || e.layout === 'janela_3d_metade'
      ? { transform: 'perspective(900px) rotateY(-14deg) rotateX(6deg)' }
      : e.layout === 'inclinado'
        ? { transform: 'rotate(-4deg) scale(0.94)' }
        : {}
  return (
    <div
      className={cn('pointer-events-none absolute overflow-hidden', caixa, !emCard && 'bg-black')}
      style={e.layout === 'mesclada' ? { WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)', maskImage: 'linear-gradient(to bottom, black 62%, transparent)' } : undefined}
    >
      {emCard && <Fundo id={p.fundo} />}
      {e.layout === 'destaque' && (
        <div className="absolute inset-0 scale-125 opacity-60 blur-2xl">{midia(pedido.midias[k], rel - k * parte)}</div>
      )}
      {/* os cards (card, card na metade): sem borda, cantos generosos e sombra larga e suave — como nos favoritos */}
      <div
        className={cn('absolute', !emCard ? 'inset-0' : e.layout === 'destaque' ? 'inset-[12%]' : e.layout === 'card_metade' ? 'inset-x-[6%] top-[9%] bottom-[7%]' : 'inset-[8%]')}
        style={animacao}
      >
        <div
          className={cn(
            'size-full overflow-hidden',
            emCard && (e.layout === 'card' || e.layout === 'card_metade'
              ? 'rounded-[18px] shadow-[0_30px_70px_-12px_rgba(0,0,0,0.45),0_12px_24px_-8px_rgba(0,0,0,0.3)]'
              : 'rounded-[14px] shadow-[0_18px_40px_#0009] ring-1 ring-white/10'),
          )}
          style={moldura}
        >
          {conteudo}
        </div>
      </div>
      {n > 1 && e.entre.startsWith('sequencia') && !exportando && (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-cream">
          {k + 1}/{n}
        </span>
      )}
    </div>
  )
}

/** Os pedidos de insert no tempo do vídeo final (o do plano da direção; sem ele, o guardado no pedido), em ordem. */
export const pedidosNoTempo = (pedidos: PedidoInsert[], planos: { id: string; inicio: number; fim: number }[]): PedidoNoTempo[] => {
  const tempos = new Map(planos.map((i) => [i.id, { inicio: i.inicio, fim: i.fim }]))
  return pedidos.map((x) => ({ ...x, t: tempos.get(x.plano) ?? { inicio: x.inicio, fim: x.inicio + x.duracao } })).sort((a, b) => a.t.inicio - b.t.inicio)
}
