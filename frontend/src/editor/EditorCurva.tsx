import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bezier } from './curvas'
import { DURACAO, PRESETS_CURVA, type Curva } from './enriquecimento'

const iguais = (a: Curva, b: Curva) => a.every((v, i) => Math.abs(v - b[i]) < 0.005)

/** O desenho da curva (o progresso ao longo do tempo), como ícone do preset. */
function IconeCurva({ curva }: { curva: Curva }) {
  const f = bezier(...curva)
  const pontos = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24
    return `${2 + t * 32},${22 - f(t) * 18}`
  }).join(' ')
  return (
    <svg viewBox="0 0 36 26" className="h-6 w-9">
      <line x1="2" y1="22" x2="34" y2="22" className="stroke-current opacity-25" strokeWidth={1} />
      <polyline points={pontos} className="fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A entrada, simples e elegante: presets de curva (com o desenho de cada um) e a duração como parte do trecho. */
export default function EditorCurva(p: {
  curva: Curva
  duracao: number
  ajustada: boolean
  padrao?: { curva?: Curva; duracao?: number }
  mudar: (c: { curva?: Curva | null; duracao?: number | null }) => void
  salvarPadrao: (c: { curva: Curva; duracao: number }) => void
}) {
  // o slider mexe na tela e salva ao soltar
  const [duracao, setDuracao] = useState(p.duracao)
  useEffect(() => setDuracao(p.duracao), [p.duracao])
  const s = (v: number) => `${v.toFixed(2).replace('.', ',')} s`
  const preset = PRESETS_CURVA.find((x) => iguais(x.curva, p.curva))
  const ePadrao = !!p.padrao?.curva && iguais(p.padrao.curva, p.curva) && p.padrao.duracao === duracao
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {PRESETS_CURVA.map((x) => (
          <button
            key={x.nome}
            onClick={() => p.mudar({ curva: x.curva })}
            className={cn(
              'grid place-items-center gap-1 rounded-[6px] px-1.5 py-2 text-center text-[10px] leading-tight ring-1 transition-colors',
              preset === x ? 'bg-cream/10 text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream hover:ring-cream/40',
            )}
          >
            <IconeCurva curva={x.curva} />
            {x.nome}
          </button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow text-sage">Duração</span>
          <span className="text-[12px] font-semibold text-cream tabular-nums">{s(duracao)}</span>
        </div>
        <input
          type="range"
          min={DURACAO.min}
          max={DURACAO.max}
          step={DURACAO.passo}
          value={duracao}
          onChange={(e) => setDuracao(Number(e.target.value))}
          onPointerUp={() => duracao !== p.duracao && p.mudar({ duracao })}
          onKeyUp={() => duracao !== p.duracao && p.mudar({ duracao })}
          className="accent-coral"
        />
        <div className="flex justify-between text-[9.5px] text-fog tabular-nums">
          <span>{s(DURACAO.min)}</span>
          <span>{s(DURACAO.max)}</span>
        </div>
      </div>

      <div className="grid gap-2 border-t border-line-dark pt-3">
        <button
          onClick={() => p.salvarPadrao({ curva: p.curva, duracao })}
          disabled={ePadrao}
          className="flex w-fit items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-[11px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-40"
          title="Os outros inserts deste vídeo (os que não têm entrada própria) passam a usar esta curva e esta duração"
        >
          <Save className="size-3.5" /> Salvar como padrão do vídeo
        </button>
        {p.ajustada && (
          <button onClick={() => p.mudar({ curva: null, duracao: null })} className="flex w-fit items-center gap-1 text-[11px] text-fog hover:text-cream">
            <RotateCcw className="size-3" /> Usar o padrão neste insert
          </button>
        )}
      </div>
    </div>
  )
}
