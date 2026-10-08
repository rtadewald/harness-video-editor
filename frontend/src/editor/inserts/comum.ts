import type { MidiaLigada } from '@/api'
import type { PedidoNoTempo } from '../InsertNoLugar'

export type Pedido = PedidoNoTempo

export type NovaMidia = Omit<MidiaLigada, 'id'> & { id?: string }

export const NOME_TIPO: Record<string, string> = {
  insert_tela_cheia: 'Tela cheia',
  tela_dividida_insert: 'Tela dividida',
  comentario_insert_ator: 'Comentário + insert',
}

export const TEM_MOTION = ['motion_tela_cheia', 'tela_dividida_motion']

export const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'

export const BOTAO = 'flex items-center gap-1 rounded-full border border-line-dark px-3 py-1 font-semibold text-fog hover:text-cream'
