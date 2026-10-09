import { comRepouso, type CardReceita, type Movimento, type Preset, type Receita } from './presets'

/** Ajustes rápidos de um preset (SPEC §8.4): poucos controles de 3 opções, valendo só para o insert em que são escolhidos
 *  (o preset continua igual para os outros; "Salvar como padrão do preset" grava no preset). Cada preset tem o seu
 *  conjunto (`rapidos`, marcado na página Presets; sem marca, o que `padraoRapidos` deduz da receita). A opção marcada
 *  sem escolha é a que o preset já é (`padrao`; sem ela, a do meio). `fase`: "antes" mexe na receita original (tempos, zoom, câmera); "depois", na já ajustada à
 *  mídia (tamanho do card, quando o próximo entra). */
/** `opcoes`: 2 ou 3; `padrao`: a opção que o preset já é (sem ela, a do meio); `aplicar(r, i)`: a receita na opção i
 *  (só chamado quando i não é o padrão). */
export type Ajuste = {
  id: string
  nome: string
  opcoes: string[]
  fase: 'antes' | 'depois'
  padrao?: (r: Receita) => number
  aplicar: (r: Receita, i: number) => Receita
  /** As opções numa grade 3 × 3 de zonas da imagem (em vez de botões em linha). */
  grade?: boolean
}
export type Ajustes = Record<string, string>

const escalaTempo = <M extends CardReceita['entrada'] | CardReceita['saida']>(m: M, k: number): M =>
  m
    ? ({
        ...m,
        duracao: m.duracao * k,
        atraso: Object.fromEntries(Object.entries(m.atraso ?? {}).map(([p, v]) => [p, (v as number) * k])),
        dur: Object.fromEntries(Object.entries(m.dur ?? {}).map(([p, v]) => [p, (v as number) * k])),
      } as M)
    : m
const cards = (r: Receita, f: (c: CardReceita, k: number) => CardReceita): Receita => ({ ...r, cards: r.cards.map(f) })
const estado = (m: Movimento) => ('de' in m ? m.de : m.para)
const comEstado = <M extends Movimento>(m: M, e: Partial<ReturnType<typeof estado>>): M =>
  ('de' in m ? { ...m, de: { ...m.de, ...e } } : { ...m, para: { ...(m as { para: object }).para, ...e } }) as M
const cheio = (c: CardReceita) => c.repouso.w >= 99 && c.repouso.h >= 99
/** Um card desenhado maior que a área que desliza na horizontal (`divisao.deslizeTransbordando`). */
const deslizaTransbordando = (c: CardReceita) => c.repouso.w > 100 && Math.abs(c.saida?.para.dx ?? 0) >= 5 && (c.saida?.para.escala ?? 1) <= 1.05
const temZoom = (c: CardReceita) => !!c.zoom || (!!c.saida && estado(c.saida).escala > 1.05)

