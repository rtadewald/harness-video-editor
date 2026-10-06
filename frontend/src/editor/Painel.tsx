import { formatarTempo, type DadosEditor, type Etapa, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import type { Sequencia } from './sequencia'

type Props = { etapa: Exclude<Etapa, 'cortes'>; dados: DadosEditor; seq: Sequencia; tempo: number; buscar: (s: number) => void }

/** Painel das etapas ainda simuladas (Enriquecimento, Motion, Áudio, Legenda): Cortes, Direção e Inserts têm telas próprias. */
export default function Painel({ etapa, dados, seq, tempo, buscar }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col text-cream">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {etapa === 'legenda' ? (
          <Lista itens={dados.timeline.LEG.map((l) => ({ ...l, rotulo: l.texto }))} seq={seq} tempo={tempo} buscar={buscar} palavras={[]} />
        ) : (
          <Lista
            itens={dados.timeline[etapa === 'inserts' || etapa === 'enriquecimento' || etapa === 'audio' ? 'V2' : 'V3'].map((i) => ({
              ...i,
              rotulo: etapa === 'enriquecimento' ? `Card + zoom leve · ${i.rotulo}` : etapa === 'audio' ? `Whoosh na entrada · ${i.rotulo}` : i.rotulo,
            }))}
            seq={seq}
            tempo={tempo}
            buscar={buscar}
            palavras={dados.palavras}
          />
        )}
      </div>
    </section>
  )
}

type ItemLista = { id: string; rotulo: string; palavra_ini: string; palavra_fim: string }

function Lista({ itens, seq, tempo, buscar, palavras }: { itens: ItemLista[]; seq: Sequencia; tempo: number; buscar: (s: number) => void; palavras: Palavra[] }) {
  const trecho = (i: ItemLista) => {
    const a = palavras.findIndex((p) => p.id === i.palavra_ini)
    const b = palavras.findIndex((p) => p.id === i.palavra_fim)
    return palavras.slice(a, b + 1).map((p) => p.texto).join(' ')
  }
  return (
    <ul className="border-t border-line-dark">
      {itens.map((item, n) => {
        const r = seq.intervalo(item)
        const atual = r && tempo >= r.ini && tempo < r.fim
        return (
          <li key={item.id}>
            <button
              onClick={() => r && buscar(r.ini + 0.02)}
              className={cn(
                'grid w-full grid-cols-[36px_1fr_auto] items-baseline gap-3 border-b border-line-dark py-4 pr-2 pl-3 text-left transition-[background,padding] duration-300 hover:bg-cream/5 hover:pl-5',
                atual && 'bg-cream/10',
              )}
            >
              <span className="text-[10px] text-fog">{String(n + 1).padStart(2, '0')} /</span>
              <span>
                <span className="block text-[17px] tracking-[-0.03em]">{item.rotulo}</span>
                {palavras.length > 0 && <span className="mt-1 block text-[12px] leading-[1.6] text-fog">“{trecho(item)}”</span>}
              </span>
              <span className={cn('text-[9px] tracking-[0.1em] tabular-nums', r ? 'text-fog' : 'text-coral')}>
                {r ? `${formatarTempo(r.ini)} → ${formatarTempo(r.fim)}` : 'ÓRFÃO'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
