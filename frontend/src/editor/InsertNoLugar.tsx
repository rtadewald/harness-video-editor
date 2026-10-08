import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { urlBancoArquivo, urlBancoExportacao, versaoBanco, type ItemBanco, type MidiaLigada, type PedidoInsert } from '@/api'
import { cn } from '@/lib/utils'
import { corteDe, enriquecimentoDe, entradaDe, saidaDe, type Qual } from './enriquecimento'
import Fundo, { RelogioRender } from './Fundo'
import CenaPreset from './CenaPreset'
import { mexendo, noFormato, serve, usePresets, type Preset } from './presets'
import { areaDoInsert, aspectosDe, divisaoDe, receitaParaInsert } from './divisao'
import { ajustesEfetivos, comAjustes } from './ajustes'
import { duracaoEntrada, duracaoSaida, estiloTransicao, type Transicoes } from './transicoes'

/** O insert desenhado por cima do ator, igual na prévia da etapa Inserts e na exportação (a página de render). */
export type PedidoNoTempo = PedidoInsert & { t: { inicio: number; fim: number } }

/** O tempo de cada mídia do insert: onde começa e quanto dura (s, desde o começo do insert). Na sequência de 2, a 1ª
 *  vai até o corte; nos layouts juntos, o insert todo; a 2ª, do corte ao fim. */
function tempos(x: PedidoNoTempo): { ini: number; dur: number; qual: Qual }[] {
  const e = enriquecimentoDe(x)
  const dur = Math.max(x.t.fim - x.t.inicio, 0.01)
  if (x.midias.length !== 2) return [{ ini: 0, dur, qual: 1 }]
  const corte = corteDe(e, dur) * dur
  return [
    { ini: 0, dur: e.entre === 'sequencia' ? corte : dur, qual: 1 },
    { ini: corte, dur: dur - corte, qual: 2 },
  ]
}

/** A chave do quadro quando o insert está parado no instante `rel` (s desde o começo): sem entrada nem saída andando (e
 *  sem o zoom contínuo). Quadros com a mesma chave são iguais — a exportação reaproveita a foto. Inclui quais mídias estão
 *  na tela (com 2, o insert fica parado antes e depois de a 2ª entrar). `null` = está mexendo. */
