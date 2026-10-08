import { json } from '@/api'
import { bezier, limite01 } from './curvas'
import { criarLoja } from './loja'
import type { Curva } from './enriquecimento'

/** Entradas e saídas dos inserts (SPEC §8.4): a configuração de cada tipo é global (`transicoes.py` no backend) — curva,
 *  duração e os detalhes do movimento. Configurou uma vez, vale para todos os inserts que usam aquele tipo. */
type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita'
type ConfigTransicao = {
  curva: Curva
  duracao?: number
  escala?: number
  direcao?: Direcao
  distancia?: number
  fim?: number
  fade?: boolean
  angulo?: number
  deslocamento?: number
  desfoque?: number
  zoom?: number
}
export type Lado = 'entrada' | 'saida'
export type Transicoes = Record<Lado, Record<string, ConfigTransicao>>

// a configuração vem do servidor uma vez e é compartilhada; mudar avisa quem está usando
const loja = criarLoja(() => fetch('/api/transicoes').then(json<Transicoes>))
export const useTransicoes = loja.use

const limite = limite01
/** Quanto a entrada dura (s), dentro de uma mídia de `dur` s ("seca + zoom" dura a mídia toda). */
export const duracaoEntrada = (tipo: string, t: Transicoes, dur: number) =>
  tipo === 'sem' ? 0 : tipo === 'seco_zoom' ? dur : Math.min(t.entrada[tipo]?.duracao ?? 0.75, dur)
/** Quanto a saída dura (s); nunca mais que metade da mídia. */
export const duracaoSaida = (tipo: string, t: Transicoes, dur: number) => (tipo === 'corte' ? 0 : Math.min(t.saida[tipo]?.duracao ?? 0.5, dur / 2))

// a direção do deslize (para onde o movimento vai), em % do próprio elemento: na entrada ele vem do lado oposto
const vetor = (d: Direcao | undefined): [number, number] => (d === 'baixo' ? [0, 1] : d === 'esquerda' ? [-1, 0] : d === 'direita' ? [1, 0] : [0, -1])

/** O estilo de uma mídia do insert no instante `rel` (s desde que ela começou) de `dur` s: a entrada e a saída dela.
 *  As saídas usam as mesmas curvas espelhadas (aceleram ao sair). */
export function estiloTransicao(entrada: string, saida: string, t: Transicoes, rel: number, dur: number): React.CSSProperties {
  const tr: string[] = []
  let opacidade = 1
  let blur = 0
  const ce = t.entrada[entrada]
  if (ce && entrada !== 'sem') {
    if (entrada === 'seco_zoom') {
      // aparece de uma vez e o card aproxima até `zoom`% ao longo da mídia toda
      tr.push(`scale(${1 + ((ce.zoom ?? 106) / 100 - 1) * bezier(...ce.curva)(limite(rel / Math.max(dur, 0.01)))})`)
    } else {
      const d = duracaoEntrada(entrada, t, dur)
      const p = bezier(...ce.curva)(limite(rel / Math.max(d, 0.01))) // pode passar de 1 (curvas que passam do ponto)
      const pe = limite(p)
      if (entrada === 'surgir') {
        const s0 = (ce.escala ?? 94) / 100
        opacidade *= pe
        tr.push(`scale(${s0 + (1 - s0) * p})`)
      } else if (entrada === 'subir') {
        // "Deslizar": vem de `distancia`% para o lado oposto da direção e para em `fim`%
        const [x, y] = vetor(ce.direcao)
        const pos = -(ce.distancia ?? 40) * (1 - p) + (ce.fim ?? 0) * p
        tr.push(`translate(${x * pos}%, ${y * pos}%)`)
        if (ce.fade) opacidade *= pe
      } else if (entrada === 'voo_3d') {
        tr.push(`perspective(800px) rotateX(${(1 - p) * (ce.angulo ?? 55)}deg) translateY(${(1 - p) * (ce.deslocamento ?? 30)}%)`)
        if (ce.fade) opacidade *= pe
      } else if (entrada === 'zoom_borrado') {
        const s0 = (ce.escala ?? 125) / 100
        tr.push(`scale(${s0 + (1 - s0) * p})`)
        blur = Math.max(blur, (1 - pe) * (ce.desfoque ?? 14))
        if (ce.fade) opacidade *= pe
      }
    }
  }
  const cs = t.saida[saida]
  if (cs && saida !== 'corte') {
    const d = duracaoSaida(saida, t, dur)
    const w = limite(1 - (dur - rel) / Math.max(d, 0.01)) // 0 → 1 ao longo da saída
    const q = 1 - bezier(...cs.curva)(1 - w) // a curva espelhada: acelera ao sair
    if (w > 0) {
      if (saida === 'sumir') opacidade *= 1 - q
      else if (saida === 'deslizar') {
        const [x, y] = vetor(cs.direcao)
        tr.push(`translate(${x * q * (cs.distancia ?? 40)}%, ${y * q * (cs.distancia ?? 40)}%)`) // vai para o lado da direção
        if (cs.fade) opacidade *= 1 - q
      } else if (saida === 'voo_3d') {
        tr.push(`perspective(800px) rotateX(${-q * (cs.angulo ?? 55)}deg) translateY(${-q * (cs.deslocamento ?? 30)}%)`)
        if (cs.fade) opacidade *= 1 - q
      } else if (saida === 'zoom_borrado') {
        tr.push(`scale(${1 + ((cs.escala ?? 125) / 100 - 1) * q})`)
        blur = Math.max(blur, q * (cs.desfoque ?? 14))
        if (cs.fade) opacidade *= 1 - q
      }
    }
  }
  return { transform: tr.join(' ') || undefined, opacity: opacidade, filter: blur ? `blur(${blur}px)` : undefined }
}
