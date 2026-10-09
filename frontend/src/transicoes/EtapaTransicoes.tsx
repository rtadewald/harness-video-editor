import { useContext, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Play, Shuffle, Star, Volume2 } from 'lucide-react'
import { formatarTempo, type ItemRef } from '@/api'
import { CATEGORIAS } from '@/editor/EtapaDirecao'
import LinhaBase, { type Trilha } from '@/editor/LinhaBase'
import { Alca, Cabecalho, useTamanhos } from '@/editor/inserts/layout'
import { useCatalogoSons } from '@/editor/sons'
import { cn } from '@/lib/utils'
import { COR_PLANO } from '@/referencias/LinhaDirecao'
import { LUZ, TransicoesDoVideo, ordemDoPar, sonsDasTransicoes, useBiblioteca, type CorteDoVideo, type Transicao } from './transicoes'

const nomeCat = (c: string) => CATEGORIAS.planos[c] ?? c
const VAZIO: CorteDoVideo[] = []
const temAlgo = (c: CorteDoVideo) => !!c.transicao && (c.transicao.efeito.tipo !== 'seco' || !!c.transicao.som)
const TRILHAS: Trilha[] = [
  { id: 'planos', nome: 'Planos', alt: 34 },
  { id: 'transicoes', nome: 'Transições', alt: 30 },
  { id: 'sons', nome: 'Sons', alt: 20 },
]

/** A etapa Transições (SPEC §8.8; docs/transicoes.md), no mesmo arranjo da etapa Inserts: à esquerda o corte
 *  selecionado com as opções (as favoritas do par primeiro, ★; depois as outras; ▶ toca o corte), no meio a prévia, e
 *  embaixo a linha do tempo: os planos, a transição de cada corte (a janela do efeito em volta dele) e os sons. Cada
 *  corte recebe sozinho a 1ª favorita do par; clicar num corte na linha do tempo leva o player até ele e o seleciona. */
