import { useRef } from 'react'
import { enviar } from '@/api'
import { cn } from '@/lib/utils'

const ATALHOS = [1, 1.1, 1.2, 1.3]
const nome = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 2 })}×`

/** A aceleração do vídeo do ator (pedido de Rodrigo, out/2026): de 1× a 1,5×, com atalhos e o ajuste fino. Muda o tempo
 *  do vídeo final inteiro; os planos, os inserts e a legenda seguem as palavras. A prévia muda na hora (`ver`) e o
 *  servidor recebe quando o ajuste para. */
export default function PainelVelocidade(p: { projetoId: string; velocidade: number; ver: (v: number) => void }) {
  const salvar = useRef(0)
  const mudar = (v: number, ja = false) => {
    const n = Math.round(Math.min(Math.max(v, 1), 1.5) * 100) / 100
    p.ver(n)
    window.clearTimeout(salvar.current)
    salvar.current = window.setTimeout(
      () => void enviar('PUT', `/api/projetos/${p.projetoId}/velocidade`, { campos: { velocidade: n } }).catch((e) => window.alert((e as Error).message)),
      ja ? 0 : 400,
    )
  }
  return (
    <section className="grid content-start gap-4 rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
      <div className="grid gap-1">
        <p className="eyebrow text-sage">Velocidade do ator</p>
        <p className="text-[12px] leading-[1.6] text-fog">Acelera a fala no vídeo inteiro (o tom da voz não muda). Os planos, os inserts e a legenda acompanham as palavras.</p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {ATALHOS.map((v) => (
          <button
            key={v}
            onClick={() => mudar(v, true)}
            className={cn('rounded-[6px] py-2 text-[12.5px] font-semibold tabular-nums ring-1', Math.abs(p.velocidade - v) < 0.001 ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}
          >
            {nome(v)}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5">
        <span className="flex text-[11px] text-fog">
          Ajuste fino <b className="ml-auto font-semibold text-cream tabular-nums">{nome(p.velocidade)}</b>
        </span>
        <input type="range" min={100} max={150} step={5} value={Math.round(p.velocidade * 100)} onChange={(e) => mudar(Number(e.target.value) / 100)} className="accent-coral" />
      </label>
    </section>
  )
}
