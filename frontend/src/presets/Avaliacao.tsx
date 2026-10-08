import { PROPORCOES, TELAS, type Sim } from '@/editor/Simulacao'
import { AJUSTES, rapidosDe } from '@/editor/ajustes'
import EscolhaSons from '@/editor/EscolhaSons'
import { NOME_MOMENTO, momentosDaReceita, type SomMomento } from '@/editor/sons'
import { editarPreset, PROPORCOES_USO, usosDe, type Preset, type Proporcao, type Usos } from '@/editor/presets'
import { chip } from './comum'

/** Simular o preset numa situação de uso: o original (a referência), o modo de tela, quantas mídias e as proporções.
 *  Só aparecem as telas e os números de mídias em que o preset vale (`usos`). */
export function Simulador({ preset, sim, setSim }: { preset: Preset; sim: Sim | null; setSim: (s: Sim | null) => void }) {
  const u = usosDe(preset)
  const telas = TELAS.filter((t) => u.telas.includes(t.id))
  const ns = (['1', '2', '2+'] as const).filter((m) => u.midias.includes(m)).map((m) => (m === '1' ? 1 : m === '2' ? 2 : 3))
  // só as proporções em que o preset vale (com várias mídias, a mista pede em pé e horizontal)
  const vale = (id: string) => {
    const ok = (x: Proporcao) => !u.proporcoes || u.proporcoes.includes(x)
    return id === 'pe' ? ok('pe') : id === '1:1' ? ok('quadrada') : id === 'mista' ? ok('pe') && ok('deitada') : ok('deitada')
  }
  const props = (n: number) => PROPORCOES(n).filter((x) => vale(x.id))
  const n0 = ns[0] ?? 1
  const base: Sim = sim ?? { tela: telas[0]?.id ?? 'dividida', n: n0, prop: props(n0).at(-1)?.id ?? '16:9' }
  const muda = (c: Partial<Sim>) => {
    const novo = { ...base, ...c }
    if (!props(novo.n).some((x) => x.id === novo.prop)) novo.prop = props(novo.n).at(-1)?.id ?? (novo.n === 1 ? '16:9' : 'deitada')
    setSim(novo)
  }
  return (
    <div className="grid gap-2.5 rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
      <p className="eyebrow text-sage">Simular</p>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setSim(null)} className={chip(!sim)} title="Como na referência">
          Original
        </button>
        {telas.map((t) => (
          <button key={t.id} onClick={() => muda({ tela: t.id })} className={chip(!!sim && base.tela === t.id)}>
            {t.nome}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ns.map((n) => (
          <button key={n} onClick={() => muda({ n })} className={chip(!!sim && base.n === n)}>
            {n === 1 ? '1 mídia' : n === 2 ? '2 mídias' : '3 ou mais'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {props(base.n).map((x) => (
          <button key={x.id} onClick={() => muda({ prop: x.id })} className={chip(!!sim && base.prop === x.id)}>
            {x.nome}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Os sons do preset (SPEC §8.6): em cada momento que a receita tem (a entrada de cada card, a troca, a saída, o
 *  mergulho), qual som e com que intensidade. Vale para todos os inserts que usam o preset (no insert, o ajuste rápido
 *  Som só abaixa, aumenta ou tira). */
export function SonsDoPreset({ preset }: { preset: Preset }) {
  const r = preset.receita
  const linhas = momentosDaReceita(r).map((m) => {
    const s = r.sons?.find((x) => x.momento === m)
    return { chave: m, nome: NOME_MOMENTO[m], som: s?.som ?? null, intensidade: s?.intensidade ?? ('baixo' as const), atraso: s?.atraso ?? 0 }
  })
  const mudar = (chave: string, m: Partial<SomMomento>) => {
    const base = linhas.find((l) => l.chave === chave)!
    const novo = { momento: chave as SomMomento['momento'], som: base.som, intensidade: base.intensidade, atraso: base.atraso, ...m }
    const sons = [...(r.sons ?? []).filter((x) => x.momento !== chave), novo]
    void editarPreset(preset.id, { receita: { ...r, sons } }).catch((x) => window.alert((x as Error).message))
  }
  return (
    <div className="grid gap-3 rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
      <p className="eyebrow text-sage">Sons</p>
      <EscolhaSons linhas={linhas} mudar={mudar} ajusteFino />
    </div>
  )
}

/** Onde o preset vale (só aparece no Enriquecimento nessas situações) e quais ajustes rápidos aparecem no insert. */
export function OndeVale({ preset }: { preset: Preset }) {
  const u = usosDe(preset)
  const salvar = (novo: Usos) => void editarPreset(preset.id, { usos: novo }).catch((x) => window.alert((x as Error).message))
  const alterna = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v])
  const rapidos = rapidosDe(preset)
  return (
    <div className="grid gap-3 rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
      <p className="eyebrow text-sage">Vale em</p>
      <div className="flex flex-wrap gap-1.5">
        {TELAS.map((t) => (
          <button key={t.id} onClick={() => salvar({ ...u, telas: alterna(u.telas, t.id) })} className={chip(u.telas.includes(t.id))}>
            {t.nome}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['1', '2', '2+'] as const).map((m) => (
          <button key={m} onClick={() => salvar({ ...u, midias: alterna(u.midias, m) })} className={chip(u.midias.includes(m))}>
            {m === '1' ? '1 mídia' : m === '2' ? '2 mídias' : '3 ou mais'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROPORCOES_USO.map((x) => {
          const atuais = u.proporcoes ?? PROPORCOES_USO.map((y) => y.id)
          return (
            <button key={x.id} onClick={() => salvar({ ...u, proporcoes: alterna(atuais, x.id) })} className={chip(atuais.includes(x.id))}>
              {x.nome}
            </button>
          )
        })}
      </div>
      <p className="eyebrow mt-1 text-sage">Ajustes na edição do insert</p>
      <div className="flex flex-wrap gap-1.5">
        {AJUSTES.filter((a) => a.id !== 'som').map((a) => (
          <button
            key={a.id}
            onClick={() => void editarPreset(preset.id, { rapidos: rapidos.includes(a.id) ? rapidos.filter((x) => x !== a.id) : [...rapidos, a.id] })}
            className={chip(rapidos.includes(a.id))}
          >
            {a.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