export default function EtapaTransicoes(p: {
  previa: ReactNode
  planos: ItemRef[]
  duracao: number
  tempo: number
  buscar: (t: number) => void
  tocando: boolean
  /** Toca um trecho do vídeo final (s de saída) e para no fim dele (o mesmo da etapa Inserts). */
  tocarTrecho: (de: number, ate: number) => void
  escolher: (corte: CorteDoVideo, tid: string | null) => void
}) {
  const cortes = useContext(TransicoesDoVideo) ?? VAZIO
  const b = useBiblioteca()
  const cat = useCatalogoSons()
  const [sel, setSel] = useState<string | null>(null)
  const corte = cortes.find((c) => c.plano === sel) ?? null
  const [tam, arrastarBorda] = useTamanhos()
  // ▶ Ver: toca de 1,5 s antes a 1,5 s depois do corte e para (o trecho do player: pausar o esquece)
  const ver = (c: CorteDoVideo) => p.tocarTrecho(Math.max(c.t - 1.5, 0), Math.min(c.t + 1.5, p.duracao))
  const selecionar = (c: CorteDoVideo) => {
    setSel(c.plano)
    p.buscar(Math.max(c.t - 0.4, 0))
  }
  const efeitos = cortes.filter(temAlgo).length
  // as favoritas de hoje podem deixar todos os cortes secos (a 1ª favorita é a mais comum no par, quase sempre o corte
  // seco): sem trocar à mão, o vídeo sai sem efeito nem som de transição — melhor dizer na tela (docs/transicoes.md, ⏳)
  const todosSecos = cortes.length > 0 && !cortes.some((c) => !c.manual && temAlgo(c))
  const sons = useMemo(() => sonsDasTransicoes(cortes, cat), [cortes, cat])
  const durSom = (id: string, vel = 1) => (cat?.sons.find((s) => s.id === id)?.duracao ?? 0.5) / vel

  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: `minmax(0,1fr) ${tam.linha}px` }}>
      <div className="relative grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${Math.min(tam.esq, 520)}px minmax(0, 1fr)` }}>
        <Alca lado="esq" pos={Math.min(tam.esq, 520)} arrastar={arrastarBorda} />
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line-dark text-cream">
          <Cabecalho
            icone={Shuffle}
            titulo="Transições"
            extra={
              <span className="ml-auto text-fog tabular-nums">
                {cortes.length} cortes · {efeitos} com efeito ou som
              </span>
            }
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!cortes.length ? (
              <p className="text-[12.5px] leading-[1.7] text-fog">Este vídeo ainda não tem planos na direção (a etapa Direção visual).</p>
            ) : corte && b ? (
              <Opcoes corte={corte} todas={b.transicoes} favoritas={ordemDoPar(b, corte.de, corte.para)} escolher={(tid) => p.escolher(corte, tid)} ver={() => ver(corte)} />
            ) : (
              <p className="text-[12.5px] leading-[1.7] text-fog">
                Cada corte entre planos recebe sozinho a favorita do par (de onde sai → para onde vai). Escolha um corte na linha do tempo para ver e trocar a transição dele.
              </p>
            )}
            {todosSecos && (
              <p className="mt-4 rounded-[6px] border border-yellow/40 bg-yellow/10 px-3 py-2 text-[11.5px] leading-[1.6] text-cream/90">
                Pelas favoritas de hoje, os cortes que seguem a favorita do par ficam todos secos, sem efeito nem som (o mais comum nas referências). Troque à mão aqui ou mude a 1ª favorita do par na{' '}
                <Link to="/transicoes" className="text-yellow hover:underline">
                  página Transições
                </Link>
                .
              </p>
            )}
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col px-6 pt-5 pb-3">{p.previa}</section>
      </div>

      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        <LinhaBase duracao={p.duracao} trilhas={TRILHAS} tempo={p.tempo} tocando={p.tocando} buscar={p.buscar}>
          {({ x, faixa }) => (
            <>
              {/* planos: clicar seleciona o corte que entra nele */}
              {p.planos.map((pl, k) => {
                const c = cortes.find((x) => x.plano === pl.id)
                return (
                  <button
                    key={pl.id}
                    onClick={() => c && selecionar(c)}
                    className={cn(
                      'absolute flex items-center gap-1 overflow-hidden rounded-[4px] px-1.5 text-left text-[10.5px] font-semibold whitespace-nowrap',
                      COR_PLANO[pl.tipo],
                      !c && 'cursor-default',
                    )}
                    style={{ left: x(pl.inicio) + 1, width: Math.max(x(pl.fim - pl.inicio) - 2, 2), top: faixa(0), height: TRILHAS[0].alt }}
                    title={`${k + 1} · ${nomeCat(pl.tipo)}`}
                  >
                    <span className="shrink-0 opacity-70">{k + 1}</span>
                    <span className="truncate">{nomeCat(pl.tipo)}</span>
                  </button>
                )
              })}

              {/* transições: a janela do efeito em volta do corte (no mínimo um marcador no corte) */}
              {cortes.map((c) => {
                const t = c.transicao
                const e = t?.efeito
                const ini = e ? c.t - e.antes : c.t
                const fim = e ? (e.tipo === 'luz' ? c.t - e.antes + LUZ.duracao : c.t + e.depois) : c.t
                const larg = Math.max(x(fim - ini), 16)
                const left = x(fim - ini) >= 16 ? x(ini) : x(c.t) - 8
                const seco = !t || (e?.tipo === 'seco' && !t.som)
                return (
                  <button
                    key={c.plano}
                    onClick={() => selecionar(c)}
                    className={cn(
                      'absolute z-10 flex items-center justify-center gap-0.5 overflow-hidden rounded-[4px] px-1 text-[9.5px] font-semibold whitespace-nowrap ring-1',
                      seco ? 'bg-cream/[0.06] text-fog ring-line-dark' : e?.tipo === 'seco' ? 'bg-sage/15 text-sage ring-sage/40' : 'bg-coral/20 text-cream ring-coral/60',
                      sel === c.plano && 'ring-2 ring-yellow',
                    )}
                    style={{ left, width: larg, top: faixa(1), height: TRILHAS[1].alt }}
                    title={`${formatarTempo(c.t)} · ${nomeCat(c.de)} → ${nomeCat(c.para)} · ${t?.nome ?? 'Corte seco'}${c.manual ? ' (escolhida à mão)' : ''}`}
                  >
                    {c.manual && <span className="size-1.5 shrink-0 rounded-full bg-coral" />}
                    {larg >= 70 ? <span className="truncate">{t?.nome ?? 'Corte seco'}</span> : t?.som ? <Volume2 className="size-3 shrink-0" /> : <span>|</span>}
                  </button>
                )
              })}

              {/* sons das transições: do começo do som ao fim */}
              {sons.map((s) => (
                <div
                  key={`${s.som}@${s.t}`}
                  className="absolute overflow-hidden rounded-[3px] bg-sage/25 px-1 text-[9px] leading-[20px] text-sage"
                  style={{ left: x(s.t), width: Math.max(x(durSom(s.som, s.vel) - (s.desde ?? 0)), 4), top: faixa(2), height: TRILHAS[2].alt }}
                  title={s.som}
                >
                  {s.som}
                </div>
              ))}
            </>
          )}
        </LinhaBase>
      </div>
    </div>
  )
}

