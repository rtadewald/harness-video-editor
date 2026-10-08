import { enviar, json } from '@/api'
import { bezier, limite01 } from './curvas'
import { criarLoja } from './loja'
import type { Curva } from './enriquecimento'

/** Presets de enriquecimento (SPEC §8.4): a receita de como as mídias de um insert aparecem, medida nas referências
 *  favoritas. Espelha `presets.py`. Posições e deslocamentos em % da área do insert (a tela toda ou a metade de cima). */
export type Propriedade = 'pos' | 'escala' | 'rot' | 'opacidade' | 'desfoque'
/** `altura`: a altura do card em relação à de repouso, sem deformar a mídia (uma janela que abre na vertical e revela
 *  mais conteúdo); segue a curva da escala. */
export type Estado = { dx: number; dy: number; escala: number; altura?: number; rot: number; rx: number; ry: number; opacidade: number; desfoque: number }
export type Movimento = {
  duracao: number
  curvas: Partial<Record<Propriedade, Curva>>
  atraso: Partial<Record<Propriedade, number>>
  dur: Partial<Record<Propriedade, number>>
} & ({ de: Estado } | { para: Estado })
/** `desfoque`: desfoque permanente, em px a 1080 (um fundo feito da própria mídia). */
export type Repouso = { cx: number; cy: number; w: number; h: number; rot: number; rx: number; ry: number; raio: number; sombra: boolean; z: number; desfoque?: number }
export type CardReceita = {
  inicio_frac: number
  sai_antes_do_fim: number
  repouso: Repouso
  entrada: (Movimento & { de: Estado }) | null
  saida: (Movimento & { para: Estado }) | null
  ajuste: 'cover' | 'contain' | 'topo'
  /** Qual mídia do insert este card mostra (padrão: a de mesmo número). Vários cards podem mostrar a mesma, para um
   *  mosaico com mais janelas do que mídias. */
  midia?: number
  /** Movimento lento contínuo enquanto o card está na tela (um zoom de câmera): escala em fração por segundo (0,03 =
   *  cresce 3% por segundo), deslocamento em % da área por segundo e giro em graus por segundo. Conta desde que o card
   *  aparece. */
  continuo?: Continuo | null
  /** Termina nesta fração do insert (uma tomada que acaba no corte), em vez de `sai_antes_do_fim`. */
  fim_frac?: number
  zoom?: ZoomMidia | null
  /** O card pelos 4 cantos ao longo da vida dele (medidos na referência): `f` = fração da vida do card (0 → 1), `q` =
   *  cantos sup-esq, sup-dir, inf-dir, inf-esq em % da área. Entre as chaves, uma curva suave (Catmull-Rom). Manda na
   *  posição: um movimento de câmera qualquer (torções em 3D, zooms), como na referência. */
  quadros?: { f: number; q: [number, number][] }[]
}
/** Zoom no conteúdo do card (a moldura fica igual): começa `inicio` s depois de o card aparecer, dura `duracao` s e
 *  chega a `escala`, ancorado em (`ox`, `oy`) % da mídia. */
export type ZoomMidia = { inicio: number; duracao: number; escala: number; ox: number; oy: number; curva: Curva }
export type Continuo = { escala: number; dx: number; dy: number; rot?: number }
/** `repete`: serve a qualquer número de mídias (2 ou mais): o último card é o molde da 2ª mídia em diante, cada uma
 *  numa parte igual do insert (ver `paraMidias`). */
export type Receita = { formato: 'vertical' | 'dividida'; fundo: 'proprio' | 'nenhum'; duracao_ref: number; cards: CardReceita[]; repete?: boolean }
export type Preset = {
  id: string
  nome: string
  /** O efeito em palavras (presets feitos à mão). */
  descricao?: string
  /** O recorte da mídia de cada card na referência (a revisão mostra uma mídia por recorte). */
  recortes?: { t: number; quad?: [number, number][]; arquivo?: string }[]
  /** Onde aparece: um formato só ou os dois (sem o campo, os dois; no outro formato, adaptado). */
  formatos?: ('vertical' | 'dividida')[]
  formato: 'vertical' | 'dividida'
  receita: Receita
  fontes: { ref: string; inicio: number; fim: number }[]
  aprovado: boolean
}

