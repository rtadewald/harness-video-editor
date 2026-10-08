import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import IconeCurva from './IconeCurva'
import { PRESETS_CURVA, iguais } from './enriquecimento'
import { NOME_PROP, editarPreset, previaPreset, type CardReceita, type Estado, type Preset, type Propriedade, type Receita } from './presets'

type Faixa = { rotulo: string; min: number; max: number; passo: number; un: string }
const REPOUSO: Partial<Record<keyof CardReceita['repouso'], Faixa>> = {
  cx: { rotulo: 'Centro (horizontal)', min: -20, max: 120, passo: 0.5, un: '%' },
  cy: { rotulo: 'Centro (vertical)', min: -20, max: 120, passo: 0.5, un: '%' },
  w: { rotulo: 'Largura', min: 10, max: 160, passo: 0.5, un: '%' },
  h: { rotulo: 'Altura', min: 10, max: 160, passo: 0.5, un: '%' },
  rot: { rotulo: 'Inclinação', min: -30, max: 30, passo: 0.5, un: '°' },
  rx: { rotulo: 'Perspectiva (vertical)', min: -60, max: 60, passo: 1, un: '°' },
  ry: { rotulo: 'Perspectiva (horizontal)', min: -60, max: 60, passo: 1, un: '°' },
  raio: { rotulo: 'Cantos', min: 0, max: 15, passo: 0.25, un: '%' },
}
const ESTADO: Record<keyof Estado, Faixa> = {
  dx: { rotulo: 'Deslocamento horizontal', min: -150, max: 150, passo: 1, un: '%' },
  dy: { rotulo: 'Deslocamento vertical', min: -150, max: 150, passo: 1, un: '%' },
  escala: { rotulo: 'Escala', min: 0.3, max: 2, passo: 0.01, un: '×' },
  rot: { rotulo: 'Giro', min: -45, max: 45, passo: 0.5, un: '°' },
  rx: { rotulo: 'Giro 3D (vertical)', min: -80, max: 80, passo: 1, un: '°' },
  ry: { rotulo: 'Giro 3D (horizontal)', min: -80, max: 80, passo: 1, un: '°' },
  opacidade: { rotulo: 'Opacidade', min: 0, max: 1, passo: 0.01, un: '' },
  desfoque: { rotulo: 'Desfoque', min: 0, max: 60, passo: 0.5, un: 'px' },
}
const fmt = (v: number, f: Faixa) => `${f.passo < 0.1 ? v.toFixed(2) : f.passo < 1 ? v.toFixed(1) : Math.round(v)}${f.un ? ' ' + f.un : ''}`.replace('.', ',')

/** A engrenagem de um preset: muda a receita (vale para todos os inserts que usam o preset). Os sliders mudam a prévia
 *  na hora e salvam ao soltar. */
