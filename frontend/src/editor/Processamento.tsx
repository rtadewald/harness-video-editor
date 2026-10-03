import { processar, type Projeto } from '@/api'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NOMES = {
  proxy: 'Preparando o vídeo para o player',
  silencios: 'Encontrando as pausas reais',
  transcricao: 'Transcrevendo cada tentativa, palavra por palavra',
  cortes: 'Escolhendo o texto final com IA',
} as const

/** Enquanto o pipeline automático roda (SPEC §6). */
export default function Processamento({ projeto, aoMudar }: { projeto: Projeto; aoMudar: (p: Projeto) => void }) {
  const passos = projeto.pipeline?.passos ?? {}
  const erro = projeto.pipeline?.erro

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-[460px]">
        <Marca className={cn('mb-6 size-10 text-coral', !erro && 'animate-[otto-spin_8s_linear_infinite]')} />
        <p className="eyebrow text-sage">{erro ? 'Algo deu errado' : 'Preparando o projeto'}</p>
        <h2 className="titulo mt-3 text-[38px]">{erro ? 'O processamento parou.' : 'A IA está montando o primeiro corte.'}</h2>

        <ul className="mt-8 grid gap-3.5 border-t border-line-dark pt-6">
          {(Object.keys(NOMES) as (keyof typeof NOMES)[]).map((k) => {
            const s = passos[k] ?? { status: 'pendente' }
            return (
              <li key={k} className={cn('flex items-center gap-3 text-[13px]', s.status === 'pendente' ? 'text-fog/60' : 'text-cream')}>
                <span
                  className={cn(
                    'grid size-[18px] shrink-0 place-items-center rounded-full border text-[10px]',
                    s.status === 'pronto' && 'border-mint bg-mint text-ink',
                    s.status === 'rodando' && 'animate-[otto-spin_1s_linear_infinite] border-coral border-t-transparent',
                    s.status === 'erro' && 'border-coral bg-coral text-cream',
                    s.status === 'pendente' && 'border-fog/40',
                  )}
                >
                  {s.status === 'pronto' ? '✓' : s.status === 'erro' ? '!' : ''}
                </span>
                {NOMES[k]}
                <span className="ml-auto text-[11px] text-fog tabular-nums">
                  {s.status === 'rodando' && s.progresso != null ? `${Math.round(s.progresso * 100)}%` : s.segundos != null ? `${s.segundos}s` : ''}
                </span>
              </li>
            )
          })}
        </ul>

        {erro && (
          <div className="mt-6 grid gap-4">
            <p className="border-l-2 border-coral pl-3 text-[12px] leading-[1.6] break-words text-fog">{erro}</p>
            <Button variant="cream" className="justify-between" onClick={() => processar(projeto.id).then(aoMudar)}>
              Tentar de novo <span className="seta">↗</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
