import type { ReactNode } from 'react'
import { Construction } from 'lucide-react'
import type { Resumo } from './resumos'

/** O cartão "em construção" de uma tela ou página que ainda vai ser feita. */
export function CartaoEmConstrucao({ resumo, aviso }: { resumo: Resumo; aviso?: string }) {
  return (
    <section className="grid content-start gap-4 rounded-[4px] border border-line-dark bg-deeper/60 p-6 text-cream">
      <p className="eyebrow flex items-center gap-2 text-yellow">
        <Construction className="size-3.5" aria-hidden /> Em construção · {resumo.fase}
      </p>
      <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">{resumo.titulo}</h2>
      <p className="text-[14px] leading-[1.6] text-[#dfe7dc]">{resumo.frase}</p>
      {aviso && <p className="rounded-[3px] border border-yellow/40 bg-yellow/10 px-3 py-2 text-[12.5px] leading-[1.6] text-yellow">{aviso}</p>}
      <div className="grid gap-2">
        <p className="eyebrow text-sage">O que virá</p>
        <ul className="grid gap-2.5 text-[13px] leading-[1.6] text-fog">
          {resumo.itens.map((i) => (
            <li key={i} className="grid grid-cols-[14px_1fr] gap-1.5">
              <span className="text-coral">↗</span>
              {i}
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line-dark pt-3 text-[11px] text-fog">
        Especificação em <code className="text-cream">{resumo.doc}</code>
      </p>
    </section>
  )
}

/** Uma etapa ainda em construção: a prévia do projeto (o vídeo cortado) no centro e o cartão do que virá ao lado. */
export default function EtapaEmConstrucao({ resumo, aviso, previa }: { resumo: Resumo; aviso?: string; previa: ReactNode }) {
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_clamp(320px,30vw,440px)] gap-6 overflow-hidden px-6 py-6">
      <div className="min-h-0">{previa}</div>
      <div className="min-h-0 overflow-y-auto">
        <CartaoEmConstrucao resumo={resumo} aviso={aviso} />
      </div>
    </div>
  )
}