export default function EditorPreset(p: { preset: Preset; ver?: () => void }) {
  const [k, setK] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const r = p.preset.receita
  const c = r.cards[Math.min(k, r.cards.length - 1)]
  const mudar = (novo: Receita, salvar: boolean) => {
    previaPreset(p.preset.id, novo)
    if (salvar)
      editarPreset(p.preset.id, { receita: novo })
        .then(() => setErro(null))
        .catch((e) => setErro((e as Error).message))
  }
  const mudarCard = (f: (c: CardReceita) => CardReceita, salvar = true) => mudar({ ...r, cards: r.cards.map((x, j) => (j === k ? f(x) : x)) }, salvar)

  return (
    <div className="grid gap-5 text-[12px]">
      <div className="flex items-center gap-2">
        <input
          key={p.preset.nome}
          defaultValue={p.preset.nome}
          onBlur={(e) => e.target.value.trim() && e.target.value !== p.preset.nome && void editarPreset(p.preset.id, { nome: e.target.value.trim() }).catch((x) => setErro((x as Error).message))}
          className="min-w-0 flex-1 rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] font-semibold text-cream outline-none hover:border-line-dark focus:border-cream/50"
        />
        {p.ver && (
          <button onClick={p.ver} className="flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[11px] text-fog hover:text-cream">
            <Play className="size-3 fill-current" /> Ver
          </button>
        )}
      </div>
      <p className="-mt-2 text-[10.5px] leading-[1.5] text-fog">Vale para todos os inserts com este preset.</p>
      {r.cards.length > 1 && (
        <div className="flex gap-1">
          {r.cards.map((_, j) => (
            <button key={j} onClick={() => setK(j)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', j === k ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}>
              {j + 1}ª mídia
            </button>
          ))}
        </div>
      )}

      <Secao titulo="Tempo">
        <Slider f={{ rotulo: 'Começa em (fração do insert)', min: 0, max: 0.9, passo: 0.01, un: '' }} v={c.inicio_frac} mudar={(v, s) => mudarCard((x) => ({ ...x, inicio_frac: v }), s)} />
        <Slider f={{ rotulo: 'Sai antes do fim', min: 0, max: 5, passo: 0.05, un: 's' }} v={c.sai_antes_do_fim} mudar={(v, s) => mudarCard((x) => ({ ...x, sai_antes_do_fim: v }), s)} />
      </Secao>

      <Secao titulo="Onde fica">
        {(Object.keys(REPOUSO) as (keyof CardReceita['repouso'])[]).map((key) => (
          <Slider key={key} f={REPOUSO[key]!} v={c.repouso[key] as number} mudar={(v, s) => mudarCard((x) => ({ ...x, repouso: { ...x.repouso, [key]: v } }), s)} />
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={c.repouso.sombra} onChange={(e) => mudarCard((x) => ({ ...x, repouso: { ...x.repouso, sombra: e.target.checked } }))} /> Sombra
        </label>
        <div className="flex gap-1 text-[11px]">
          {(['cover', 'topo', 'contain'] as const).map((a) => (
            <button key={a} onClick={() => mudarCard((x) => ({ ...x, ajuste: a }))} className={cn('rounded-full px-2.5 py-0.5 ring-1', c.ajuste === a ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark')}>
              {a === 'cover' ? 'Preenche' : a === 'topo' ? 'Preenche pelo topo' : 'Inteira'}
            </button>
          ))}
        </div>
      </Secao>

      {(['entrada', 'saida'] as const).map((lado) => {
        const m = c[lado]
        const chave = lado === 'entrada' ? 'de' : 'para'
        return (
          <Secao key={lado} titulo={lado === 'entrada' ? 'Entrada' : 'Saída'}>
            <label className="flex cursor-pointer items-center gap-2 text-[11.5px]">
              <input
                type="checkbox"
                checked={!m}
                onChange={(e) =>
                  mudarCard((x) => ({
                    ...x,
                    [lado]: e.target.checked
                      ? null
                      : { duracao: 0.5, [chave]: { dx: 0, dy: lado === 'entrada' ? 30 : -30, escala: 1, rot: 0, rx: 0, ry: 0, opacidade: 0, desfoque: 0 }, curvas: { pos: [0.16, 1, 0.3, 1] }, atraso: {}, dur: {} },
                  }))
                }
              />{' '}
              {lado === 'entrada' ? 'Seca (aparece de uma vez)' : 'Seca (some de uma vez)'}
            </label>
            {m && (
              <>
                <Slider f={{ rotulo: 'Duração', min: 0.1, max: 3, passo: 0.02, un: 's' }} v={m.duracao} mudar={(v, s) => mudarCard((x) => ({ ...x, [lado]: { ...x[lado]!, duracao: v } }), s)} />
                <p className="eyebrow mt-1 text-sage">{lado === 'entrada' ? 'Começa assim (em relação ao repouso)' : 'Termina assim (em relação ao repouso)'}</p>
                {(Object.keys(ESTADO) as (keyof Estado)[]).map((key) => (
                  <Slider
                    key={key}
                    f={ESTADO[key]}
                    v={(m as unknown as Record<string, Estado>)[chave][key]}
                    mudar={(v, s) => mudarCard((x) => ({ ...x, [lado]: { ...x[lado]!, [chave]: { ...(x[lado] as unknown as Record<string, Estado>)[chave], [key]: v } } }), s)}
                  />
                ))}
                <p className="eyebrow mt-1 text-sage">Curvas (medidas na referência)</p>
                {(Object.keys(m.curvas) as Propriedade[]).map((prop) => (
                  <div key={prop} className="grid gap-1">
                    <span className="text-[11px] text-fog">{NOME_PROP[prop]}</span>
                    <div className="flex flex-wrap gap-1">
                      <span className="grid place-items-center rounded-[6px] px-1 py-0.5 text-[9.5px] text-cream ring-2 ring-coral" title={`Atual: ${m.curvas[prop]!.join(', ')}`}>
                        <IconeCurva curva={m.curvas[prop]!} />
                        {PRESETS_CURVA.find((x) => iguais(x.curva, m.curvas[prop]!))?.nome ?? 'medida'}
                      </span>
                      {PRESETS_CURVA.filter((x) => !iguais(x.curva, m.curvas[prop]!)).map((x) => (
                        <button
                          key={x.nome}
                          onClick={() => mudarCard((y) => ({ ...y, [lado]: { ...y[lado]!, curvas: { ...y[lado]!.curvas, [prop]: x.curva } } }))}
                          className="grid place-items-center rounded-[6px] px-1 py-0.5 text-[9.5px] text-fog ring-1 ring-line-dark hover:text-cream"
                        >
                          <IconeCurva curva={x.curva} />
                          {x.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </Secao>
        )
      })}
      {erro && <p className="text-[11px] text-coral">{erro}</p>}
    </div>
  )
}

function Secao(p: { titulo: string; children: React.ReactNode }) {
  return (
    <details open className="group grid gap-2 pt-1">
      <summary className="eyebrow cursor-pointer list-none text-sage">{p.titulo}</summary>
      <div className="mt-2 grid gap-2.5">{p.children}</div>
    </details>
  )
}

function Slider(p: { f: Faixa; v: number; mudar: (v: number, salvar: boolean) => void }) {
  const [v, setV] = useState(p.v)
  useEffect(() => setV(p.v), [p.v])
  return (
    <label className="grid gap-0.5">
      <span className="flex items-baseline justify-between text-[11px]">
        <span className="text-fog">{p.f.rotulo}</span>
        <span className="font-semibold tabular-nums">{fmt(v, p.f)}</span>
      </span>
      <input
        type="range"
        min={p.f.min}
        max={p.f.max}
        step={p.f.passo}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value)
          setV(n)
          p.mudar(n, false)
        }}
        onPointerUp={() => v !== p.v && p.mudar(v, true)}
        onKeyUp={() => v !== p.v && p.mudar(v, true)}
        className="accent-coral"
      />
    </label>
  )
}