// a biblioteca vem do servidor uma vez e é compartilhada; mudar avisa quem está usando
const loja = criarLoja(() => fetch('/api/presets').then(json<Preset[]>))
export const usePresets = loja.use

export async function editarPreset(id: string, campos: Partial<{ nome: string; aprovado: boolean; receita: Receita; formato: 'vertical' | 'dividida'; formatos: ('vertical' | 'dividida')[] }>) {
  const p = await enviar<Preset>('PATCH', `/api/presets/${id}`, { campos })
  loja.definir((loja.get() ?? []).map((x) => (x.id === id ? p : x)))
  return p
}

/** Muda na tela na hora (arrastando um slider), sem salvar: o servidor recebe ao soltar. */
export function previaPreset(id: string, receita: Receita) {
  const l = loja.get()
  if (l) loja.definir(l.map((x) => (x.id === id ? { ...x, receita } : x)))
}

export async function apagarPreset(id: string) {
  await enviar<{ ok: boolean }>('DELETE', `/api/presets/${id}`)
  loja.definir((loja.get() ?? []).filter((x) => x.id !== id))
}

/** Os nomes das propriedades animadas (o editor e a revisão). */
export const NOME_PROP: Record<Propriedade, string> = { pos: 'Posição', escala: 'Escala', rot: 'Giro', opacidade: 'Opacidade', desfoque: 'Desfoque' }

const limite = limite01
const NEUTRO: Estado = { dx: 0, dy: 0, escala: 1, altura: 1, rot: 0, rx: 0, ry: 0, opacidade: 1, desfoque: 0 }

/** O tempo de cada card num insert de `dur` s: começa em `inicio_frac` da duração e termina `sai_antes_do_fim` antes do fim. */
export function janela(c: CardReceita, dur: number) {
  const ini = c.inicio_frac * dur
  const fim = Math.max(c.fim_frac != null ? c.fim_frac * dur : dur - c.sai_antes_do_fim, ini + 0.05)
  return { ini, fim }
}

// o progresso (0 → 1, a curva pode passar do ponto) de uma propriedade num movimento, `t` s depois de ele começar
function progresso(m: Movimento, k: Propriedade, t: number) {
  const atraso = m.atraso?.[k] ?? 0
  const d = m.dur?.[k] ?? m.duracao - atraso
  const curva = m.curvas[k] ?? m.curvas.pos ?? ([0.16, 1, 0.3, 1] as Curva)
  return bezier(...curva)(limite((t - atraso) / Math.max(d, 0.01)))
}
const mistura = (a: number, b: number, p: number) => a + (b - a) * p

/** O estado do card no instante `rel` (s desde o começo do insert): o repouso, ou no meio da entrada ou da saída; `null`
 *  = fora da tela. */
