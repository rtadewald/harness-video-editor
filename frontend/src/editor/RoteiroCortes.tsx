import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { formatarTempo, type Palavra } from '@/api'
import { cn } from '@/lib/utils'

const FIM_DE_FRASE = /[.?!…]["”']?$/

/** As palavras agrupadas em frases: quebra no fim de frase (pontuação) ou numa pausa longa; frases compridas também
 *  quebram numa vírgula (a partir de ~18 palavras) e, no limite, em 35 palavras. */
function frases(palavras: Palavra[]) {
  const grupos: Palavra[][] = []
  palavras.forEach((w, k) => {
    const ant = palavras[k - 1]
    const atual = grupos[grupos.length - 1]
    const longa = atual && ((atual.length >= 18 && /,$/.test(ant.texto)) || atual.length >= 35)
    if (!ant || FIM_DE_FRASE.test(ant.texto) || w.inicio - ant.fim >= 0.7 || longa) grupos.push([])
    grupos[grupos.length - 1].push(w)
  })
  return grupos
}

/** O roteiro como a IA deixou: a transcrição frase a frase, com o que foi cortado riscado. Clique leva o player à frase. */
export default function RoteiroCortes({ palavras, buscar, fechar }: { palavras: Palavra[]; buscar: (t: number) => void; fechar: () => void }) {
  const grupos = useMemo(() => frases(palavras), [palavras])
  const removidas = palavras.filter((w) => !w.mantida).length
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [fechar])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>
      <div
        className="flex w-full max-w-[760px] flex-col gap-4 rounded-[8px] bg-deep p-6 text-cream ring-1 ring-line-dark"
        style={{ maxHeight: 'min(70vh, 720px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div>
            <p className="eyebrow text-sage">Roteiro dos cortes</p>
            <p className="mt-1 text-[12px] text-fog">
              {palavras.length - removidas} palavras ficam · <span className="text-coral">{removidas} cortadas</span> (riscadas). Clique numa frase para ir até ela.
            </p>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="ml-auto grid size-9 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto pr-2">
          {grupos.map((g) => {
            const toda = g.every((w) => !w.mantida)
            return (
              <button
                key={g[0].id}
                onClick={() => {
                  buscar(g[0].inicio)
                  fechar()
                }}
                className={cn('grid w-full grid-cols-[64px_1fr] gap-3 rounded-[4px] px-2 py-2 text-left hover:bg-cream/5', toda && 'opacity-60')}
              >
                <span className="pt-0.5 text-[11px] text-fog tabular-nums">{formatarTempo(g[0].inicio)}</span>
                <span className="text-[14px] leading-[1.65]">
                  {g.map((w, k) => (
                    <span key={w.id}>
                      {k > 0 && ' '}
                      <span className={cn(!w.mantida && 'text-coral/80 line-through decoration-coral decoration-[1.5px]')}>{w.texto}</span>
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
