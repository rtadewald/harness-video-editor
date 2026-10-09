import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AJUSTES, ajustesEfetivos, comAjustes, padraoDe, rapidosDe, type Ajustes } from '@/presets/ajustes'
import { editarPreset, type Preset, type Receita } from '@/presets/presets'

/** Os ajustes rápidos do preset do insert selecionado (SPEC §8.4): poucos controles de 3 opções, só para este insert.
 *  "Salvar como padrão" grava as escolhas no preset (vale para os outros inserts) e limpa as deste. */
/** `receita`: a que o insert toca (com as mídias e os ajustes); com ela, somem os controles que não mudariam nada ali
 *  ("Quando o próximo entra" com um card só; "Tamanho do card" e os sliders Posição e Largura com todos ocupando a área,
 *  a tela toda), a não ser que já tenham uma escolha (para dar para desfazer). */
export default function CardAjustes(p: { preset: Preset; ajustes: Ajustes | undefined; mudar: (a: Ajustes | null) => void; aspectos?: number[]; telaToda?: boolean; receita?: Receita | null }) {
  const atual = p.ajustes ?? {}
  const semEfeito = (id: string) =>
    !!p.receita &&
    atual[id] == null &&
    ((id === 'proximo' && p.receita.cards.length < 2) || (['tamanho', 'y', 'largura'].includes(id) && p.receita.cards.every((c) => c.repouso.w >= 99 && c.repouso.h >= 99)))
  const ids = rapidosDe(p.preset).filter((id) => !semEfeito(id))
  const efetivo = ajustesEfetivos(p.preset, p.ajustes, p.aspectos ?? []) ?? {}
  // a opção que vale sem escolha no insert: a automática (ex.: "Tela toda" com mídias 9:16) ou a do preset; sem a tela
  // toda permitida, a forma é "Card" (a que aparece marcada: escolhê-la não muda nada nem conta como ajuste)
  const semEscolha = (id: string) => {
    const aj = AJUSTES.find((x) => x.id === id)!
    if (id === 'forma' && p.telaToda === false) return 'Card'
    const { [id]: _, ...resto } = atual
    return (ajustesEfetivos(p.preset, resto, p.aspectos ?? []) ?? {})[id] ?? aj.opcoes[padraoDe(aj, p.preset.receita)]
  }
  const mexido = Object.keys(atual).length > 0
  const salvar = async () => {
    // a receita original com as escolhas (as duas fases)
    const r = comAjustes(comAjustes(p.preset.receita, atual, 'antes'), atual, 'depois')
    await editarPreset(p.preset.id, { receita: r })
    p.mudar(null)
  }
  return (
    <div className="grid gap-3.5 text-[12px]">
      {ids.map((id) => {
        const a = AJUSTES.find((x) => x.id === id)
        if (!a) return null
        const valor = id === 'forma' && p.telaToda === false ? 'Card' : (efetivo[id] ?? a.opcoes[padraoDe(a, p.preset.receita)])
        const escolher = (i: number) => {
          const novo = { ...atual }
          if (a.opcoes[i] === semEscolha(id)) delete novo[id]
          else novo[id] = a.opcoes[i]
          p.mudar(Object.keys(novo).length ? novo : null)
        }
        if (a.grade)
          return (
            <div key={id} className="flex items-center gap-3">
              <span className="text-[11px] text-fog">{a.nome}</span>
              {/* a imagem dividida em 9 zonas: o ponto mostra para onde o zoom vai */}
              <div className="grid grid-cols-3 gap-0.5 rounded-[5px] p-0.5 ring-1 ring-line-dark">
                {a.opcoes.map((o, i) => (
                  <button key={o} onClick={() => escolher(i)} title={o} className={cn('grid size-6 place-items-center rounded-[3px]', valor === o ? 'bg-cream' : 'bg-cream/[0.06] hover:bg-cream/20')}>
                    <span className={cn('size-1.5 rounded-full', valor === o ? 'bg-ink' : 'bg-fog/60')} />
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-cream">{valor}</span>
            </div>
          )
        return (
          <div key={id} className="grid gap-1.5">
            <span className="text-[11px] text-fog">{a.nome}</span>
            <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
              {a.opcoes.map((o, i) => (
                <button
                  key={o}
                  disabled={id === 'forma' && o === 'Tela toda' && p.telaToda === false}
                  onClick={() => {
                    const novo = { ...atual }
                    if (a.opcoes[i] === semEscolha(id)) delete novo[id]
                    else novo[id] = o
                    p.mudar(Object.keys(novo).length ? novo : null)
                  }}
                  className={cn('flex-1 rounded-full py-1 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-35', valor === o ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
                  title={id === 'forma' && o === 'Tela toda' && p.telaToda === false ? 'Esta mídia seria cortada: na tela dividida, só horizontais ocupam a área; na tela cheia e no ator embaixo, só 9:16' : undefined}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {/* subir/descer e a largura dos cards, numa linha (na tela toda, sem efeito: somem) */}
      {!(semEfeito('y') && semEfeito('largura')) && (
      <div className="grid grid-cols-2 gap-4">
        {(
          [
            ['y', 'Posição', -25, 25, 0.5, 0, (v: number) => `${v > 0 ? '↓' : v < 0 ? '↑' : ''}${Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1).replace('.', ',')}`],
            ['largura', 'Largura', 0.7, 1.3, 0.01, 1, (v: number) => `${Math.round(v * 100)}%`],
          ] as const
        ).filter(([id]) => !semEfeito(id)).map(([id, nome, min, max, passo, neutro, fmt]) => {
          const salvo = Number(atual[id] ?? neutro)
          const gravar = (n: number) => {
            const novo = { ...atual }
            if (n === neutro) delete novo[id]
            else novo[id] = String(n)
            p.mudar(Object.keys(novo).length ? novo : null)
          }
          return <SliderLivre key={id} nome={nome} min={min} max={max} passo={passo} salvo={salvo} fmt={fmt} gravar={gravar} voltar={() => gravar(neutro)} />
        })}
      </div>
      )}
      {!ids.length && <p className="text-[11.5px] text-fog">Este preset não tem ajustes rápidos.</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
        <button
          onClick={() => void salvar().catch((e) => window.alert((e as Error).message))}
          disabled={!mexido}
          className="flex items-center gap-1 rounded-full border border-line-dark px-3 py-1 font-semibold text-fog hover:text-cream disabled:opacity-40"
          title="Grava estas escolhas no preset: passam a valer para todos os inserts que o usam"
        >
          <Save className="size-3" /> Salvar como padrão do preset
        </button>
      </div>
    </div>
  )
}

/** Um slider que mexe na prévia ao soltar (grava uma vez); dois cliques voltam ao do preset. */
function SliderLivre(p: { nome: string; min: number; max: number; passo: number; salvo: number; fmt: (v: number) => string; gravar: (v: number) => void; voltar: () => void }) {
  const [v, setV] = useState(p.salvo)
  useEffect(() => setV(p.salvo), [p.salvo])
  return (
    <label className="grid min-w-0 gap-1">
      <span className="flex justify-between text-[11px] text-fog">
        {p.nome} <span className="tabular-nums text-cream">{p.fmt(v)}</span>
      </span>
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.passo}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => v !== p.salvo && p.gravar(v)}
        onKeyUp={() => v !== p.salvo && p.gravar(v)}
        onDoubleClick={p.voltar}
        className="w-full min-w-0 accent-coral"
        title="Dois cliques voltam ao do preset"
      />
    </label>
  )
}

