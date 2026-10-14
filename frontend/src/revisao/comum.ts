/** As contas da Revisão: o tempo como a tela mostra, a palavra e a fala sob um instante, o plano. */
import type { ItemRef } from '@/api'
import type { PalavraSaida } from '@/direcao/direcaoProjeto'
import type { Comentario, Duvida } from './api'

/** m:ss,d (0:03,2), como o texto do envio. */
export function tempo(t: number | null | undefined) {
  const d = Math.floor(Math.max(0, t ?? 0) * 10 + 1e-6)
  return `${Math.floor(d / 600)}:${String(Math.floor((d % 600) / 10)).padStart(2, '0')},${d % 10}`
}

export const quando = (c: Pick<Comentario, 'geral' | 't' | 'fim'>) => (c.geral ? 'Geral' : c.fim != null ? `${tempo(c.t)}–${tempo(c.fim)}` : tempo(c.t))

export const agora = () => {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
}

/** A palavra do vídeo final sob `t` (ou a mais perto). */
export function palavraEm(saida: PalavraSaida[], t: number) {
  let melhor: PalavraSaida | null = null
  let dist = Infinity
  for (const w of saida) {
    const d = t >= w.saida_ini && t < w.saida_fim ? 0 : Math.min(Math.abs(w.saida_ini - t), Math.abs(t - w.saida_fim))
    if (d < dist) {
      dist = d
      melhor = w
    }
  }
  return melhor
}

const limpar = (s: string) => s.replace(/^[\s,.;:!?…]+/, '').replace(/[\s,.;:!?]+$/, '')

/** O que se fala no comentário: num instante, a palavra e uma de cada lado; num trecho, as palavras dele (mais de 10:
 *  as 4 primeiras … as 4 últimas). */
export function falaEm(saida: PalavraSaida[], t: number, fim: number | null) {
  const ws = [...saida].sort((a, b) => a.saida_ini - b.saida_ini)
  if (fim != null) {
    const dentro = ws.filter((w) => w.saida_fim > t && w.saida_ini < fim)
    if (dentro.length) {
      const txt = dentro.length > 10 ? [...dentro.slice(0, 4), { texto: '…' }, ...dentro.slice(-4)] : dentro
      return limpar(txt.map((w) => w.texto).join(' '))
    }
  }
  const w = palavraEm(ws, t)
  const k = w ? ws.indexOf(w) : -1
  return k < 0 ? '' : limpar(ws.slice(Math.max(k - 1, 0), k + 2).map((x) => x.texto).join(' '))
}

export const planoEm = (planos: ItemRef[], t: number) => planos.find((p) => t >= p.inicio && t < p.fim) ?? null

/** Onde a dúvida do Claude cai no vídeo final (pelas palavras; uma palavra cortada: a mais perto que sobrou não existe,
 *  então a dúvida fica sem tempo). */
export function tempoDaDuvida(d: Duvida, saida: PalavraSaida[]) {
  const a = saida.find((w) => w.id === d.palavra)
  const b = saida.find((w) => w.id === d.palavra_fim) ?? a
  return a ? { t: a.saida_ini, fim: b && b.saida_fim > a.saida_ini ? b.saida_fim : null } : null
}

/** O próximo id livre (c1, c2…), sem colidir com os já reservados por anexos de comentários ainda não gravados. */
export function proximoId(coms: Comentario[], reservado: number) {
  const n = Math.max(reservado, ...coms.map((c) => Number(c.id.slice(1)) || 0)) + 1
  return { id: `c${n}`, n }
}

export const temConteudo = (c: Pick<Comentario, 'texto' | 'anexos'>) => !!(c.texto.trim() || c.anexos?.length)
