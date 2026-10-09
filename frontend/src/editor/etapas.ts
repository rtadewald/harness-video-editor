import type { Etapa } from '@/api'

/** A barra das etapas (SPEC §1, §7), nesta ordem. O Pré-processamento guarda o id antigo, `cortes` (os dados dos projetos e
 *  a última etapa lembrada neste navegador continuam valendo); `transicoes` e `audio` eram uma etapa só até a F0. */
export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: 'cortes', nome: 'Pré-processamento' },
  { id: 'direcao', nome: 'Direção visual' },
  { id: 'inserts', nome: 'Inserts' },
  { id: 'transicoes', nome: 'Transições' },
  { id: 'audio', nome: 'Áudio' },
  { id: 'legenda', nome: 'Legenda' },
]

/** As partes do Pré-processamento (SPEC §8.1), em abas no topo da tela dele. */
export const ABAS_PRE = [
  { id: 'cortes', nome: 'Cortes' },
  { id: 'enquadramento', nome: 'Enquadramento' },
  { id: 'look', nome: 'Look' },
] as const
export type AbaPre = (typeof ABAS_PRE)[number]['id']
