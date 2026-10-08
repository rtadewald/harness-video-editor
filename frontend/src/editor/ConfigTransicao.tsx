import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bezier } from './curvas'
import { NOMES, PRESETS_CURVA, type Curva } from './enriquecimento'
import { definirTransicao, previaTransicao, type ConfigTransicao as Config, type Direcao, type Lado } from './transicoes'

const iguais = (a: Curva, b: Curva) => a.every((v, i) => Math.abs(v - b[i]) < 0.005)

/** O desenho da curva (o progresso ao longo do tempo), como ícone do preset. */
export function IconeCurva({ curva }: { curva: Curva }) {
  const f = bezier(...curva)
  const pontos = Array.from({ length: 25 }, (_, i) => {
    const t = i / 24
    return `${2 + t * 32},${22 - f(t) * 18}`
  }).join(' ')
  return (
    <svg viewBox="0 0 36 26" className="h-6 w-9">
      <line x1="2" y1="22" x2="34" y2="22" className="stroke-current opacity-25" strokeWidth={1} />
      <polyline points={pontos} className="fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// os sliders de cada campo: rótulo (na entrada e na saída), limites, passo e unidade
const CAMPOS: Record<string, { entrada: string; saida: string; min: number; max: number; passo: number; un: string }> = {
  duracao: { entrada: 'Duração', saida: 'Duração', min: 0.25, max: 5, passo: 0.25, un: 's' },
  escala: { entrada: 'Escala inicial', saida: 'Escala final', min: 50, max: 200, passo: 1, un: '%' },
  distancia: { entrada: 'Distância de partida', saida: 'Distância de saída', min: 0, max: 150, passo: 1, un: '%' },
  fim: { entrada: 'Posição final', saida: 'Posição final', min: -50, max: 50, passo: 1, un: '%' },
  angulo: { entrada: 'Ângulo', saida: 'Ângulo', min: 0, max: 90, passo: 1, un: '°' },
  deslocamento: { entrada: 'Deslocamento', saida: 'Deslocamento', min: 0, max: 100, passo: 1, un: '%' },
  desfoque: { entrada: 'Desfoque', saida: 'Desfoque', min: 0, max: 40, passo: 1, un: 'px' },
  zoom: { entrada: 'Zoom final', saida: 'Zoom final', min: 100, max: 130, passo: 0.5, un: '%' },
}
const DIRECOES: { id: Direcao; Icone: typeof ArrowUp; nome: string }[] = [
  { id: 'cima', Icone: ArrowUp, nome: 'Para cima' },
  { id: 'baixo', Icone: ArrowDown, nome: 'Para baixo' },
  { id: 'esquerda', Icone: ArrowLeft, nome: 'Para a esquerda' },
  { id: 'direita', Icone: ArrowRight, nome: 'Para a direita' },
]
const fmt = (v: number, un: string) => `${un === 's' ? v.toFixed(2) : Number.isInteger(v) ? v : v.toFixed(1)}`.replace('.', ',') + ' ' + un

/** A engrenagem de uma entrada ou saída: a configuração **global** daquele tipo (vale para todos os inserts que o usam).
 *  Os sliders mudam a prévia na hora e salvam ao soltar; curva, direção e fade salvam no clique. */
export default function ConfigTransicao(p: { lado: Lado; tipo: string; cfg: Config; ver: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const salvar = (campos: Partial<Record<keyof Config, unknown>>) => {
    setErro(null)
    definirTransicao(p.lado, p.tipo, campos).catch((e) => setErro((e as Error).message))
  }
  const sliders = (Object.keys(CAMPOS) as (keyof Config)[]).filter((k) => typeof p.cfg[k] === 'number')
  return (
    <div className="grid gap-3.5 rounded-[8px] bg-deeper/70 p-3.5 ring-1 ring-line-dark">
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold">
          {NOMES[p.tipo]} <span className="font-normal text-fog">· {p.lado === 'entrada' ? 'entrada' : 'saída'}</span>
        </p>
        <button onClick={p.ver} className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[11px] text-fog hover:text-cream">
          <Play className="size-3 fill-current" /> Ver
        </button>
      </div>
      <p className="-mt-2 text-[10.5px] leading-[1.5] text-fog">Vale para todos os inserts com esta {p.lado === 'entrada' ? 'entrada' : 'saída'}, em todos os vídeos.</p>

      <div className="grid gap-1.5">
        <span className="eyebrow text-sage">Curva</span>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS_CURVA.map((x) => {
            const ativo = iguais(x.curva, p.cfg.curva)
            return (
              <button
                key={x.nome}
                onClick={() => salvar({ curva: x.curva })}
                className={cn(
                  'grid place-items-center gap-1 rounded-[6px] px-1 py-2 text-center text-[10px] leading-tight ring-1 transition-colors',
                  ativo ? 'bg-cream/10 text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream hover:ring-cream/40',
                )}
              >
                <IconeCurva curva={x.curva} />
                {x.nome}
              </button>
            )
          })}
        </div>
      </div>

      {p.cfg.direcao && (
        <div className="grid gap-1.5">
          <span className="eyebrow text-sage">Direção</span>
          <div className="flex gap-1.5">
            {DIRECOES.map(({ id, Icone, nome }) => (
              <button
                key={id}
                onClick={() => salvar({ direcao: id })}
                title={nome}
                aria-label={nome}
                className={cn(
                  'grid size-8 place-items-center rounded-[6px] ring-1 transition-colors',
                  p.cfg.direcao === id ? 'bg-cream/10 text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream',
                )}
              >
                <Icone className="size-4" />
              </button>
            ))}
          </div>
        </div>
      )}

      {sliders.map((k) => (
        <Slider key={k} lado={p.lado} tipo={p.tipo} campo={k} valor={p.cfg[k] as number} salvar={salvar} />
      ))}

      {typeof p.cfg.fade === 'boolean' && (
        <label className="flex cursor-pointer items-center gap-2 text-[12px]">
          <input type="checkbox" checked={p.cfg.fade} onChange={(e) => salvar({ fade: e.target.checked })} /> Com fade
        </label>
      )}

      <button
        onClick={() => salvar(Object.fromEntries(Object.keys(p.cfg).map((k) => [k, null])))}
        className="flex w-fit items-center gap-1 text-[11px] text-fog hover:text-cream"
        title="Volta todos os campos ao padrão de fábrica"
      >
        <RotateCcw className="size-3" /> Padrão de fábrica
      </button>
      {erro && <p className="text-[11px] text-coral">{erro}</p>}
    </div>
  )
}

function Slider(p: { lado: Lado; tipo: string; campo: keyof Config; valor: number; salvar: (c: Partial<Record<keyof Config, unknown>>) => void }) {
  const c = CAMPOS[p.campo]
  const [v, setV] = useState(p.valor)
  useEffect(() => setV(p.valor), [p.valor])
  const soltar = () => v !== p.valor && p.salvar({ [p.campo]: v })
  return (
    <label className="grid gap-1">
      <span className="flex items-baseline justify-between text-[11.5px]">
        <span className="text-fog">{p.lado === 'entrada' ? c.entrada : c.saida}</span>
        <span className="font-semibold tabular-nums">{fmt(v, c.un)}</span>
      </span>
      <input
        type="range"
        min={c.min}
        max={c.max}
        step={c.passo}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value)
          setV(n)
          previaTransicao(p.lado, p.tipo, { [p.campo]: n })
        }}
        onPointerUp={soltar}
        onKeyUp={soltar}
        className="accent-coral"
      />
    </label>
  )
}
