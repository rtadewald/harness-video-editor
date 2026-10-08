import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { urlBancoArquivo, urlBancoExportacao, versaoBanco, type ItemBanco, type MidiaLigada, type PedidoInsert } from '@/api'
import { cn } from '@/lib/utils'
import { SAIR, ZOOM_LEVE, bezier } from './curvas'
import { corteDe, curvaDe, duracaoDe, enriquecimentoDe, entradaDe, type Enriquecimento, type PadraoCurva, type Qual } from './enriquecimento'
import Fundo, { RelogioRender } from './Fundo'

/** O insert desenhado por cima do ator, igual na prévia da etapa Inserts e na exportação (a página de render). */
export type PedidoNoTempo = PedidoInsert & { t: { inicio: number; fim: number } }

const limite = (v: number) => Math.max(0, Math.min(1, v))

/** Entrada e saída de uma mídia do insert: transform, opacidade e desfoque conforme o tempo desde que ela começa. */
function estiloDeEntradaESaida(e: Enriquecimento, rel: number, dur: number, padrao?: PadraoCurva, qual: Qual = 1): React.CSSProperties {
  // a entrada anda na curva e na duração escolhidas (curvas que passam do ponto passam)
  const curva = bezier(...curvaDe(e, padrao, qual))
  const ENTRADA_S = Math.min(duracaoDe(e, padrao, qual), dur) // nunca mais longa que o próprio trecho
  const bruto = curva(limite(rel / ENTRADA_S)) // pode passar de 1 (curvas que passam do ponto e voltam)
  const pe = limite(bruto)
  const ps = e.saida === 'corte' ? 1 : 1 - SAIR(limite(1 - (dur - rel) / 0.4))
  const t: string[] = []
  let opacidade = 1
  let filtro = ''
  switch (entradaDe(e, qual)) {
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
    case 'seco_zoom':
      // aparece de uma vez e o card inteiro aproxima até 106% ao longo da mídia toda
      t.push(`scale(${1 + 0.06 * ZOOM_LEVE(limite(rel / Math.max(dur, 0.01)))})`)
      break
  }
  if (e.saida === 'sumir') opacidade *= ps
  if (e.saida === 'deslizar') t.push(`translateX(${-(1 - ps) * 60}%)`)
  return { transform: t.join(' ') || undefined, opacity: opacidade, filter: filtro || undefined }
}

/** Quanto tempo (s, desde o começo do insert) as entradas levam para terminar: depois disso o insert fica parado. */
export function fimDasEntradas(x: PedidoNoTempo, padrao?: PadraoCurva): number {
  const e = enriquecimentoDe(x)
  const dur = Math.max(x.t.fim - x.t.inicio, 0.01)
  // a "seca + zoom leve" anda até o fim da mídia: nunca fica parada
  const a = e.entrada === 'sem' ? 0 : e.entrada === 'seco_zoom' ? Infinity : Math.min(duracaoDe(e, padrao, 1), dur)
  if (x.midias.length !== 2) return a
  const corte = corteDe(e, dur) * dur
  return Math.max(a, corte + (e.entrada_2 === 'sem' ? 0 : e.entrada_2 === 'seco_zoom' ? Infinity : Math.min(duracaoDe(e, padrao, 2), dur - corte)))
}

// 2 mídias juntas na tela (decisão de Rodrigo, out/2026): o espaço de cada card (A = 1ª, B = 2ª)
const DUPLA: Record<string, { a: string; b: string }> = {
  empilhadas: { a: 'inset-x-[7%] top-[5%] h-[43%]', b: 'inset-x-[7%] bottom-[5%] h-[43%]' },
  lado_a_lado: { a: 'left-[4%] top-[12%] bottom-[12%] w-[45%]', b: 'right-[4%] top-[12%] bottom-[12%] w-[45%]' },
}
/** Mídia em pé (9:16 e parecidas): não cabe na proporção num espaço deitado; preenche e mostra a parte de cima. */
const EM_PE = 0.8
/** O maior retângulo na proporção `ar` (largura ÷ altura) que cabe no espaço (o pai tem `container-type: size`). */
const naProporcao = (ar: number): React.CSSProperties => ({ width: `min(100cqw, calc(100cqh * ${ar}))`, height: `min(100cqh, calc(100cqw / ${ar}))` })
const SOMBRA_CARD = 'rounded-[18px] shadow-[0_30px_70px_-12px_rgba(0,0,0,0.45),0_12px_24px_-8px_rgba(0,0,0,0.3)]'

