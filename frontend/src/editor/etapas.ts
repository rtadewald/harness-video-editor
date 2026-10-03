import type { Etapa } from '@/api'

export const ETAPAS: { id: Etapa; nome: string; trilha: 'V1' | 'V2' | 'V3' | 'LEG'; titulo: string }[] = [
  { id: 'cortes', nome: 'Cortes', trilha: 'V1', titulo: 'O texto final.' },
  { id: 'inserts', nome: 'Inserts', trilha: 'V2', titulo: 'Os inserts.' },
  { id: 'motion', nome: 'Motion', trilha: 'V3', titulo: 'Os motions.' },
  { id: 'legenda', nome: 'Legenda', trilha: 'LEG', titulo: 'As legendas.' },
]

export const SUGESTOES: Record<Etapa, string[]> = {
  cortes: ['Volta a primeira tentativa da abertura', 'Deixa um respiro maior antes do "Olha só"', 'Corta mais seco no final'],
  inserts: ['Usa o site com processo no segundo exemplo', 'Mostra o insert em tela cheia'],
  motion: ['Cria um motion para "processo de design"', 'Deixa o comparativo mais curto'],
  legenda: ['Destaca as palavras-chave em amarelo', 'Legendas de 3 palavras no máximo'],
}