export const AJUSTES: Ajuste[] = [
  {
    id: 'entrada',
    nome: 'Entrada',
    opcoes: ['Lenta', 'Normal', 'Rápida'],
    fase: 'antes',
    aplicar: (r, i) => cards(r, (c) => ({ ...c, entrada: escalaTempo(c.entrada, i === 0 ? 1.4 : 0.7) })),
  },
  {
    id: 'saida',
    nome: 'Saída',
    opcoes: ['Lenta', 'Normal', 'Rápida'],
    fase: 'antes',
    aplicar: (r, i) => cards(r, (c) => ({ ...c, saida: escalaTempo(c.saida, i === 0 ? 1.4 : 0.7) })),
  },
  {
    // num card que transborda e desliza (o "Cresce e desliza"): até onde ele anda — pouco, como na referência, ou até a
    // outra borda do card chegar à borda da tela
    id: 'deslize',
    nome: 'Até onde desliza',
    opcoes: ['Pouco', 'Como na referência', 'Até a borda'],
    fase: 'antes',
    aplicar: (r, i) => cards(r, (c) => (deslizaTransbordando(c) ? { ...c, deslize: i === 0 ? 12 : 1000 } : c)),
  },
  {
    id: 'zoom',
    nome: 'Zoom',
    opcoes: ['Menos', 'Normal', 'Mais'],
    fase: 'antes',
    aplicar: (r, i) => {
      const k = i === 0 ? 0.6 : 1.5 // sobre o quanto o zoom aproxima (escala − 1)
      return cards(r, (c) => ({
        ...c,
        zoom: c.zoom ? { ...c.zoom, escala: 1 + (c.zoom.escala - 1) * k } : c.zoom,
        saida: c.saida && estado(c.saida).escala > 1.05 ? comEstado(c.saida, { escala: 1 + (estado(c.saida).escala - 1) * k }) : c.saida,
      }))
    },
  },
  {
    id: 'zona',
    nome: 'Mergulha em',
    opcoes: ['Topo à esquerda', 'Topo', 'Topo à direita', 'Esquerda', 'Centro', 'Direita', 'Base à esquerda', 'Base', 'Base à direita'],
    fase: 'depois', // depois de o card ganhar o tamanho da mídia: o ponto é sobre o card final,
    grade: true,
    // a zona para onde o zoom de saída (o mergulho) vai: o ponto da imagem que fica parado enquanto o card cresce
    padrao: (r) => {
      const c = r.cards.find((x) => x.saida && estado(x.saida).escala > 1.05)
      if (!c?.saida) return 4
      const e = estado(c.saida)
      const px = 0.5 - e.dx / ((e.escala - 1) * c.repouso.w)
      const py = 0.5 - e.dy / ((e.escala - 1) * c.repouso.h)
      const q = (v: number) => (v < 0.36 ? 0 : v > 0.64 ? 2 : 1)
      return q(py) * 3 + q(px)
    },
    aplicar: (r, i) => {
      const px = [0.2, 0.5, 0.8][i % 3]
      const py = [0.2, 0.5, 0.8][Math.floor(i / 3)]
      return cards(r, (c) => {
        if (!c.saida || estado(c.saida).escala <= 1.05) return c
        const s = estado(c.saida).escala
        return { ...c, saida: comEstado(c.saida, { dx: -(s - 1) * (px - 0.5) * c.repouso.w, dy: -(s - 1) * (py - 0.5) * c.repouso.h }) }
      })
    },
  },
  {
    id: 'forma',
    nome: 'Forma',
    opcoes: ['Card', 'Tela toda'],
    fase: 'antes',
    padrao: (r) => (r.cards.every(cheio) ? 1 : 0),
    // tela toda: a mídia ocupa a área (na tela cheia, só as em pé; ver receitaParaInsert); card: centrado, com cantos e sombra
    aplicar: (r, i) =>
      cards(r, (c) => comRepouso(c, i === 1 ? { cx: 50, cy: 50, w: 100, h: 100, raio: 0, sombra: false } : { cx: 50, cy: 50, w: 88, h: 70, raio: 2.2, sombra: true })),
  },
  {
    id: 'camera',
    nome: 'Zoom lento',
    opcoes: ['Parado', 'Leve', 'Mais'],
    fase: 'antes',
    padrao: (r) => (r.cards.some((c) => c.continuo && (c.continuo.escala || c.continuo.dx || c.continuo.dy)) ? 1 : 0),
    // um zoom in linear e contínuo, a partir do centro de cada card (a câmera da composição inteira)
    aplicar: (r, i) =>
      cards(r, (c) => {
        if (i === 0) return { ...c, continuo: null }
        const z = 0.015 * (i === 2 ? 2 : 1)
        return { ...c, continuo: { escala: z, dx: z * (c.repouso.cx - 50), dy: z * (c.repouso.cy - 50), rot: 0 } }
      }),
  },
  {
    id: 'desfoque',
    nome: 'Desfoque na entrada',
    opcoes: ['Sem', 'Normal', 'Mais'],
    fase: 'antes',
    aplicar: (r, i) => cards(r, (c) => ({ ...c, entrada: c.entrada ? comEstado(c.entrada, { desfoque: i === 0 ? 0 : Math.max(estado(c.entrada).desfoque * 1.8, 12) }) : c.entrada })),
  },
  {
    id: 'tamanho',
    nome: 'Tamanho do card',
    opcoes: ['Menor', 'Normal', 'Maior'],
    fase: 'depois',
    aplicar: (r, i) => {
      const k = i === 0 ? 0.86 : 1.12
      return cards(r, (c) => (c.repouso.w >= 99 && c.repouso.h >= 99 ? c : comRepouso(c, { w: c.repouso.w * k, h: c.repouso.h * k })))
    },
  },
  {
    id: 'som',
    nome: 'Som',
    opcoes: ['Sem', 'Baixo', 'Médio'],
    fase: 'antes',
    // os sons do preset (SPEC §8.6): neste insert, sem som, ou todos mais baixos ou mais altos
    padrao: (r) => {
      const ss = (r.sons ?? []).filter((s) => s.som)
      return !ss.length ? 0 : ss.every((s) => s.intensidade === 'medio') ? 2 : 1
    },
    aplicar: (r, i) => ({ ...r, sons: (r.sons ?? []).map((s) => (i === 0 ? { ...s, som: null } : { ...s, intensidade: i === 1 ? ('baixo' as const) : ('medio' as const) })) }),
  },
  {
    id: 'proximo',
    nome: 'Quando o próximo entra',
    opcoes: ['Antes', 'Normal', 'Depois'],
    fase: 'depois',
    // numa sequência, o anterior sai quando o próximo entra (termina na fração em que ele começa): a saída vai junto, para
    // não ficar um vão vazio (Depois) nem o próximo por cima do anterior parado (Antes)
    aplicar: (r, i) => {
      const k = i === 0 ? 0.75 : 1.25
      const novo = (j: number) => (j === 0 ? r.cards[0].inicio_frac : Math.min(r.cards[j].inicio_frac * k, 0.9))
      return cards(r, (c, j) => {
        const prox = r.cards[j + 1]
        // (nos tempos medidos na referência, o próximo entra junto com o fim do anterior, a menos de 2% do insert)
        const passa = prox && c.fim_frac != null && Math.abs(c.fim_frac - prox.inicio_frac) < 0.02
        return { ...c, inicio_frac: novo(j), ...(passa ? { fim_frac: novo(j + 1) } : {}) }
      })
    },
  },
]

