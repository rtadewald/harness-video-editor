import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Modal escuro do app: título, fechar (clique fora ou ✕) e o conteúdo. `tamanho`: pequeno (formulários), alto
 *  (textos longos, 86% da altura), largo (alto e mais largo) ou tela (maior que o largo, para galerias de vídeo). */
export default function Modal({
  titulo,
  fechar,
  tamanho = 'pequeno',
  children,
}: {
  titulo: React.ReactNode
  fechar: () => void
  tamanho?: 'pequeno' | 'alto' | 'largo' | 'tela'
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6" onClick={fechar}>
      <div
        className={cn(
          'w-full gap-3 rounded-[8px] bg-deep p-5 text-cream ring-1 ring-line-dark',
          tamanho === 'pequeno' ? 'grid max-w-[520px]' : tamanho === 'tela' ? 'flex h-[90vh] max-w-[1320px] flex-col' : 'flex h-[86vh] flex-col',
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
