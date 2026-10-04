import { useEffect, useState } from 'react'
import { lerEstatisticas, type EstatTipo, type Estatisticas, type Resumo } from '@/api'
import { cn } from '@/lib/utils'

const s = (v: number) => `${v.toFixed(1).replace('.', ',')} s`
const pct = (v: number) => `${Math.round(v * 100)}%`
const ONDE: Record<string, string> = { na_pausa: 'na pausa', entre_palavras: 'entre palavras', dentro_da_palavra: 'dentro da palavra', sem_fala: 'sem fala', depois_da_fala: 'depois da fala' }

/** Números das referências (SPEC §8.2.1), calculados por código: é o que a Direção visual vai receber como "seu jeito". */
export default function EstatisticasReferencias({ revisadas }: { revisadas: number }) {
  const [todas, setTodas] = useState(revisadas === 0)
  const [e, setE] = useState<Estatisticas | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    lerEstatisticas(todas).then(setE).catch((x) => setErro(x.message))
  }, [todas, revisadas])

  const planos = e?.tipos.filter((t) => t.camada === 'plano') ?? []
  const elementos = e?.tipos.filter((t) => t.camada === 'elemento') ?? []

  return (
    <section className="mt-12 border-t border-line-dark pt-6">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="eyebrow text-sage">Estatísticas</p>
        <div role="tablist" className="flex gap-1 text-[11px] font-semibold">
          <button role="tab" aria-selected={!todas} onClick={() => setTodas(false)} className={cn('rounded-full px-3 py-1', !todas ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
            Só revisadas ({revisadas})
          </button>
          <button role="tab" aria-selected={todas} onClick={() => setTodas(true)} className={cn('rounded-full px-3 py-1', todas ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
            Prévia com as não revisadas
          </button>
        </div>
        {todas && <p className="text-[11px] text-yellow">Prévia: inclui análises da IA ainda não conferidas.</p>}
      </div>

      {erro && <p className="text-coral">{erro}</p>}
      {e && e.videos === 0 && <p className="text-[12px] text-fog">Nenhuma referência revisada ainda. Marque uma como revisada para os números aparecerem aqui.</p>}
      {e && e.videos > 0 && (
        <div className="grid gap-8">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <Numero rotulo="Vídeos" valor={String(e.videos)} />
            <Numero rotulo="Duração somada" valor={`${Math.round(e.duracao_total / 6) / 10} min`.replace('.', ',')} />
            <Numero rotulo="Trocas de plano por minuto" valor={e.trocas_por_minuto?.toFixed(1).replace('.', ',') ?? '—'} />
            {e.full_ator_seguido && (
              <Numero rotulo="Full ator seguido" valor={`${s(e.full_ator_seguido.mediana)} típico · ${s(e.full_ator_seguido.max)} no máximo`} />
            )}
          </div>

          <Tabela titulo="Planos-base" tipos={planos} proporcao />
          {elementos.length > 0 && <Tabela titulo="Elementos" tipos={elementos} />}

          <p className="max-w-[760px] text-[11px] leading-[1.7] text-fog">
            <b className="text-cream">Como ler:</b> duração típica é a mediana (entre parênteses, de 10% a 90% dos casos). “Entra” diz onde o item começa
            em relação à fala: numa pausa (≥ 150 ms sem fala), entre palavras coladas ou no meio de uma palavra, e se é no começo ou no meio de uma frase.
            “Da palavra” é quantos ms antes (−) ou depois (+) do começo da palavra mais próxima. O primeiro plano de cada vídeo não conta para a entrada.
          </p>
        </div>
      )}
    </section>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{rotulo}</p>
      <p className="mt-1 text-[20px] font-semibold tracking-[-0.03em] tabular-nums">{valor}</p>
    </div>
  )
}

const faixa = (r: Resumo) => `${s(r.mediana)} (${s(r.p10)}–${s(r.p90)})`

function distribuicao(d: Record<string, number>, nomes?: Record<string, string>) {
  const total = Object.values(d).reduce((a, b) => a + b, 0)
  if (!total) return '—'
  return Object.entries(d)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${pct(v / total)} ${nomes?.[k] ?? k}`)
    .join(' · ')
}

function Tabela({ titulo, tipos, proporcao }: { titulo: string; tipos: EstatTipo[]; proporcao?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-[13px] font-semibold">{titulo}</p>
      <table className="w-full min-w-[860px] border-collapse text-left text-[12px] tabular-nums">
        <thead className="text-[10px] tracking-[0.08em] text-fog uppercase">
          <tr className="border-b border-line-dark">
            <th className="py-2 pr-4 font-semibold">Tipo</th>
            <th className="py-2 pr-4 font-semibold">Vezes</th>
            <th className="py-2 pr-4 font-semibold">Por min</th>
            <th className="py-2 pr-4 font-semibold">Duração típica</th>
            {proporcao && <th className="py-2 pr-4 font-semibold">Do tempo</th>}
            <th className="py-2 pr-4 font-semibold">Entra</th>
            <th className="py-2 pr-4 font-semibold">Na frase</th>
            <th className="py-2 pr-4 font-semibold">Da palavra</th>
            {!proporcao && <th className="py-2 font-semibold">Textos</th>}
          </tr>
        </thead>
        <tbody>
          {tipos.map((t) => (
            <tr key={t.chave} className="border-b border-line-dark/60 align-top">
              <td className="py-2.5 pr-4 font-semibold">{t.nome}</td>
              <td className="py-2.5 pr-4">{t.duracao.n}</td>
              <td className="py-2.5 pr-4">{t.por_minuto?.toFixed(1).replace('.', ',')}</td>
              <td className="py-2.5 pr-4">{faixa(t.duracao)}</td>
              {proporcao && <td className="py-2.5 pr-4">{t.proporcao != null ? pct(t.proporcao) : '—'}</td>}
              <td className="py-2.5 pr-4 text-fog">{distribuicao(t.entrada_onde, ONDE)}</td>
              <td className="py-2.5 pr-4 text-fog">{distribuicao(t.entrada_frase, { inicio: 'no começo', meio: 'no meio' })}</td>
              <td className="py-2.5 pr-4 text-fog">{t.ms_palavra ? `${t.ms_palavra.mediana > 0 ? '+' : ''}${Math.round(t.ms_palavra.mediana)} ms` : '—'}</td>
              {!proporcao && <td className="py-2.5 text-fog">{t.textos.length ? t.textos.map((x) => `“${x}”`).join(', ') : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