/** Um vídeo do banco sincronizado com o tempo do plano (um trecho toca o original do início ao fim dele). */
function VideoNoTempo({ item, rel, tocando, topo }: { item: ItemBanco; rel: number; tocando: boolean; topo?: boolean }) {
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
  return <video ref={ref} src={exato ? urlBancoExportacao(item) : urlBancoArquivo(item.id) + versaoBanco(item)} muted playsInline preload="auto" className={cn('size-full object-cover', topo && 'object-top')} />
}

/** As mídias do insert do momento por cima do vídeo, com o enriquecimento: layout e entrada de cada mídia e, com 2
 *  mídias, como elas convivem (em sequência, empilhadas, em cascata, picture-in-picture, lado a lado). */
export default function InsertNoLugar(p: { pedido: PedidoNoTempo; banco: Map<string, ItemBanco>; tempo: number; tocando: boolean; fundo: string; padrao?: PadraoCurva }) {
  const { pedido, banco, tempo, tocando } = p
  const exportando = useContext(RelogioRender) != null // o contador "1/3" é só da prévia
  // por enquanto (decisão de Rodrigo, out/2026) o movimento fica parado e a saída é corte seco
  const e = { ...enriquecimentoDe(pedido), movimento: 'parado', saida: 'corte' }
  const n = pedido.midias.length
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  const rel = Math.max(tempo - pedido.t.inicio, 0)
  const caixa = pedido.formato === 'vertical' ? 'inset-0' : 'inset-x-0 top-0 h-1/2'
  if (!n) return <div className={cn('pointer-events-none absolute grid place-items-center bg-black/55 p-6 text-center text-[12px] text-cream/80', caixa)}>Insert sem mídia</div>

  // a mídia; `topo`: cortada, mostra a parte de cima (mídias em pé)
  const midia = (m: MidiaLigada, relM: number, topo?: boolean) => {
    const item = banco.get(m.banco)
    return item?.tipo === 'video' ? (
      <VideoNoTempo key={m.id} item={item} rel={relM} tocando={tocando} topo={topo} />
    ) : (
      <img key={m.id} src={urlBancoArquivo(m.banco)} alt="" className={cn('size-full object-cover', topo && 'object-top')} />
    )
  }
  /** A proporção da mídia (largura ÷ altura), pelo banco; sem as dimensões, 16:9. */
  const aspecto = (m: MidiaLigada) => {
    const i = banco.get(m.banco)
    return i?.largura && i?.altura ? i.largura / i.altura : 16 / 9
  }

  // a moldura de uma mídia sozinha (o layout do insert) com a entrada dela
  const emCard = ['card', 'card_metade', 'janela_3d', 'janela_3d_metade', 'inclinado', 'destaque'].includes(e.layout)
  const giroMoldura: React.CSSProperties =
    e.layout === 'janela_3d' || e.layout === 'janela_3d_metade'
      ? { transform: 'perspective(900px) rotateY(-14deg) rotateX(6deg)' }
      : e.layout === 'inclinado'
        ? { transform: 'rotate(-4deg) scale(0.94)' }
        : {}
  // `ar`: a mídia na proporção original, centrada no espaço da moldura (na sequência de 2 mídias)
  const naMoldura = (conteudo: ReactNode, animacao: React.CSSProperties, chave: string, ar?: number) => {
    const card = cn('overflow-hidden', emCard && (e.layout === 'card' || e.layout === 'card_metade' ? SOMBRA_CARD : 'rounded-[14px] shadow-[0_18px_40px_#0009] ring-1 ring-white/10'))
    return (
      <div
        key={chave}
        className={cn('absolute', !emCard ? 'inset-0' : e.layout === 'destaque' ? 'inset-[12%]' : e.layout === 'card_metade' ? 'inset-x-[6%] top-[9%] bottom-[7%]' : 'inset-[8%]')}
        style={ar ? { ...animacao, containerType: 'size' } : animacao}
      >
        {ar ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className={card} style={{ ...giroMoldura, ...naProporcao(ar) }}>
              {conteudo}
            </div>
          </div>
        ) : (
          <div className={cn('size-full', card)} style={giroMoldura}>
            {conteudo}
          </div>
        )}
      </div>
    )
  }

  let camadas: ReactNode
  let atras: ReactNode = null // o fundo desfocado do "destaque": a mídia que está na frente
  let comFundo = emCard
  if (n === 2) {
    // 2 mídias: a 2ª começa no corte; na sequência ela substitui a 1ª (que some no corte; pedido de Rodrigo, out/2026)
    const corte = corteDe(e, dur) * dur
    const relB = rel - corte
    const [a, b] = pedido.midias
    const animA = estiloDeEntradaESaida(e, rel, dur, p.padrao, 1)
    const animB = relB >= 0 ? estiloDeEntradaESaida(e, relB, dur - corte, p.padrao, 2) : null
    if (e.entre === 'sequencia') {
      camadas = (
        <>
          {rel < corte && naMoldura(midia(a, rel), animA, 'a', aspecto(a))}
          {animB && naMoldura(midia(b, relB), animB, 'b', aspecto(b))}
        </>
      )
      if (e.layout === 'destaque') atras = relB >= 0 ? midia(b, relB) : midia(a, rel)
    } else {
      const d = DUPLA[e.entre] ?? DUPLA.empilhadas
      // empilhadas: cada card na proporção da mídia (16:9, 4:3, 1:1…); mídia em pé preenche o espaço e mostra a parte de
      // cima. Lado a lado: as colunas são altas, a mídia preenche (em pé, também pela parte de cima)
      const cartao = (m: MidiaLigada, relM: number, pos: string, anim: React.CSSProperties) => {
        const ar = aspecto(m)
        const proporcao = e.entre === 'empilhadas' && ar >= EM_PE
        const conteudo = midia(m, relM, ar < EM_PE)
        return (
          <div key={m.id} className={cn('absolute', pos)} style={proporcao ? { ...anim, containerType: 'size' } : anim}>
            {proporcao ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className={cn('overflow-hidden', SOMBRA_CARD)} style={naProporcao(ar)}>
                  {conteudo}
                </div>
              </div>
            ) : (
              <div className={cn('size-full overflow-hidden', SOMBRA_CARD)}>{conteudo}</div>
            )}
          </div>
        )
      }
      camadas = (
        <>
          {cartao(a, rel, d.a, animA)}
          {animB && cartao(b, relB, d.b, animB)}
        </>
      )
      comFundo = true
    }
  } else {
    // 1 mídia, ou 3 ou mais (por enquanto em sequência, divididas igualmente; a entrada é a da 1ª)
    const parte = dur / n
    const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0)
    camadas = naMoldura(midia(pedido.midias[k], rel - k * parte), estiloDeEntradaESaida(e, rel, dur, p.padrao, 1), 'unica')
    if (e.layout === 'destaque') atras = midia(pedido.midias[k], rel - k * parte)
  }

  return (
    <div
      className={cn('pointer-events-none absolute overflow-hidden', caixa, !comFundo && 'bg-black')}
      style={e.layout === 'mesclada' ? { WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)', maskImage: 'linear-gradient(to bottom, black 62%, transparent)' } : undefined}
    >
      {comFundo && <Fundo id={p.fundo} />}
      {atras && <div className="absolute inset-0 scale-125 opacity-60 blur-2xl">{atras}</div>}
      {camadas}
      {n > 2 && !exportando && (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-cream">
          {Math.max(Math.min(Math.floor(rel / (dur / n)), n - 1), 0) + 1}/{n}
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
