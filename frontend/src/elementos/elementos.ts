/** Os elementos da direção desenhados no vídeo (docs/editor-claude.md, E5; antes só marcados no esboço da Direção): o
 *  texto grande do plano Full ator com lettering e os elementos Lettering, Palavra ManyChat, Caixinha de perguntas e
 *  Print sobreposto. Portado do 19 (`render/src/elementos.ts`): o estilo é o medido nos quadros das referências do
 *  criador; medidas em unidades do quadro (cqw/cqh), iguais na prévia e no MP4 (a exportação fotografa esta camada).
 *  Daqui saem as medidas, de onde vêm (`elementosDoVideo`), onde a legenda some (`intervalosDeLettering`) e os sons; o
 *  desenho fica em `ElementosNoPalco.tsx`. */
import type { ItemBanco } from '@/api'
import type { Rosto } from '@/ator/ator'
import { eventoNoTempo, type Catalogo, type EventoSom } from '@/editor/sons'
import { bezier } from '@/presets/curvas'

/** Onde o elemento cai: sobre o ator em tela cheia, sobre um insert ou motion na tela toda, na tela dividida (o insert
 *  em cima até `f`) ou no "ator embaixo" (a janela do ator a partir de `f`). */
export type Lugar = { modo: 'ator' | 'cheia' | 'metade' | 'atras'; f: number; rosto: Rosto | null }
export type Elemento = { id: string; tipo: string; inicio: number; fim: number; texto: string | null; banco: string | null; lugar: Lugar }

export const queixo = (l: Lugar) => (l.rosto ? l.rosto.cy + l.rosto.h / 2 : 0.45)
const olhos = (l: Lugar) => (l.rosto ? l.rosto.cy - 0.15 * l.rosto.h : 0.29)
export const FONTE = "'SF Pro Display', 'SF Pro', system-ui, sans-serif"
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace"
const W_H = 9 / 16
export const POP = { dur: 0.18, escala: 0.92, curva: bezier(0.16, 1, 0.3, 1) }
const MAIUSCULA = 0.7046
export const TAM = { grande: 5.75 / MAIUSCULA, insert: 4.5 / MAIUSCULA, manychat: 2.35 / MAIUSCULA }
export const SOMBRA_TEXTO = '0 0.03em 0.16em rgba(0,0,0,0.55), 0 0 0.04em rgba(0,0,0,0.25)'
export const DESFOQUE = { raio: 0.9, escurece: 0.22 }
export const BARRA = { w: 0.94, h: 0.076, y: 0.64, texto: 0.075 }
export const DIGITAR = { atraso: 0.1, letra: 0.07, max: 1, toque: 0.22 }
const SONS = { digitacao: ['typing-ios-01', 'Digitação'], pop: ['ui-pop-02', 'Pop'] } as const
export const AVIAO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" d="M3 11 22 2 13 21 11 13Z"/></svg>')}`
export const CAIXINHA = { w: 0.8, cabecalho: 1.9, pergunta: 2.9, pad: 2.2, padCab: 1.4, y: 0.32 }

// ---------------------------------------------------------------- medir texto

let ctx: CanvasRenderingContext2D | null = null
function emEm(texto: string, peso: number, familia = FONTE) {
  ctx ??= document.createElement('canvas').getContext('2d')!
  ctx.font = `${peso} 100px ${familia}`
  return ctx.measureText(texto).width / 100
}
export const caberEm = (texto: string, base: number, max: number, peso = 700) => Math.min(base, (max * 100 * W_H) / Math.max(emEm(texto, peso), 0.01))

/** Um lettering no tamanho `base`, encolhido para caber em 86% da largura; abaixo de 3/4 dele, em duas linhas. */
export function lettering(texto: string, base: number) {
  const um = caberEm(texto, base, 0.86)
  const ps = texto.trim().split(/\s+/)
  let melhor = { tam: um, texto }
  if (um >= 0.75 * base || ps.length < 2) return melhor
  for (let k = 1; k < ps.length; k++) {
    const a = ps.slice(0, k).join(' ')
    const b = ps.slice(k).join(' ')
    const tam = Math.min(caberEm(a, base, 0.86), caberEm(b, base, 0.86))
    if (tam > melhor.tam) melhor = { tam, texto: `${a}\n${b}` }
  }
  return melhor
}

function quebrar(texto: string, tam: number, largura: number, peso: number) {
  const cabe = (s: string) => emEm(s, peso) * tam <= largura * 100 * W_H
  const linhas: string[] = []
  for (const p of texto.trim().split(/\s+/)) {
    const u = linhas[linhas.length - 1]
    if (u != null && cabe(`${u} ${p}`)) linhas[linhas.length - 1] = `${u} ${p}`
    else linhas.push(p)
  }
  return linhas
}

// ---------------------------------------------------------------- onde cada um fica

export function medidasCaixinha(e: Elemento) {
  const linhas = quebrar(e.texto ?? '', CAIXINHA.pergunta, CAIXINHA.w - 0.1, 600)
  const h = (2 * CAIXINHA.padCab + CAIXINHA.cabecalho * 1.2 + 2 * CAIXINHA.pad + linhas.length * CAIXINHA.pergunta * 1.25) / 100
  const l = e.lugar
  const y = l.modo === 'metade' ? Math.max(l.f / 2, h / 2 + 0.03) : l.modo === 'ator' ? Math.min(CAIXINHA.y, Math.max(olhos(l) - 0.03 - h / 2, h / 2 + 0.05)) : CAIXINHA.y
  return { linhas, h, y }
}

