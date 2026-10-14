import type { SeloBanco as Selo } from '@/api'
import { cn } from '@/lib/utils'

const SELOS: Record<Selo, { nome: string; titulo: string; cor: string }> = {
  usado: { nome: '★ Usado', titulo: 'Entrou num vídeo aprovado', cor: 'bg-yellow text-ink' },
  aprovado: { nome: '✓ Aprovado', titulo: 'Aprovado à mão, ou subido por você', cor: 'bg-mint text-ink' },
  recusado: { nome: '✗ Recusado', titulo: 'Trazido pelo Claude e de fora do vídeo aprovado (ou recusado à mão): "Limpar recusados" o leva para a lixeira', cor: 'bg-coral text-cream' },
}

/** O selo da faxina do banco (usado, aprovado, recusado); sem selo, nada. */
export default function SeloBanco({ estado, className }: { estado?: Selo | null; className?: string }) {
  if (!estado) return null
  const s = SELOS[estado]
  return (
    <span title={s.titulo} className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold whitespace-nowrap', s.cor, className)}>
      {s.nome}
    </span>
  )
}
