import { json } from '@/api'
import { criarLoja } from '@/editor/loja'

/** Os códigos copiáveis (docs/editor-claude.md, Q18): PRE presets · MOT motions · TRA transições · TRI trilhas ·
 *  BAN mídias (BAN-012.2 = um trecho) · REF referências (REF-03·p7 = um plano) · SOM sons · PRJ projetos · CTA. */
export type TipoCodigo = 'preset' | 'motion' | 'transicao' | 'trilha' | 'midia' | 'referencia' | 'som' | 'projeto' | 'cta'
type Mapa = Record<TipoCodigo, Record<string, string>>

const loja = criarLoja(() => fetch('/api/codigos').then(json<Mapa>))
export const useCodigos = loja.use
/** Relê os códigos (um item novo ganha o seu na hora em que o servidor lista). */
export const recarregarCodigos = loja.recarregar

/** O código de um item (ou undefined enquanto não carregou / o item ainda não tem). */
export function useCodigo(tipo: TipoCodigo, id: string | null | undefined): string | undefined {
  const m = useCodigos()
  return id ? m?.[tipo]?.[id] : undefined
}
