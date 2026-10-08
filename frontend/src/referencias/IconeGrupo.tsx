import { LayoutGrid, MessageSquareText, Rows2, Smartphone, Type, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONES: Record<string, typeof User> = {
  todos: LayoutGrid,
  tela_dividida: Rows2, // a mídia em cima, o ator embaixo
  tela_cheia: Smartphone, // a mídia ocupando a tela
  full_ator: User,
  full_ator_lettering: Type,
  comentario_insert_ator: MessageSquareText,
}

/** O ícone de cada grupo de planos nos chips das Referências e do "Buscar por referências". */
export default function IconeGrupo({ grupo, className }: { grupo: string; className?: string }) {
  const Icone = ICONES[grupo]
  return Icone ? <Icone className={cn('size-3.5 shrink-0', className)} aria-hidden /> : null
}
