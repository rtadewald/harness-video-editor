import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCodigo, type TipoCodigo } from './codigos'
import { cn } from '@/lib/utils'

/** O chip do código: clicar copia "CÓDIGO · nome" (o que se cola num comentário da revisão ou no chat). `sufixo`: um
 *  plano (·p7) ou uma versão (·v3) depois do código. Não propaga o clique (os cards abrem ao clicar). */
export function ChipCodigo(p: { tipo: TipoCodigo; id: string | null | undefined; nome?: string; sufixo?: string; className?: string }) {
  const base = useCodigo(p.tipo, p.id)
  const [copiado, setCopiado] = useState(false)
  if (!base) return null
  const codigo = base + (p.sufixo ?? '')
  const copiar = async (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    await navigator.clipboard.writeText(p.nome ? `${codigo} · ${p.nome}` : codigo).catch(() => undefined)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1400)
  }
  return (
    // um span clicável (não um botão): o chip também vai dentro de cards que já são botões
    <span
      role="button"
      tabIndex={0}
      onClick={copiar}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void copiar(e)}
      onPointerDown={(e) => e.stopPropagation()}
      title={copiado ? 'Copiado' : `Copiar “${codigo}${p.nome ? ` · ${p.nome}` : ''}” (para citar na revisão ou no chat)`}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.02em] ring-1 transition-colors',
        copiado ? 'bg-mint/15 text-mint ring-mint/40' : 'text-fog ring-line-dark hover:text-cream hover:ring-cream/40',
        p.className,
      )}
    >
      {codigo}
      {copiado ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
    </span>
  )
}
