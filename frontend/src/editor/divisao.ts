import type { ItemBanco } from '@/api'
import type { Preset, Receita } from './presets'
import { ajustesEfetivos } from './ajustes'

/** A divisão da tela num insert de tela dividida (SPEC §8.4), automática: o tipo vem do preset escolhido e as medidas,
 *  da proporção da 1ª mídia.
 *  - `area`: a mídia de ponta a ponta em cima, com a altura dela na largura toda (1:1 → 56%, 4:3 → 42%, 16:9 → 32%);
 *  - `card`: um card com a proporção da mídia (até 90% da largura), e a parte de cima com a altura dele mais margens;
 *  - `atras`: o insert na tela toda e o ator encolhido numa janela embaixo; o card fica no espaço livre acima dela.
 *  `f`: a fração do quadro que o insert ocupa em cima; `card`: o card em % da área do insert (centrado). */
export type TipoDivisao = 'area' | 'card' | 'atras'
export type Divisao = { modo: 'metade' | 'atras'; tipo: TipoDivisao; f: number; card?: { w: number; h: number } }

/** A janela do ator no "insert atrás": o ator encolhido a `escala`, apoiado embaixo e centrado; a janela começa em `y0`
 *  (% do quadro) e tem cantos redondos (`raio`, % da largura do ator encolhido). Igual em exportacao.py. */
export const JANELA = { escala: 0.55, y0: 72, raio: 7 }
/** Onde fica o alto da cabeça do ator no "ator embaixo" (% do quadro): o ator encolhido começa em 100 − 55 = 45%, e a
 *  cabeça costuma estar a ~10% do topo do quadro dele. */
const TOPO_CABECA = 100 - JANELA.escala * 100 + JANELA.escala * 10
const MARGEM = 0.06 // em cima e embaixo do card, em fração do quadro
const W_H = 9 / 16 // largura ÷ altura do quadro

/** Alguma mídia pode ocupar a área toda sem ser cortada? Na tela dividida, as horizontais (a área é larga); na tela
 *  cheia e no "ator embaixo", as em pé (9:16). Decidido mídia a mídia (receitaParaInsert): as que seriam cortadas ficam
 *  em card, as outras ocupam a área. */
export const telaTodaPermitida = (formato: string, atras: boolean, aspectos: number[]) =>
  formato === 'dividida' && !atras ? aspectos.some((a) => a >= 0.8) : aspectos.some((a) => a < 0.8)

/** O tipo de divisão do preset: o marcado nele ou, sem marca, "área" se o card ocupa a área toda, senão "card". */
export const tipoDoPreset = (p: Preset | null | undefined): TipoDivisao =>
  p?.divisao_tipo ?? (p && p.receita.cards.every((c) => c.repouso.w >= 99 && c.repouso.h >= 99) ? 'area' : 'card')

export function divisaoDe(
  x: { formato: string; midias: { banco: string }[]; enriquecimento?: { preset?: string | null; divisao?: string | null } },
  banco?: Map<string, ItemBanco> | null,
  presets?: Preset[] | null,
): Divisao | null {
  if (x.formato !== 'dividida') return null
  const preset = x.enriquecimento?.preset ? presets?.find((p) => p.id === x.enriquecimento?.preset) : null
  // "ator embaixo" pode ser ligado no próprio insert, por cima do tipo do preset
  // a forma escolhida no insert (ajuste rápido) manda: "tela toda" ocupa a área, "card" é card
  const forma = ajustesEfetivos(preset, (x.enriquecimento as { ajustes?: Record<string, string> } | undefined)?.ajustes, aspectosDe(x.midias, banco))?.forma
  const atras = x.enriquecimento?.divisao === 'atras'
  const aspectos = aspectosDe(x.midias, banco)
  let base: TipoDivisao = forma === 'Tela toda' ? 'area' : forma === 'Card' ? 'card' : preset ? tipoDoPreset(preset) : 'card'
  // ocupar a área só quando a mídia cabe sem cortar: na tela dividida, as horizontais; no "ator embaixo", as em pé
  if (base === 'area' && !telaTodaPermitida('dividida', atras, aspectos)) base = 'card'
  const tipo = atras ? 'atras' : base
  // ator embaixo com um preset que ocupa a área: a mídia ocupa a tela toda, atrás da janela do ator
  if (tipo === 'atras' && base === 'area') return { modo: 'atras', tipo, f: 1 }
  const i = x.midias[0] && banco?.get(x.midias[0].banco)
  const a = i?.largura && i?.altura ? i.largura / i.altura : 16 / 9 // largura ÷ altura da mídia
  // vários cards (empilhados, em sequência, mosaico): a área fica fixa e cada card se ajusta à sua mídia (receitaParaInsert)
  const varios = !!preset && (preset.receita.repete || preset.receita.cards.length > 1)
  if (varios && tipo !== 'area') return { modo: tipo === 'atras' ? 'atras' : 'metade', tipo, f: tipo === 'atras' ? JANELA.y0 / 100 : 0.56 }
  if (tipo === 'area') return { modo: 'metade', tipo, f: a < 1 ? 0.5 : Math.min(Math.max(W_H / a, 0.28), 0.5625) }
  const livre = tipo === 'atras' ? JANELA.y0 / 100 : 0.62 // a altura máxima da área do insert
  let cw = 0.9 // largura do card, fração do quadro
  let ch = (cw * W_H) / a // altura do card, fração do quadro
  if (ch > livre - 2 * MARGEM) {
    ch = livre - 2 * MARGEM
    cw = (ch * a) / W_H
  }
  const f = tipo === 'atras' ? livre : Math.min(Math.max(ch + 2 * MARGEM, 0.4), livre)
  return { modo: tipo === 'atras' ? 'atras' : 'metade', tipo, f, card: { w: cw * 100, h: (ch / f) * 100 } }
}

