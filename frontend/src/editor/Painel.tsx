import { Link } from 'react-router-dom'
import { formatarDuracao, formatarTempo, type DadosEditor, type Etapa, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import type { Sequencia } from './sequencia'

type Props = { etapa: Exclude<Etapa, 'cortes'>; dados: DadosEditor; seq: Sequencia; tempo: number; buscar: (s: number) => void }

/** Painel da etapa aberta. Na fase 2 todos mostram dados simulados. */
export default function Painel({ etapa, dados, seq, tempo, buscar }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col text-cream">
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {etapa === 'direcao' && <AvisoDirecao />}
        {etapa === 'direcao' ? (
          <Lista
            itens={dados.timeline.DIR.map((d) => ({ ...d, rotulo: `${d.camada === 'elemento' ? '＋ ' : ''}${d.rotulo}${d.descricao ? ` · ${d.descricao}` : ''}` }))}
            seq={seq}
            tempo={tempo}
            buscar={buscar}
            palavras={dados.palavras}
          />
        ) : etapa === 'legenda' ? (
          <Lista itens={dados.timeline.LEG.map((l) => ({ ...l, rotulo: l.texto }))} seq={seq} tempo={tempo} buscar={buscar} palavras={[]} />
        ) : (
          <Lista itens={dados.timeline[etapa === 'inserts' ? 'V2' : 'V3']} seq={seq} tempo={tempo} buscar={buscar} palavras={dados.palavras} />
        )}
        {etapa === 'inserts' && <Apoios dados={dados} />}
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

/** A Direção visual real só chega depois das Referências (SPEC §8.2.2); até lá, aviso + dados de exemplo. */
function AvisoDirecao() {
  return (
    <div className="mb-5 grid gap-1.5 border-l-2 border-yellow pl-3 text-[12px] leading-[1.6] text-fog">
      <p>
        <b className="text-cream">Simulado.</b> Planos-base (Full ator, Insert tela cheia, Motion tela cheia, Tela dividida) e elementos (＋) de exemplo. A
        direção de verdade vai aprender com seus vídeos de referência revisados.
      </p>
      <Link to="/referencias" className="w-fit font-semibold text-yellow hover:underline">
        Abrir Referências ↗
      </Link>
    </div>
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