export function chaveParada(x: PedidoNoTempo, rel: number, t: Transicoes | null, presets: Preset[] | null): string | null {
  if (!t) return null
  const e = enriquecimentoDe(x)
  const pr = presetDe(x, presets)
  if (pr) return mexendo(pr.receita, rel, Math.max(x.t.fim - x.t.inicio, 0.01)) ? null : `${x.id}:p${pr.receita.cards.map((c) => (rel >= c.inicio_frac * (x.t.fim - x.t.inicio) ? 1 : 0)).join('')}`
  const naTela = tempos(x).filter(({ ini, dur }) => rel >= ini && rel - ini <= dur)
  const quieto = naTela.every(({ ini, dur, qual }) => {
    const r = rel - ini
    const ent = entradaDe(e, qual)
    return ent !== 'seco_zoom' && r >= duracaoEntrada(ent, t, dur) && r <= dur - duracaoSaida(saidaDe(e, qual), t, dur)
  })
  return quieto ? `${x.id}:${naTela.map((m) => m.qual).join('')}` : null
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
export function VideoNoTempo({ item, rel, tocando, topo }: { item: ItemBanco; rel: number; tocando: boolean; topo?: boolean }) {
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

/** As mídias do insert do momento por cima do vídeo, com o enriquecimento: layout, entrada e saída de cada mídia (a
 *  configuração de cada tipo é global, `trans`) e, com 2 mídias, como elas convivem (sequência, empilhadas, lado a lado). */
export default function InsertNoLugar(p: { pedido: PedidoNoTempo; banco: Map<string, ItemBanco>; tempo: number; tocando: boolean; fundo: string; trans: Transicoes | null }) {
  const { banco, tempo, tocando } = p
  const presets = usePresets()
  // a divisão da tela (pelo preset e pela proporção da mídia): a área do insert e o card na proporção da mídia
  const divisao = divisaoDe(p.pedido, banco, presets)
  const pedido = p.pedido
  const area = areaDoInsert(divisao)
  const exportando = useContext(RelogioRender) != null // o contador "1/3" é só da prévia
  const e = enriquecimentoDe(pedido)
  const preset = presetDe(pedido, presets)
  const ajEf = ajustesEfetivos(preset, pedido.enriquecimento?.ajustes, aspectosDe(pedido.midias, banco))
  // entrada e saída de uma mídia (sem a configuração carregada ainda, parada)
  const anim = (qual: Qual, relM: number, durM: number): React.CSSProperties =>
    p.trans ? estiloTransicao(entradaDe(e, qual), saidaDe(e, qual), p.trans, relM, durM) : {}
  const n = pedido.midias.length
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  const rel = Math.max(tempo - pedido.t.inicio, 0)
  if (!n) return <div className="pointer-events-none absolute grid place-items-center bg-black/55 p-6 text-center text-[12px] text-cream/80" style={area}>Insert sem mídia</div>

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

  // um preset manda em tudo: layout, entrada e saída de cada mídia, com as curvas medidas nas referências
  if (preset)
    return (
      <>
      {/* no "ator embaixo" o insert vai na tela toda: o fundo cobre também o espaço em volta da janela do ator */}
      {divisao?.modo === 'atras' && (
        <div className="pointer-events-none absolute inset-0">
          <Fundo id={p.fundo} />
        </div>
      )}
      <div className="pointer-events-none absolute" style={area}>
        <CenaPreset
          receita={comAjustes(receitaParaInsert(comAjustes(preset.receita, ajEf, 'antes'), divisao, aspectosDe(pedido.midias, banco), pedido.formato), ajEf, 'depois')}
          rel={rel}
          dur={dur}
          fundo={p.fundo}
          className="inset-0"
          semFundo={divisao?.modo === 'atras'}
          midia={(k, relM, topo) => pedido.midias[k] && midia(pedido.midias[k], relM, topo)}
        />
      </div>
      </>
    )

  let camadas: ReactNode
  let atras: ReactNode = null // o fundo desfocado do "destaque": a mídia que está na frente
  let comFundo = emCard
  if (n === 2) {
    // 2 mídias: a 2ª começa no corte; na sequência ela substitui a 1ª (que some no corte; pedido de Rodrigo, out/2026)
    const corte = corteDe(e, dur) * dur
    const relB = rel - corte
    const [a, b] = pedido.midias
    const animA = anim(1, rel, e.entre === 'sequencia' ? corte : dur)
    const animB = relB >= 0 ? anim(2, relB, dur - corte) : null
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
    // 1 mídia, ou 3 ou mais (por enquanto em sequência, divididas igualmente; a entrada e a saída são as da 1ª)
    const parte = dur / n
    const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0)
    camadas = naMoldura(midia(pedido.midias[k], rel - k * parte), anim(1, rel, dur), 'unica')
    if (e.layout === 'destaque') atras = midia(pedido.midias[k], rel - k * parte)
  }

  return (
    <>
    {/* no "ator embaixo" o insert vai na tela toda: o fundo cobre também o espaço em volta da janela do ator */}
    {divisao?.modo === 'atras' && (
      <div className="pointer-events-none absolute inset-0">
        <Fundo id={p.fundo} />
      </div>
    )}
    <div
      className={cn('pointer-events-none absolute overflow-hidden', !comFundo && 'bg-black')}
      style={{ ...area, ...(e.layout === 'mesclada' ? { WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)', maskImage: 'linear-gradient(to bottom, black 62%, transparent)' } : {}) }}
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
    </>
  )
}

/** O preset do insert, se ele tem um e o preset serve (mesmo formato e número de mídias). */
export function presetDe(x: { formato: string; midias: unknown[]; enriquecimento?: { preset?: string } }, presets: Preset[] | null): Preset | null {
  const id = x.enriquecimento?.preset
  const p = id ? presets?.find((y) => y.id === id) : null
  return p && serve(p, x.formato, x.midias.length) ? noFormato(p, x.formato, x.midias.length) : null
}

/** Os pedidos de insert no tempo do vídeo final (o do plano da direção; sem ele, o guardado no pedido), em ordem. */
export const pedidosNoTempo = (pedidos: PedidoInsert[], planos: { id: string; inicio: number; fim: number }[]): PedidoNoTempo[] => {
  const tempos = new Map(planos.map((i) => [i.id, { inicio: i.inicio, fim: i.fim }]))
  return pedidos.map((x) => ({ ...x, t: tempos.get(x.plano) ?? { inicio: x.inicio, fim: x.inicio + x.duracao } })).sort((a, b) => a.t.inicio - b.t.inicio)
}
