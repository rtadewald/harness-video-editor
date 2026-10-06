import type { Etapa } from '@/api'

export const ETAPAS: { id: Etapa; nome: string; trilha: 'V1' | 'V2' | 'V3' | 'LEG'; titulo: string }[] = [
  { id: 'cortes', nome: 'Cortes', trilha: 'V1', titulo: 'O texto final.' },
  { id: 'direcao', nome: 'Direção visual', trilha: 'V2', titulo: 'O que aparece na tela.' },
  { id: 'inserts', nome: 'Inserts', trilha: 'V2', titulo: 'Os inserts.' },
  { id: 'enriquecimento', nome: 'Enriquecimento', trilha: 'V2', titulo: 'Moldura, zoom e transições dos inserts.' },
  { id: 'motion', nome: 'Motion', trilha: 'V3', titulo: 'Os motions.' },
  { id: 'audio', nome: 'Áudio', trilha: 'V1', titulo: 'Os efeitos sonoros.' },
  { id: 'legenda', nome: 'Legenda', trilha: 'LEG', titulo: 'As legendas.' },
]

export const SUGESTOES: Record<Etapa, string[]> = {
  cortes: ['Volta a primeira tentativa da abertura', 'Deixa um respiro maior antes do "Olha só"', 'Corta mais seco no final'],
  direcao: ['Mostra o site em tela cheia quando eu cito', 'Põe um lettering na palavra-chave'],
  inserts: ['Usa o site com processo no segundo exemplo', 'Mostra o insert em tela cheia'],
  enriquecimento: ['Põe os sites num card sobre o degradê', 'Zoom leve na segunda dobra'],
  motion: ['Cria um motion para "processo de design"', 'Deixa o comparativo mais curto'],
  audio: ['Whoosh na entrada dos inserts', 'Clique quando o botão aparece'],
  legenda: ['Destaca as palavras-chave em amarelo', 'Legendas de 3 palavras no máximo'],
}
