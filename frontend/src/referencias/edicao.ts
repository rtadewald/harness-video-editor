import type { ItemRef } from '@/api'

/** Operações da revisão de uma referência. Puras: recebem os itens e devolvem uma lista nova.
 *  Regras iguais às do servidor (direcao.validar_edicao): planos-base contíguos cobrindo o vídeo; elementos livres. */

export const MIN_PLANO = 0.1
export const MIN_ELEMENTO = 0.05

export const planosDe = (itens: ItemRef[]) => itens.filter((i) => i.camada === 'plano').sort((a, b) => a.inicio - b.inicio)
export const elementosDe = (itens: ItemRef[]) => itens.filter((i) => i.camada === 'elemento').sort((a, b) => a.inicio - b.inicio)

const r3 = (t: number) => Math.round(t * 1000) / 1000

function novoId(itens: ItemRef[], prefixo: 'p' | 'e') {
  const n = Math.max(0, ...itens.filter((i) => i.id.startsWith(prefixo)).map((i) => Number(i.id.slice(1)) || 0))
  return `${prefixo}${n + 1}`
}

/** Move a borda entre o plano `k` e o `k + 1` (as duas pontas andam juntas). */
export function moverBorda(itens: ItemRef[], k: number, t: number): ItemRef[] {
  const ps = planosDe(itens)
  const a = ps[k]
  const b = ps[k + 1]
  if (!a || !b) return itens
  const novo = r3(Math.min(Math.max(t, a.inicio + MIN_PLANO), b.fim - MIN_PLANO))
  return itens.map((i) => (i.id === a.id ? { ...i, fim: novo } : i.id === b.id ? { ...i, inicio: novo } : i))
}

/** Move uma ponta de um elemento, ou o elemento inteiro (`lado` = 'corpo', `t` = novo início). */
export function moverElemento(itens: ItemRef[], id: string, lado: 'inicio' | 'fim' | 'corpo', t: number, duracao: number): ItemRef[] {
  return itens.map((i) => {
    if (i.id !== id) return i
    if (lado === 'inicio') return { ...i, inicio: r3(Math.min(Math.max(t, 0), i.fim - MIN_ELEMENTO)) }
    if (lado === 'fim') return { ...i, fim: r3(Math.max(Math.min(t, duracao), i.inicio + MIN_ELEMENTO)) }
    const d = i.fim - i.inicio
    const ini = Math.min(Math.max(t, 0), duracao - d)
    return { ...i, inicio: r3(ini), fim: r3(ini + d) }
  })
}

/** Divide o plano que contém `t` em dois (o segundo nasce igual, para você trocar o tipo). */
export function dividirPlano(itens: ItemRef[], t: number): { itens: ItemRef[]; novo: string | null } {
  const p = planosDe(itens).find((x) => t > x.inicio + MIN_PLANO && t < x.fim - MIN_PLANO)
  if (!p) return { itens, novo: null }
  const id = novoId(itens, 'p')
  const corte = r3(t)
  const segundo: ItemRef = { ...p, id, inicio: corte, miniatura: undefined, miniatura_t: undefined }
  return { itens: [...itens.map((i) => (i.id === p.id ? { ...i, fim: corte } : i)), segundo], novo: id }
}

/** Tira um item. Um plano some juntando-se ao anterior (ou ao seguinte, se for o primeiro). */
export function excluir(itens: ItemRef[], id: string): ItemRef[] {
  const item = itens.find((i) => i.id === id)
  if (!item) return itens
  if (item.camada === 'elemento') return itens.filter((i) => i.id !== id)
  const ps = planosDe(itens)
  if (ps.length < 2) return itens
  const k = ps.findIndex((p) => p.id === id)
  const vizinho = k > 0 ? ps[k - 1] : ps[k + 1]
  return itens
    .filter((i) => i.id !== id)
    .map((i) => (i.id !== vizinho.id ? i : k > 0 ? { ...i, fim: item.fim } : { ...i, inicio: item.inicio }))
}

export function novoElemento(itens: ItemRef[], t: number, duracao: number): { itens: ItemRef[]; novo: string } {
  const id = novoId(itens, 'e')
  const inicio = r3(Math.min(Math.max(t, 0), duracao - 0.5))
  const el: ItemRef = { id, camada: 'elemento', tipo: 'lettering', conteudo: null, inicio, fim: r3(Math.min(inicio + 1.5, duracao)), descricao: '', texto: '', funcao: '' }
  return { itens: [...itens, el], novo: id }
}

export function editar(itens: ItemRef[], id: string, campos: Partial<ItemRef>): ItemRef[] {
  return itens.map((i) => {
    if (i.id !== id) return i
    const novo = { ...i, ...campos }
    if (novo.tipo !== 'tela_dividida') novo.conteudo = null
    else if (!novo.conteudo) novo.conteudo = 'insert'
    return novo
  })
}

/** Distribui elementos que se sobrepõem em faixas lado a lado. */
export function faixasDeElementos(els: ItemRef[]): Map<string, number> {
  const fins: number[] = []
  const faixa = new Map<string, number>()
  for (const e of els) {
    let k = fins.findIndex((f) => f <= e.inicio + 1e-6)
    if (k < 0) k = fins.length
    fins[k] = e.fim
    faixa.set(e.id, k)
  }
  return faixa
}