/** O conjunto inicial de um preset, pelo que a receita tem (até 4): o que dá para sentir mexendo. */
function padraoRapidos(r: Receita): string[] {
  const cs = r.cards
  // a forma (card ou tela toda) cabe em todo preset de um card (ou que repete)
  const ids = [
    cs.some(deslizaTransbordando) && 'deslize',
    (cs.length === 1 || r.repete) && !cs.some((c) => c.quadros?.length) && 'forma',
    cs.some((c) => c.entrada) && 'entrada',
    cs.some(temZoom) && 'zoom',
    cs.some((c) => c.saida && estado(c.saida).escala > 1.05) && 'zona',
    (cs.length > 1 || r.repete) && 'proximo',
    cs.some((c) => c.saida) && 'saida',
    cs.some((c) => c.entrada && estado(c.entrada).desfoque > 2) && 'desfoque',
    'camera',
    cs.some((c) => !(c.repouso.w >= 99 && c.repouso.h >= 99)) && 'tamanho',
  ].filter(Boolean) as string[]
  return ids.slice(0, 4)
}

/** Os ajustes rápidos do preset (os marcados, ou os deduzidos) e, se ele tem som, o Som (sempre, no fim). */
export const rapidosDe = (p: Preset) => {
  const ids = (p.rapidos ?? padraoRapidos(p.receita)).filter((id) => id !== 'som')
  return p.receita.sons?.some((s) => s.som) ? [...ids, 'som'] : ids
}

/** Os ajustes do insert que continuam ao trocar para o preset `p`: os que aparecem no card dele (e os dois sliders, que
 *  todo preset tem); os outros cairiam escondidos, valendo sem controle para ver ou desfazer. Sem preset, nenhum. */
export function ajustesAoTrocar(p: Preset | null | undefined, a: Ajustes | undefined): Ajustes | null {
  if (!p || !a) return null
  const ids = new Set([...rapidosDe(p), 'y', 'largura'])
  const fica = Object.fromEntries(Object.entries(a).filter(([id]) => ids.has(id)))
  return Object.keys(fica).length ? fica : null
}

/** Os ajustes que valem de fato: os escolhidos e, sem forma escolhida, "Tela toda" quando o preset pede isso para
 *  mídias em pé e todas são 9:16. */
export function ajustesEfetivos(p: Preset | null | undefined, ajustes: Ajustes | undefined, aspectos: number[]): Ajustes | undefined {
  if (!p?.tela_toda_em_pe || ajustes?.forma || !aspectos.length || !aspectos.every((a) => a < 0.8)) return ajustes
  return { ...(ajustes ?? {}), forma: 'Tela toda' }
}

/** A receita com os ajustes do insert de uma fase. */
/** A opção que o preset já é (sem escolha no insert). */
export const padraoDe = (a: Ajuste, r: Receita) => (a.padrao ? a.padrao(r) : 1)

/** Os dois ajustes livres (sliders), depois da mídia: subir ou descer os cards (`y`, % da área) e a largura (`largura`,
 *  fator). Os que ocupam a área toda não mudam. */
function livres(r: Receita, ajustes: Ajustes): Receita {
  const y = Number(ajustes.y ?? 0)
  const k = Number(ajustes.largura ?? 1)
  if (!y && k === 1) return r
  return cards(r, (c) => (cheio(c) ? c : comRepouso(c, { cy: c.repouso.cy + y, w: c.repouso.w * k, h: c.repouso.h * k })))
}

export function comAjustes(r: Receita, ajustes: Ajustes | undefined, fase: 'antes' | 'depois'): Receita {
  if (!ajustes) return r
  if (fase === 'depois') r = livres(r, ajustes)
  return AJUSTES.filter((a) => a.fase === fase && ajustes[a.id] != null).reduce((rr, a) => {
    const i = a.opcoes.indexOf(ajustes[a.id])
    return i >= 0 && i !== padraoDe(a, rr) ? a.aplicar(rr, i) : rr
  }, r)
}
