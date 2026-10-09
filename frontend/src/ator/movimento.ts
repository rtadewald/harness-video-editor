import type { Rosto } from './ator'

/** Os presets do Full ator (pedido de Rodrigo, out/2026): um movimento de câmera no ator durante o plano. "Nada" é o
 *  padrão (sem chave). A conta é a mesma da exportação (`exportacao._movimentos`): a escala no tempo do plano e o
 *  centro do zoom no rosto (senão um pouco acima do meio). */
export type Movimento = 'zoom_lento' | 'zoom_seco'
export const MOVIMENTOS: { id: Movimento | null; nome: string; descricao: string }[] = [
  { id: null, nome: 'Nada', descricao: 'O ator como foi gravado (o padrão).' },
  { id: 'zoom_lento', nome: 'Zoom in lento', descricao: 'Aproxima devagar o plano inteiro, sem nunca parar.' },
  { id: 'zoom_seco', nome: 'Zoom seco', descricao: 'Entra já mais perto, num corte, e segura até o fim do plano.' },
]
/** Zoom lento: +3% por segundo, no máximo +15% no plano; zoom seco: +18% de uma vez (os mesmos de `exportacao.py`). */
export const ZOOM_LENTO = { porSegundo: 0.03, maximo: 0.15 }
export const ZOOM_SECO = 0.18
export const ehFullAtor = (tipo: string) => tipo.startsWith('full_ator')

/** A escala do ator `rel` s depois do começo de um plano de `dur` s. O lento sai e chega andando (metade linear, metade
 *  suavizada): suave, sem tranco nem parada. */
export function escalaDoMovimento(m: Movimento, rel: number, dur: number): number {
  if (m === 'zoom_seco') return 1 + ZOOM_SECO
  const a = Math.min(ZOOM_LENTO.porSegundo * dur, ZOOM_LENTO.maximo)
  const u = Math.min(Math.max(rel / Math.max(dur, 0.01), 0), 1)
  return 1 + a * (0.5 * u + 0.5 * u * u * (3 - 2 * u))
}

/** O ponto que fica parado no zoom (fração do quadro): o centro do rosto; sem medida, um pouco acima do meio. */
export const centroDoMovimento = (r: Rosto | null | undefined) => (r ? { x: r.cx, y: r.cy } : { x: 0.5, y: 0.4 })
