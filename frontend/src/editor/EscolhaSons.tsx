import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NOME_INTENSIDADE, eventoNoTempo, tocarEvento, useCatalogoSons, type Intensidade, type SomCatalogo } from './sons'

/** Um momento de som para escolher: qual som (ou nenhum), a intensidade e, opcional, o ajuste fino de quando o golpe cai. */
export type LinhaSom = { chave: string; nome: string; som: string | null; intensidade: Intensidade; atraso?: number }

/** Os momentos de som de um preset (de enriquecimento ou de motion), um por linha: o select com a biblioteca agrupada
 *  por família, Baixo · Médio e ▶ para ouvir na intensidade escolhida (SPEC §8.6). */
export default function EscolhaSons(p: { linhas: LinhaSom[]; mudar: (chave: string, m: Partial<Omit<LinhaSom, 'chave' | 'nome'>>) => void; ajusteFino?: boolean }) {
  const cat = useCatalogoSons()
  const familias = new Map<string, SomCatalogo[]>()
  for (const s of cat?.sons ?? []) familias.set(s.familia, [...(familias.get(s.familia) ?? []), s])
  if (cat && !cat.sons.length) return <p className="text-[11.5px] leading-[1.6] text-fog">A biblioteca de sons está vazia (rode ferramentas/sons_biblioteca.py com os arquivos em sons/).</p>
  return (
    <div className="grid gap-3 text-[12px]">
      {p.linhas.map((l) => (
        <div key={l.chave} className="grid gap-1.5">
          <span className="text-[11px] text-fog">{l.nome}</span>
          {/* numa coluna estreita, a intensidade e o ▶ descem para a linha de baixo */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={l.som ?? ''}
              onChange={(e) => p.mudar(l.chave, { som: e.target.value || null })}
              className="h-8 min-w-[150px] flex-1 rounded-[6px] bg-cream/[0.06] px-2 text-[12px] text-cream ring-1 ring-line-dark outline-none"
            >
              <option value="">Nenhum</option>
              {[...familias].map(([f, l2]) => (
                <optgroup key={f} label={f}>
                  {l2.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className={cn('flex shrink-0 rounded-full p-0.5 ring-1 ring-line-dark', !l.som && 'opacity-40')}>
              {(['baixo', 'medio'] as const).map((i) => (
                <button
                  key={i}
                  disabled={!l.som}
                  onClick={() => p.mudar(l.chave, { intensidade: i })}
                  className={cn('rounded-full px-3 py-1 text-[11.5px] font-semibold', l.intensidade === i ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
                >
                  {NOME_INTENSIDADE[i]}
                </button>
              ))}
            </div>
            <button
              disabled={!l.som || !cat}
              onClick={() => {
                const e = cat && eventoNoTempo({ som: l.som, intensidade: l.intensidade, atraso: 0 }, 0, cat)
                if (e) void tocarEvento({ ...e, t: 0, desde: 0 }, 0, false)
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full text-fog ring-1 ring-line-dark hover:text-cream disabled:opacity-30"
              title="Ouvir (na intensidade escolhida)"
              aria-label="Ouvir"
            >
              <Play className="size-3.5" />
            </button>
          </div>
          {p.ajusteFino && l.som && (
            <label className="flex items-center gap-2 text-[10.5px] text-fog" title="Quando o golpe do som cai em relação ao momento (dois cliques: volta ao zero)">
              Quando cai
              <input
                type="range"
                min={-0.6}
                max={1.6}
                step={0.02}
                defaultValue={l.atraso ?? 0}
                key={`${l.chave}${l.atraso}`}
                onPointerUp={(e) => p.mudar(l.chave, { atraso: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => p.mudar(l.chave, { atraso: Number((e.target as HTMLInputElement).value) })}
                onDoubleClick={() => p.mudar(l.chave, { atraso: 0 })}
                className="flex-1 accent-coral"
              />
              <span className="w-12 text-right text-cream tabular-nums">{(l.atraso ?? 0) >= 0 ? '+' : ''}{(l.atraso ?? 0).toFixed(2)} s</span>
            </label>
          )}
        </div>
      ))}
    </div>
  )
}