/** A receita pronta para o insert: cada card na proporção da sua mídia (`aspectos`, largura ÷ altura, por mídia).
 *  - um card só, com a divisão calculada (`d.card`): o card da divisão, centrado;
 *  - cards que ocupam a área toda: preenchem a área presos no topo (uma tela em pé nunca perde o topo), e a câmera lenta
 *    cresce a partir do canto superior esquerdo;
 *  - os outros: o card fica no lugar e no tamanho do preset, mas com a proporção da mídia, cabendo na caixa dele (e na
 *    área). Os guiados por cantos medidos ficam como estão. */
export function receitaParaInsert(r: Receita, d: Divisao | null, aspectos: number[], formato: string): Receita {
  const areaAsp = formato === 'dividida' ? W_H / (d?.f ?? 0.5) : W_H // largura ÷ altura da área do insert
  const cards = r.cards.map((c, k) => {
    if (c.quadros?.length) return c
    const cheio = c.repouso.w >= 99 && c.repouso.h >= 99
    const a0 = aspectos[c.midia ?? k] ?? aspectos[0]
    // na tela cheia, ocupar a tela só se a mídia é em pé (9:16); 1:1, 4:3, 16:9 viram um card centrado (90% da largura)
    // ocupando a área, só se a mídia cabe sem cortar (telaTodaPermitida); senão, um card centrado na proporção dela
    const cabe = a0 ? (formato === 'dividida' && d?.modo !== 'atras' ? a0 >= 0.8 : a0 < 0.8) : true
    if (cheio && !cabe && a0) {
      let w = 90
      let h = (w * areaAsp) / a0
      if (h > 90) {
        h = 90
        w = (h * a0) / areaAsp
      }
      return { ...c, repouso: { ...c.repouso, cx: 50, cy: 50, w, h, raio: c.repouso.raio || 2.2, sombra: true }, ajuste: 'cover' as const }
    }
    if (cheio) {
      const z = c.continuo
      // o zoom contínuo cresce a partir do centro na horizontal; na vertical, preso pelo topo (a parte de cima da mídia em
      // pé continua à vista), a não ser que a receita tenha a própria deriva vertical (uma rolagem, por exemplo)
      const continuo = z ? { ...z, dy: z.dy || (z.escala * 100) / 2 } : z
      return { ...c, repouso: { ...c.repouso, cx: 50, cy: 50, w: 100, h: 100 }, ajuste: 'topo' as const, continuo }
    }
    if (d?.card && r.cards.length === 1) return { ...c, repouso: { ...c.repouso, cx: 50, cy: 50, w: d.card.w, h: d.card.h }, ajuste: 'cover' as const }
    const a = aspectos[c.midia ?? k] ?? aspectos[0]
    if (!a) return c
    // a caixa do preset, sem passar de 96% da área
    // mídia em pé num card largo: a caixa cresce na altura (até 84% da área), para a mídia não ficar pequena
    const emPe = a < 0.9 && c.repouso.w > c.repouso.h
    // no "ator embaixo", o espaço acima da janela é largo e baixo: o card vai quase até as bordas e um pouco acima do meio
    const atras = d?.modo === 'atras'
    const bw = atras ? 96 : Math.min(c.repouso.w, 96)
    const bh = emPe ? Math.max(Math.min(c.repouso.h, 96), 84) : Math.min(c.repouso.h, 96)
    let w = bw
    let h = (w * areaAsp) / a
    if (h > bh) {
      h = bh
      w = (h * a) / areaAsp
    }
    // a caixa maior continua dentro da área
    // em pé, o card é alto: fica centrado na área (no "ator embaixo" também), e a deriva vertical (o "flutuar") encolhe
    // na proporção da folga que sobrou, para ele não correr para fora do topo
    // com vários cards, o que encolhe na altura fica preso pela borda virada para o meio da área: o vão entre eles continua
    // o do desenho (em vez de crescer)
    const junto = r.cards.length > 1 ? Math.sign(50 - c.repouso.cy) * Math.max(0, c.repouso.h - h) / 2 : 0
    const cy = emPe ? 50 : atras ? Math.max(h / 2 + 3, 44) : c.repouso.cy + junto
    const folga = emPe ? Math.max(0, 98 - h) / Math.max(1, 98 - Math.min(c.repouso.h, 96)) : 1
    const continuo = c.continuo && folga < 1 ? { ...c.continuo, dy: c.continuo.dy * folga } : c.continuo
    // um card desenhado maior que a área (passando da borda) e que encolheu para caber a mídia: fica preso pela borda
    // esquerda do original (o lado que aparecia), em vez de ficar no centro antigo e deixar um vão à esquerda
    const cx = atras || emPe ? 50 : c.repouso.w > 96 ? Math.max(c.repouso.cx - c.repouso.w / 2, 2) + w / 2 : c.repouso.cx
    return { ...c, repouso: { ...c.repouso, w, h, cy, cx }, continuo, ajuste: 'cover' as const }
  })
  return { ...r, cards }
}