export function medidasPrint(e: Elemento, item: ItemBanco | undefined) {
  let w = 0.5
  let h: number
  if (item) {
    const a = item.largura && item.altura ? item.largura / item.altura : 16 / 9
    h = (w * W_H) / a
    if (h > 0.3) {
      h = 0.3
      w = (h * a) / W_H
    }
  } else h = 0.055
  const { modo, f } = e.lugar
  const meio = modo === 'metade' ? f : modo === 'atras' ? Math.min(f, 0.72) - h / 2 - 0.02 : modo === 'ator' ? queixo(e.lugar) + 0.04 + h / 2 : 0.66
  return { w, h, y: Math.min(Math.max(meio, h / 2 + 0.03), 0.97 - h / 2) }
}

export const yBarra = (l: Lugar) => (l.modo === 'metade' ? l.f : BARRA.y)

export function digitacao(e: Elemento) {
  const n = [...(e.texto ?? '')].length
  return { ini: DIGITAR.atraso, dur: Math.max(Math.min(n * DIGITAR.letra, DIGITAR.max, (e.fim - e.inicio) / 2 - DIGITAR.atraso), 0.05), n }
}

/** Algum elemento ainda mexendo no instante (o pop, a digitação, o toque): a exportação não reaproveita a foto. */
export function elementosMexendo(elementos: Elemento[], t: number) {
  return elementos.some((e) => {
    if (!(e.inicio <= t && t < e.fim)) return false
    const rel = t - e.inicio
    const d = e.tipo === 'palavra_manychat' ? digitacao(e) : null
    return rel < (d ? d.ini + d.dur + DIGITAR.toque : POP.dur)
  })
}

// ---------------------------------------------------------------- de onde vêm, a legenda e os sons

type ItemNoTempo = { id: string; camada: 'plano' | 'elemento'; tipo: string; inicio: number; fim: number; texto: string | null; banco?: string | null }

/** Os elementos no tempo do vídeo final, a partir dos itens da direção já no tempo (`paraTempo`): os elementos e os
 *  planos Full ator com lettering. O lugar sai do plano por baixo; `divisaoDoPlano` diz se um plano de insert está no
 *  "ator embaixo" (e a altura da área do insert); `rostoEm`, o rosto do ator. */
export function elementosDoVideo(
  itens: ItemNoTempo[],
  rostoEm?: ((ini: number, fim: number) => Rosto | null) | null,
  divisaoDoPlano?: (plano: string) => { modo: string; f?: number } | null,
): Elemento[] {
  const planos = itens.filter((i) => i.camada === 'plano').sort((a, b) => a.inicio - b.inicio)
  const lugarDe = (ini: number, fim: number): Lugar => {
    const meio = (ini + fim) / 2
    const pl = planos.find((x) => x.inicio <= meio && meio < x.fim)
    if (!pl || pl.tipo.startsWith('full_ator')) return { modo: 'ator', f: 0, rosto: pl && rostoEm ? rostoEm(pl.inicio, pl.fim) : null }
    if (pl.tipo === 'insert_tela_cheia' || pl.tipo === 'motion_tela_cheia') return { modo: 'cheia', f: 0, rosto: null }
    const d = divisaoDoPlano?.(pl.id)
    if (d?.modo === 'atras') return { modo: 'atras', f: d.f ?? 0.72, rosto: null }
    return { modo: 'metade', f: d?.f ?? 0.5, rosto: null }
  }
  return itens
    .filter((i) => (i.camada === 'elemento' || i.tipo === 'full_ator_lettering') && i.fim > i.inicio)
    .map((i) => ({ id: i.id, tipo: i.tipo, inicio: i.inicio, fim: i.fim, texto: i.texto, banco: i.banco ?? null, lugar: lugarDe(i.inicio, i.fim) }))
}

/** Onde um lettering mostra a fala: a legenda dessas palavras some (nas referências as duas nunca aparecem juntas). */
export const intervalosDeLettering = (elementos: Elemento[]) =>
  elementos.filter((e) => (e.tipo === 'full_ator_lettering' || e.tipo === 'lettering') && e.texto).map((e) => ({ ini: e.inicio, fim: e.fim }))

/** Esconde os blocos da legenda que caem num lettering (mais da metade do bloco dentro dele), como o "Esconder" da etapa
 *  Legenda: lá eles aparecem escondidos; na prévia e no ASS, somem. */
export const semLettering = <B extends { ini: number; fim: number; oculto: boolean }>(blocos: B[], intervalos: { ini: number; fim: number }[]) =>
  intervalos.length
    ? blocos.map((b) => (intervalos.some((i) => Math.min(b.fim, i.fim) - Math.max(b.ini, i.ini) >= 0.5 * (b.fim - b.ini)) ? { ...b, oculto: true } : b))
    : blocos

/** Os sons dos elementos no tempo do vídeo final: a digitação no ManyChat e o pop da caixinha e do print. */
export function sonsDosElementos(elementos: Elemento[], cat: Catalogo | null): EventoSom[] {
  if (!cat) return []
  const som = ([id, familia]: readonly [string, string]) => (cat.sons.find((s) => s.id === id) ?? cat.sons.find((s) => s.familia === familia))?.id ?? null
  return elementos.flatMap((e) => {
    if (e.tipo === 'palavra_manychat' && e.texto) {
      const d = digitacao(e)
      const ev = eventoNoTempo({ som: som(SONS.digitacao), intensidade: 'baixo', atraso: 0 }, e.inicio + d.ini, cat, +d.dur.toFixed(3))
      return ev ? [ev] : []
    }
    if (e.tipo === 'caixinha_perguntas' || (e.tipo === 'print_sobreposto' && (e.banco || e.texto))) {
      const ev = eventoNoTempo({ som: som(SONS.pop), intensidade: 'baixo', atraso: 0 }, e.inicio, cat)
      return ev ? [ev] : []
    }
    return []
  })
}
