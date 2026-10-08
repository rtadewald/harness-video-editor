import { enviar, json } from '@/api'
import { bezier, limite01 } from './curvas'
import { criarLoja } from './loja'
import type { Curva } from './enriquecimento'

/** Presets de enriquecimento (SPEC §8.4): a receita de como as mídias de um insert aparecem, medida nas referências
 *  favoritas. Espelha `presets.py`. Posições e deslocamentos em % da área do insert (a tela toda ou a metade de cima). */
export type Propriedade = 'pos' | 'escala' | 'rot' | 'opacidade' | 'desfoque'
export type Estado = { dx: number; dy: number; escala: number; rot: number; rx: number; ry: number; opacidade: number; desfoque: number }
export type Movimento = {
  duracao: number
  curvas: Partial<Record<Propriedade, Curva>>
  atraso: Partial<Record<Propriedade, number>>
  dur: Partial<Record<Propriedade, number>>
} & ({ de: Estado } | { para: Estado })
export type Repouso = { cx: number; cy: number; w: number; h: number; rot: number; rx: number; ry: number; raio: number; sombra: boolean; z: number }
export type CardReceita = {
  inicio_frac: number
  sai_antes_do_fim: number
  repouso: Repouso
  entrada: (Movimento & { de: Estado }) | null
  saida: (Movimento & { para: Estado }) | null
  ajuste: 'cover' | 'contain' | 'topo'
}
export type Receita = { formato: 'vertical' | 'dividida'; fundo: 'proprio' | 'nenhum'; duracao_ref: number; cards: CardReceita[] }
export type Preset = {
  id: string
  nome: string
  formato: 'vertical' | 'dividida'
  receita: Receita
  fontes: { ref: string; inicio: number; fim: number }[]
  aprovado: boolean
}

// a biblioteca vem do servidor uma vez e é compartilhada; mudar avisa quem está usando
const loja = criarLoja(() => fetch('/api/presets').then(json<Preset[]>))
export const usePresets = loja.use

export async function editarPreset(id: string, campos: Partial<{ nome: string; aprovado: boolean; receita: Receita }>) {
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
const NEUTRO: Estado = { dx: 0, dy: 0, escala: 1, rot: 0, rx: 0, ry: 0, opacidade: 1, desfoque: 0 }

/** O tempo de cada card num insert de `dur` s: começa em `inicio_frac` da duração e termina `sai_antes_do_fim` antes do fim. */
export function janela(c: CardReceita, dur: number) {
  const ini = c.inicio_frac * dur
  const fim = Math.max(dur - c.sai_antes_do_fim, ini + 0.05)
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
      rot: e.rot + mistura(0, pa.rot, pr),
      rx: e.rx + mistura(0, pa.rx, pr),
      ry: e.ry + mistura(0, pa.ry, pr),
      opacidade: e.opacidade * limite(mistura(1, pa.opacidade, progresso(c.saida, 'opacidade', t))),
      desfoque: e.desfoque + Math.max(0, mistura(0, pa.desfoque, progresso(c.saida, 'desfoque', t))),
    }
  }
  return e
}

/** Algum card está se mexendo no instante `rel`? (a exportação reaproveita a foto dos quadros parados) */
export function mexendo(r: Receita, rel: number, dur: number) {
  return r.cards.some((c) => {
    const { ini, fim } = janela(c, dur)
    return (c.entrada && rel >= ini && rel < ini + c.entrada.duracao) || (c.saida && rel > fim - c.saida.duracao && rel <= fim)
  })
}

/** O preset serve a um insert: mesmo formato e mesmo número de mídias. */
export const serve = (p: Preset, formato: string, n: number) => p.formato === formato && p.receita.cards.length === n
/** Os presets que servem a um insert (por padrão, só os aprovados). */
export const presetsPara = (l: Preset[] | null, formato: string, n: number, soAprovados = true) => (l ?? []).filter((p) => serve(p, formato, n) && (!soAprovados || p.aprovado))