export function estadoCard(c: CardReceita, rel: number, dur: number): Estado | null {
  const { ini, fim } = janela(c, dur)
  if (rel < ini || rel > fim) return null
  let e: Estado = { ...NEUTRO }
  if (c.entrada && rel < ini + c.entrada.duracao) {
    const t = rel - ini
    const de = c.entrada.de
    const pp = progresso(c.entrada, 'pos', t)
    const pr = progresso(c.entrada, 'rot', t)
    e = {
      dx: mistura(de.dx, 0, pp),
      dy: mistura(de.dy, 0, pp),
      escala: mistura(de.escala, 1, progresso(c.entrada, 'escala', t)),
      altura: mistura(de.altura ?? 1, 1, progresso(c.entrada, 'escala', t)),
      rot: mistura(de.rot, 0, pr),
      rx: mistura(de.rx, 0, pr),
      ry: mistura(de.ry, 0, pr),
      opacidade: limite(mistura(de.opacidade, 1, progresso(c.entrada, 'opacidade', t))),
      desfoque: Math.max(0, mistura(de.desfoque, 0, progresso(c.entrada, 'desfoque', t))),
    }
  }
  if (c.saida && rel > fim - c.saida.duracao) {
    const t = rel - (fim - c.saida.duracao)
    const pa = c.saida.para
    const pp = progresso(c.saida, 'pos', t)
    const pr = progresso(c.saida, 'rot', t)
    e = {
      dx: e.dx + mistura(0, pa.dx, pp),
      dy: e.dy + mistura(0, pa.dy, pp),
      escala: e.escala * mistura(1, pa.escala, progresso(c.saida, 'escala', t)),
      altura: (e.altura ?? 1) * mistura(1, pa.altura ?? 1, progresso(c.saida, 'escala', t)),
      rot: e.rot + mistura(0, pa.rot, pr),
      rx: e.rx + mistura(0, pa.rx, pr),
      ry: e.ry + mistura(0, pa.ry, pr),
      opacidade: e.opacidade * limite(mistura(1, pa.opacidade, progresso(c.saida, 'opacidade', t))),
      desfoque: e.desfoque + Math.max(0, mistura(0, pa.desfoque, progresso(c.saida, 'desfoque', t))),
    }
  }
  const z = c.continuo
  if (z) {
    const t = rel - ini
    e = { ...e, escala: e.escala * Math.pow(1 + z.escala, t), dx: e.dx + z.dx * t, dy: e.dy + z.dy * t, rot: e.rot + (z.rot ?? 0) * t }
  }
  return e
}

const temContinuo = (c: CardReceita) => !!c.continuo && (c.continuo.escala !== 0 || c.continuo.dx !== 0 || c.continuo.dy !== 0 || !!c.continuo.rot)

/** A escala do conteúdo do card no instante `rel` (1 = sem zoom). */
export function zoomMidia(c: CardReceita, rel: number, dur: number) {
  const z = c.zoom
  if (!z) return 1
  const t = rel - janela(c, dur).ini - z.inicio
  return mistura(1, z.escala, bezier(...z.curva)(limite(t / Math.max(z.duracao, 0.01))))
}

/** Os cantos do card (em % da área) na fração `f` da vida dele, entre as chaves medidas. */
export function cantosNoTempo(qs: NonNullable<CardReceita['quadros']>, f: number): [number, number][] {
  if (qs.length === 1 || f <= qs[0].f) return qs[0].q
  if (f >= qs[qs.length - 1].f) return qs[qs.length - 1].q
  let i = 0
  while (qs[i + 1].f < f) i++
  const a = qs[Math.max(i - 1, 0)], b = qs[i], c = qs[i + 1], d = qs[Math.min(i + 2, qs.length - 1)]
  const t = (f - b.f) / Math.max(c.f - b.f, 1e-6)
  const cr = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  return b.q.map((_, k) => [cr(a.q[k][0], b.q[k][0], c.q[k][0], d.q[k][0]), cr(a.q[k][1], b.q[k][1], c.q[k][1], d.q[k][1])] as [number, number])
}

