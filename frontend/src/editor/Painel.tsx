import { formatarDuracao, formatarTempo, type DadosEditor, type Etapa, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import type { Sequencia } from './sequencia'

type Props = { etapa: Etapa; dados: DadosEditor; seq: Sequencia; tempo: number; buscar: (s: number) => void }

/** Painel da etapa aberta. Na fase 2 todos mostram dados simulados. */
export default function Painel({ etapa, dados, seq, tempo, buscar }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col text-cream">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {etapa === 'cortes' && <Transcricao palavras={dados.palavras} seq={seq} tempo={tempo} buscar={buscar} />}
        {etapa === 'legenda' ? (
          <Lista itens={dados.timeline.LEG.map((l) => ({ ...l, rotulo: l.texto }))} seq={seq} tempo={tempo} buscar={buscar} palavras={[]} />
        ) : (
          etapa !== 'cortes' && <Lista itens={dados.timeline[etapa === 'inserts' ? 'V2' : 'V3']} seq={seq} tempo={tempo} buscar={buscar} palavras={dados.palavras} />
        )}
        {etapa === 'inserts' && <Apoios dados={dados} />}
      </div>
    </section>
  )
}

/** Transcrição inteira: o que sai fica riscado. Pausas longas quebram a linha (cada tentativa na sua). */
function Transcricao({ palavras, seq, tempo, buscar }: { palavras: Palavra[]; seq: Sequencia; tempo: number; buscar: (s: number) => void }) {
  const linhas: Palavra[][] = []
  palavras.forEach((p, i) => {
    if (i === 0 || p.inicio - palavras[i - 1].fim > 0.8) linhas.push([])
    linhas[linhas.length - 1].push(p)
  })

  return (
    <div className="grid gap-3 text-[17px] leading-[1.7] tracking-[-0.01em]">
      {linhas.map((linha) => (
        <p key={linha[0].id}>
          {linha.map((p) => {
            const ini = seq.fonteParaSaida(p.inicio + 0.001)
            const fim = seq.fonteParaSaida(p.fim - 0.001)
            const sai = ini == null
            const atual = !sai && fim != null && tempo >= ini && tempo < fim
            return (
              <span key={p.id}>
                <button
                  onClick={() => !sai && buscar(ini + 0.02)}
                  title={sai ? `${p.id} · cortada` : `${p.id} · ${formatarTempo(ini)}`}
                  className={cn(
                    'rounded-[2px] px-0.5 transition-colors',
                    sai ? 'cursor-default text-fog/45 line-through decoration-coral decoration-[1.5px]' : 'hover:bg-cream/10',
                    atual && 'bg-yellow text-ink hover:bg-yellow',
                  )}
                >
                  {p.texto}
                </button>{' '}
              </span>
            )
          })}
        </p>
      ))}
    </div>
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

function Apoios({ dados }: { dados: DadosEditor }) {
  const apoios = dados.projeto.fontes.filter((f) => f.papel === 'apoio')
  return (
    <div className="mt-8">
      <p className="eyebrow mb-3 text-sage">Apoios do projeto</p>
      {apoios.length ? (
        <ul className="grid gap-2 text-[13px]">
          {apoios.map((f) => (
            <li key={f.id} className="flex justify-between border-b border-line-dark pb-2">
              <span>{f.nome_original}</span>
              <span className="text-fog">{formatarDuracao(f.duracao)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-fog">Nenhum apoio subido. Os inserts acima usam nomes de exemplo.</p>
      )}
    </div>
  )
}
