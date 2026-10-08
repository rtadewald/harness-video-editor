import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import EditorCurva from './EditorCurva'
import { tipoDoPreset } from './divisao'
import { AJUSTES, rapidosDe } from './ajustes'
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
  escala: { rotulo: 'Escala', min: 0.3, max: 3, passo: 0.01, un: '×' },
  altura: { rotulo: 'Altura (abre na vertical)', min: 0.2, max: 2, passo: 0.01, un: '×' },
  rot: { rotulo: 'Giro', min: -45, max: 45, passo: 0.5, un: '°' },
  rx: { rotulo: 'Giro 3D (vertical)', min: -80, max: 80, passo: 1, un: '°' },
  ry: { rotulo: 'Giro 3D (horizontal)', min: -80, max: 80, passo: 1, un: '°' },
  opacidade: { rotulo: 'Opacidade', min: 0, max: 1, passo: 0.01, un: '' },
  desfoque: { rotulo: 'Desfoque', min: 0, max: 60, passo: 0.5, un: 'px' },
}
const fmt = (v: number, f: Faixa) => `${f.passo < 0.1 ? v.toFixed(2) : f.passo < 1 ? v.toFixed(1) : Math.round(v)}${f.un ? ' ' + f.un : ''}`.replace('.', ',')

/** A engrenagem de um preset: muda a receita (vale para todos os inserts que usam o preset). Os sliders mudam a prévia
 *  na hora e salvam ao soltar. */
/** `parte`: só o geral (nome, onde aparece) ou só os ajustes (tempo, movimento contínuo, zoom na mídia, onde fica,
 *  entrada, saída), para o modal dividir o editor em volta da prévia; sem ela, tudo. `card`/`escolherCard`: a mídia
 *  em edição vinda de fora, quando as duas partes estão na tela ao mesmo tempo. */