/** A matrix3d do CSS que leva o retângulo (0,0)–(w,h) px para os 4 cantos `q` (px): uma homografia. */
export function matrizDosCantos(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  // homografia do quadrado unitário para o quadrilátero
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0
  // do retângulo w×h para o unitário: dividir x por w e y por h
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1]
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`
}

/** Algum card está se mexendo no instante `rel`? (a exportação reaproveita a foto dos quadros parados) */
export function mexendo(r: Receita, rel: number, dur: number) {
  return r.cards.some((c) => {
    const { ini, fim } = janela(c, dur)
    const z = c.zoom
    return (!!c.quadros && rel >= ini && rel <= fim) || (temContinuo(c) && rel >= ini && rel <= fim) || (z && rel >= ini + z.inicio && rel < ini + z.inicio + z.duracao) || (c.entrada && rel >= ini && rel < ini + c.entrada.duracao) || (c.saida && rel > fim - c.saida.duracao && rel <= fim)
  })
}

/** O preset serve a um insert: mesmo formato e mesmo número de mídias. */
/** Quantas mídias a receita pede (os cards podem repetir mídias). */
export const nMidias = (r: Receita) => Math.max(...r.cards.map((c, k) => (c.midia ?? k) + 1))
/** A receita para `n` mídias. Numa receita que repete, os cards fixos ficam e o último (o molde) vira um card por mídia
 *  restante: a mídia k entra em k/n do insert e, se o molde termina antes do fim (uma sequência), sai em (k+1)/n. */
export function paraMidias(r: Receita, n: number): Receita {
  if (!r.repete || n < 1) return r
  const fixos = r.cards.slice(0, -1)
  const molde = r.cards[r.cards.length - 1]
  const seq = molde.fim_frac != null && molde.fim_frac < 1
  const cards = [...fixos]
  for (let k = fixos.length; k < n; k++)
    cards.push({
      ...molde,
      midia: k,
      inicio_frac: k === 0 ? molde.inicio_frac : k / n,
      fim_frac: seq ? (k + 1) / n : molde.fim_frac,
      repouso: { ...molde.repouso, z: molde.repouso.z + k },
    })
  if (seq && fixos.length) fixos.forEach((c, k) => (cards[k] = { ...c, fim_frac: (k + 1) / n }))
  return { ...r, cards: n < fixos.length ? cards.slice(0, n) : cards }
}
/** O preset serve a um insert: o mesmo número de mídias e um dos formatos marcados (no outro formato, a receita se
 *  adapta: ver `paraFormato`). */
export const serve = (p: Preset, formato: string, n: number) =>
  (p.receita.repete ? n >= 2 : nMidias(p.receita) === n) && (!p.formatos || (p.formatos as string[]).includes(formato))

/** A receita levada para o outro formato. A metade de cima da tela dividida é a faixa central da tela cheia, na mesma
 *  largura: de tela cheia para dividida, o que está no meio da tela continua no meio e as alturas dobram (o que passa
 *  da área fica cortado); de dividida para tela cheia, os cards vão para a faixa do meio com metade da altura. */
export function paraFormato(r: Receita, formato: Receita['formato']): Receita {
  if (r.formato === formato) return r
  const k = formato === 'dividida' ? 2 : 0.5 // quanto as medidas verticais (em % da área) mudam
  const y = (v: number) => (formato === 'dividida' ? (v - 25) * 2 : v / 2 + 25)
  const mov = <M extends CardReceita['entrada'] | CardReceita['saida']>(m: M): M => {
    if (!m) return m
    const chave = 'de' in m ? 'de' : 'para'
    const e = (m as unknown as Record<string, Estado>)[chave]
    return { ...m, [chave]: { ...e, dy: e.dy * k } }
  }
  return {
    ...r,
    formato,
    cards: r.cards.map((c) => ({
      ...c,
      repouso: { ...c.repouso, cy: y(c.repouso.cy), h: c.repouso.h * k },
      entrada: mov(c.entrada),
      saida: mov(c.saida),
      continuo: c.continuo ? { ...c.continuo, dy: c.continuo.dy * k } : c.continuo,
    })),
  }
}

/** O preset pronto para um insert do formato dado: a receita adaptada se o preset é do outro formato. */
export const noFormato = (p: Preset, formato: string, n?: number): Preset & { adaptado?: boolean } => {
  const q = n && p.receita.repete ? { ...p, receita: paraMidias(p.receita, n) } : p
  return q.formato === formato || (formato !== 'vertical' && formato !== 'dividida') ? q : { ...q, receita: paraFormato(q.receita, formato), adaptado: true }
}
/** Os presets que servem a um insert (por padrão, só os aprovados), já no formato dele: os do mesmo formato primeiro. */
export const presetsPara = (l: Preset[] | null, formato: string, n: number, soAprovados = true) =>
  (l ?? [])
    .filter((p) => serve(p, formato, n) && (!soAprovados || p.aprovado))
    .sort((a, b) => Number(a.formato !== formato) - Number(b.formato !== formato))
    .map((p) => noFormato(p, formato, n))
