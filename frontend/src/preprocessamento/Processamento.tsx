import { processar, type Projeto } from '@/api'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NOMES = {
  enquadramento: 'Enquadrando o vídeo 16:9 em 9:16, seguindo o rosto',
  proxy: 'Preparando o vídeo para o player',
  silencios: 'Encontrando as pausas reais',
  transcricao: 'Transcrevendo o áudio, palavra por palavra',
  alinhamento: 'Ajustando o tempo de cada palavra ao áudio',
  cortes: 'Escolhendo o texto final com IA',
} as const

/** Enquanto o pipeline automático roda (SPEC §6). */
export default function Processamento({ projeto, aoMudar }: { projeto: Projeto; aoMudar: (p: Projeto) => void }) {
  const passos = projeto.pipeline?.passos ?? {}
  const erro = projeto.pipeline?.erro
  const bruto = projeto.fontes.find((f) => f.papel === 'bruto')
  const veioHorizontal = !!projeto.enquadramento?.original || (bruto?.largura ?? 0) > (bruto?.altura ?? 0)
  // o alinhamento só roda quando o motor ativo é um alinhador do Whisper (stable-ts, Qwen3, CTC); nos outros, é pulado
  const ativo = projeto.transcricoes?.[projeto.transcricao_ativa]
  const alinha = ativo?.familia === 'whisper' && projeto.transcricao_ativa !== 'whisper'
  const aparece = (k: keyof typeof NOMES) => {
    const s = passos[k]
    if (k === 'enquadramento') return veioHorizontal && !!s && !s.pulado
    if (k === 'alinhamento') return !s?.pulado && (alinha || (!!s && s.status !== 'pendente'))
    return true
  }

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="w-full max-w-[460px]">
        <Marca className={cn('mb-6 size-10 text-coral', !erro && 'animate-[otto-spin_8s_linear_infinite]')} />
        <p className="eyebrow text-sage">{erro ? 'Algo deu errado' : 'Preparando o projeto'}</p>
        <h2 className="titulo mt-3 text-[38px]">{erro ? 'O processamento parou.' : 'A IA está montando o primeiro corte.'}</h2>

        <ul className="mt-8 grid gap-3.5 border-t border-line-dark pt-6">
          {/* o enquadramento só aparece num vídeo que chegou horizontal (nem como pendente num vertical) */}
          {(Object.keys(NOMES) as (keyof typeof NOMES)[]).filter(aparece).map((k) => {
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

        {passos.transcricao?.aviso && <p className="mt-5 border-l-2 border-yellow pl-3 text-[12px] leading-[1.6] break-words text-fog">{passos.transcricao.aviso}</p>}

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