export default function EditorPreset(p: {
  preset: Preset
  ver?: () => void
  colunas?: boolean
  parte?: 'geral' | 'lugar'
  card?: number
  escolherCard?: (k: number) => void
  /** Um bloco antes das seções (no modal: os ajustes rápidos, no topo da 1ª coluna). */
  topo?: React.ReactNode
}) {
  const [kLocal, setKLocal] = useState(0)
  const k = p.card ?? kLocal
  const setK = p.escolherCard ?? setKLocal
  const geral = p.parte !== 'lugar'
  const lugar = p.parte !== 'geral'
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
    <div className={cn('text-[12px]', p.colunas ? 'columns-2 gap-6 [&>*]:mb-4 [&>*]:break-inside-avoid' : 'grid gap-5')}>
      {p.topo}
      {geral && (
        <>
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
      <div className="grid gap-1.5 text-[11px]">
        <span className="text-fog">Aparece em</span>
        <div className="flex w-fit rounded-full p-0.5 whitespace-nowrap ring-1 ring-line-dark">
          {(
            [
              ['vertical', 'Tela cheia'],
              ['dividida', 'Tela dividida'],
              ['ambos', 'Ambos'],
            ] as const
          ).map(([f, rotulo]) => {
            const atual = !p.preset.formatos || p.preset.formatos.length === 2 ? 'ambos' : p.preset.formatos[0]
            return (
              <button
                key={f}
                onClick={() =>
                  f !== atual &&
                  void editarPreset(p.preset.id, { formatos: f === 'ambos' ? ['vertical', 'dividida'] : [f] }).catch((x) => setErro((x as Error).message))
                }
                className={cn('rounded-full px-2.5 py-0.5 font-semibold', atual === f ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
              >
                {rotulo}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-1.5 text-[11px]">
        <span className="text-fog">Ajustes rápidos (o que aparece na edição do insert)</span>
        <div className="flex flex-wrap gap-1">
          {AJUSTES.map((aj) => {
            const ligado = rapidosDe(p.preset).includes(aj.id)
            return (
              <button
                key={aj.id}
                onClick={() => {
                  const atual = rapidosDe(p.preset)
                  void editarPreset(p.preset.id, { rapidos: ligado ? atual.filter((x) => x !== aj.id) : [...atual, aj.id] }).catch((x) => setErro((x as Error).message))
                }}
                className={cn('rounded-full px-2.5 py-0.5 font-semibold ring-1', ligado ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}
              >
                {aj.nome}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-1.5 text-[11px]">
        <span className="text-fog">Na tela dividida</span>
        <div className="flex w-fit rounded-full p-0.5 whitespace-nowrap ring-1 ring-line-dark">
          {(
            [
              ['area', 'Ocupa a área'],
              ['card', 'Card'],
              ['atras', 'Ator embaixo'],
            ] as const
          ).map(([t, rotulo]) => (
            <button
              key={t}
              onClick={() => t !== tipoDoPreset(p.preset) && void editarPreset(p.preset.id, { divisao_tipo: t }).catch((x) => setErro((x as Error).message))}
              className={cn('rounded-full px-2.5 py-0.5 font-semibold', tipoDoPreset(p.preset) === t ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {(!p.preset.formatos || p.preset.formatos.length === 2) && (
        <p className="-mt-2 text-[10.5px] leading-[1.5] text-fog">Desenhado para {p.preset.formato === 'vertical' ? 'tela cheia' : 'tela dividida'}; no outro formato aparece adaptado.</p>
      )}
      {r.cards.length > 1 && p.parte !== 'geral' && p.parte !== 'lugar' && (
        <div className="flex gap-1">
          {r.cards.map((_, j) => (
            <button key={j} onClick={() => setK(j)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', j === k ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}>
              {j + 1}ª mídia
            </button>
          ))}
        </div>
      )}

        </>
      )}
      {r.cards.length > 1 && p.parte === 'lugar' && (
        <div className="flex gap-1">
          {r.cards.map((_, j) => (
            <button key={j} onClick={() => setK(j)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', j === k ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}>
              {j + 1}ª mídia
            </button>
          ))}
        </div>
      )}
      {lugar && (
        <>
      <Secao titulo="Tempo">
        <Slider f={{ rotulo: 'Começa em (fração do insert)', min: 0, max: 0.9, passo: 0.01, un: '' }} v={c.inicio_frac} mudar={(v, s) => mudarCard((x) => ({ ...x, inicio_frac: v }), s)} />
        <Slider f={{ rotulo: 'Sai antes do fim', min: 0, max: 5, passo: 0.05, un: 's' }} v={c.sai_antes_do_fim} mudar={(v, s) => mudarCard((x) => ({ ...x, sai_antes_do_fim: v }), s)} />
      </Secao>

      <Secao titulo="Movimento contínuo">
        <Slider f={{ rotulo: 'Zoom por segundo', min: -20, max: 20, passo: 0.25, un: '%' }} v={(c.continuo?.escala ?? 0) * 100} mudar={(v, s) => mudarCard((x) => ({ ...x, continuo: { dx: 0, dy: 0, ...x.continuo, escala: v / 100 } }), s)} />
        <Slider f={{ rotulo: 'Deslocamento horizontal por segundo', min: -30, max: 30, passo: 0.25, un: '%' }} v={c.continuo?.dx ?? 0} mudar={(v, s) => mudarCard((x) => ({ ...x, continuo: { escala: 0, dy: 0, ...x.continuo, dx: v } }), s)} />
        <Slider f={{ rotulo: 'Deslocamento vertical por segundo', min: -30, max: 30, passo: 0.25, un: '%' }} v={c.continuo?.dy ?? 0} mudar={(v, s) => mudarCard((x) => ({ ...x, continuo: { escala: 0, dx: 0, ...x.continuo, dy: v } }), s)} />
        <Slider f={{ rotulo: 'Giro por segundo', min: -20, max: 20, passo: 0.25, un: '°' }} v={c.continuo?.rot ?? 0} mudar={(v, s) => mudarCard((x) => ({ ...x, continuo: { escala: 0, dx: 0, dy: 0, ...x.continuo, rot: v } }), s)} />
      </Secao>

      <Secao titulo="Zoom na mídia">
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px]">
          <input type="checkbox" checked={!!c.zoom} onChange={(e) => mudarCard((x) => ({ ...x, zoom: e.target.checked ? { inicio: 0.8, duracao: 0.8, escala: 1.5, ox: 50, oy: 50, curva: [0.65, 0, 0.35, 1] } : null }))} /> O conteúdo dá zoom dentro do card
        </label>
        {c.zoom && (
          <>
            <Slider f={{ rotulo: 'Começa (s depois de aparecer)', min: 0, max: 5, passo: 0.05, un: 's' }} v={c.zoom.inicio} mudar={(v, s) => mudarCard((x) => ({ ...x, zoom: { ...x.zoom!, inicio: v } }), s)} />
            <Slider f={{ rotulo: 'Duração', min: 0.1, max: 4, passo: 0.05, un: 's' }} v={c.zoom.duracao} mudar={(v, s) => mudarCard((x) => ({ ...x, zoom: { ...x.zoom!, duracao: v } }), s)} />
            <Slider f={{ rotulo: 'Quanto', min: 0.5, max: 4, passo: 0.05, un: '×' }} v={c.zoom.escala} mudar={(v, s) => mudarCard((x) => ({ ...x, zoom: { ...x.zoom!, escala: v } }), s)} />
            <Slider f={{ rotulo: 'Para onde (horizontal)', min: 0, max: 100, passo: 1, un: '%' }} v={c.zoom.ox} mudar={(v, s) => mudarCard((x) => ({ ...x, zoom: { ...x.zoom!, ox: v } }), s)} />
            <Slider f={{ rotulo: 'Para onde (vertical)', min: 0, max: 100, passo: 1, un: '%' }} v={c.zoom.oy} mudar={(v, s) => mudarCard((x) => ({ ...x, zoom: { ...x.zoom!, oy: v } }), s)} />
          </>
        )}
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
                    v={(m as unknown as Record<string, Estado>)[chave][key] ?? 1}
                    mudar={(v, s) => mudarCard((x) => ({ ...x, [lado]: { ...x[lado]!, [chave]: { ...(x[lado] as unknown as Record<string, Estado>)[chave], [key]: v } } }), s)}
                  />
                ))}
                <p className="eyebrow mt-1 text-sage">Curvas</p>
                {(Object.keys(m.curvas) as Propriedade[]).map((prop) => (
                  <div key={prop} className="grid gap-1">
                    <span className="text-[11px] text-fog">{NOME_PROP[prop]}</span>
                    <EditorCurva
                      curva={m.curvas[prop]!}
                      mudar={(curva, s) => mudarCard((y) => ({ ...y, [lado]: { ...y[lado]!, curvas: { ...y[lado]!.curvas, [prop]: curva } } }), s)}
                    />
                  </div>
                ))}
              </>
            )}
          </Secao>
        )
      })}
        </>
      )}
      {erro && <p className="text-[11px] text-coral">{erro}</p>}
    </div>
  )
}

function Secao(p: { titulo: string; children: React.ReactNode }) {
  return (
    <details open className="group grid gap-2 pt-1 break-inside-avoid">
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