function Opcoes(p: { corte: CorteDoVideo; todas: Transicao[]; favoritas?: { ids: string[]; favoritas: number }; escolher: (tid: string | null) => void; ver: () => void }) {
  const fav = new Set((p.favoritas?.ids ?? []).slice(0, p.favoritas?.favoritas ?? 0))
  const ordem = [...(p.favoritas?.ids ?? []), ...p.todas.map((t) => t.id)].filter((x, i, l) => l.indexOf(x) === i)
  const lista = ordem.map((id) => p.todas.find((t) => t.id === id)).filter(Boolean) as Transicao[]
  const botao = (t: Transicao) => (
    <button
      key={t.id}
      onClick={() => p.escolher(t.id)}
      title={t.descricao}
      className={cn(
        'flex items-center gap-1.5 rounded-[6px] px-2.5 py-2 text-left text-[11.5px] font-semibold ring-1',
        p.corte.transicao?.id === t.id ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream',
      )}
    >
      {fav.has(t.id) && <Star className="size-3 shrink-0 fill-yellow text-yellow" />}
      <span className="truncate">{t.nome}</span>
      {t.som && <Volume2 className="ml-auto size-3 shrink-0 opacity-60" />}
    </button>
  )
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="text-[13px] font-semibold">
          {nomeCat(p.corte.de)} → {nomeCat(p.corte.para)}
        </p>
        <p className="flex items-center gap-2 text-[11.5px] text-fog">
          <span className="tabular-nums">{formatarTempo(p.corte.t)}</span>
          <span>·</span>
          <span className={cn(p.corte.manual && 'text-coral')}>{p.corte.manual ? 'escolhida à mão' : 'a favorita do par'}</span>
          <button onClick={p.ver} className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[11px] font-semibold text-fog hover:text-cream">
            <Play className="size-3" /> Ver o corte
          </button>
        </p>
      </div>
      <div className="grid gap-1.5">
        <p className="eyebrow text-yellow">Favoritas do par</p>
        <div className="grid grid-cols-2 gap-1.5">{lista.filter((t) => fav.has(t.id)).map(botao)}</div>
      </div>
      <div className="grid gap-1.5">
        <p className="eyebrow text-fog">Outras transições</p>
        <div className="grid grid-cols-2 gap-1.5">{lista.filter((t) => !fav.has(t.id)).map(botao)}</div>
      </div>
      {p.corte.manual && (
        <button onClick={() => p.escolher(null)} className="w-fit text-[11px] text-fog underline-offset-2 hover:text-cream hover:underline">
          Voltar à favorita do par
        </button>
      )}
    </div>
  )
}
