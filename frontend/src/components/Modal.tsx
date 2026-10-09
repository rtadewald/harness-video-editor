import { X } from 'lucide-react'
import { useFecharComEsc } from '@/lib/atalhos'
import { cn } from '@/lib/utils'

/** Modal escuro do app: título, fechar (clique fora, ✕ ou Esc) e o conteúdo. Marcado com data-modal: enquanto ele
 *  está aberto, os atalhos da tela de trás não agem (ver lib/atalhos). `tamanho`: pequeno (formulários), alto
 *  (textos longos, 86% da altura), largo (alto e mais largo), tela (maior que o largo, para galerias de vídeo) ou cheia
 *  (quase a tela toda). */
export default function Modal({
  titulo,
  fechar,
  tamanho = 'pequeno',
  children,
}: {
  titulo: React.ReactNode
  fechar: () => void
  tamanho?: 'pequeno' | 'alto' | 'largo' | 'tela' | 'cheia'
  children: React.ReactNode
}) {
  const ref = useFecharComEsc(fechar)
  return (
    <div ref={ref} data-modal className={cn('fixed inset-0 z-50 grid place-items-center bg-black/75', tamanho === 'cheia' ? 'p-3' : 'p-6')} onClick={fechar}>
      <div
        className={cn(
          'w-full gap-3 rounded-[8px] bg-deep p-5 text-cream ring-1 ring-line-dark',
          tamanho === 'pequeno' ? 'grid max-w-[520px]' : tamanho === 'cheia' ? 'flex h-[95vh] max-w-[1720px] flex-col' : tamanho === 'tela' ? 'flex h-[90vh] max-w-[1320px] flex-col' : 'flex h-[86vh] flex-col',
          tamanho === 'alto' && 'max-w-[820px]',
          tamanho === 'largo' && 'max-w-[1100px]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <p className={cn('font-semibold', tamanho === 'pequeno' ? 'text-[15px]' : 'text-[16px]')}>{titulo}</p>
          <button onClick={fechar} aria-label="Fechar" className="ml-auto text-fog hover:text-cream">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