/** As proporções (largura ÷ altura) das mídias do insert, pelo banco; sem as dimensões, 16:9. */
export const aspectosDe = (midias: { banco: string }[], banco?: Map<string, ItemBanco> | null) =>
  midias.map((m) => {
    const i = banco?.get(m.banco)
    return i?.largura && i?.altura ? i.largura / i.altura : 16 / 9
  })

/** O formato em que o insert é desenhado: a área do insert é sempre a de cima (no "insert atrás", acima da janela). */
export const formatoDoInsert = (x: { formato: string }) => x.formato

/** A área do insert no quadro (estilo CSS em %). */
export const areaDoInsert = (d: Divisao | null): React.CSSProperties => (!d ? { inset: 0 } : { left: 0, right: 0, top: 0, height: `${d.f * 100}%` })

/** Onde a caixinha do comentário fica sozinha (centro, % do quadro): na costura do insert com o ator. */
export function posicaoDoComentario(d: Divisao | null): { x: number; y: number } {
  if (!d) return { x: 50, y: 50 }
  // no "ator embaixo", na borda de baixo do card (na costura, cobriria o rosto que sai da janela); senão, na costura
  // no "ator embaixo", acima da cabeça (que sai da janela), ou na borda de baixo do card se ela estiver mais acima
  if (d.modo === 'atras') return { x: 50, y: Math.min(TOPO_CABECA - 6, d.card ? (d.f / 2 + (d.card.h / 100) * (d.f / 2)) * 100 : 100) }
  return { x: 50, y: d.f * 100 }
}

const topoDaJanela = () => ((JANELA.y0 - (100 - JANELA.escala * 100)) / (JANELA.escala * 100)) * 100 // em % do ator encolhido

/** Como o vídeo do ator fica (transform e recorte no próprio elemento, que ocupa o quadro todo). */
export function estiloDoAtor(d: Divisao | null): React.CSSProperties {
  if (!d) return {}
  if (d.modo === 'metade') return { transform: `translateY(${(d.f / 2) * 100}%)` }
  return {
    transform: `scale(${JANELA.escala})`,
    transformOrigin: '50% 100%',
    clipPath: `inset(${topoDaJanela()}% 0 0 0 round ${JANELA.raio}% / ${(JANELA.raio * 9) / 16}%)`, // cantos redondos (o raio em % da largura)
  }
}

/** O recorte da pessoa por cima do insert (cabeça e ombros saindo da janela): só no "ator embaixo", que é quando se pede. */
export function estiloDaPessoa(d: Divisao | null): React.CSSProperties | null {
  if (d?.modo !== 'atras') return null
  return { transform: `scale(${JANELA.escala})`, transformOrigin: '50% 100%', clipPath: `inset(0 0 ${100 - topoDaJanela()}% 0)` }
}
