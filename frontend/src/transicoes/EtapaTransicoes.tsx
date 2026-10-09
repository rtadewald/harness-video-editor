import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Play, Shuffle, Star, Volume2 } from 'lucide-react'
import { formatarTempo, type ItemRef } from '@/api'
import { CATEGORIAS } from '@/editor/EtapaDirecao'
import LinhaBase, { type Trilha } from '@/editor/LinhaBase'
import { Alca, Cabecalho, useTamanhos } from '@/editor/inserts/layout'
import { pararSons, useCatalogoSons } from '@/editor/sons'
import { emCampoDeTexto, modalAberto } from '@/lib/atalhos'
import { cn } from '@/lib/utils'
import { COR_PLANO } from '@/referencias/LinhaDirecao'
import { Miniatura } from './CardTransicao'
import {
  LUZ,
  TransicoesDoVideo,
  chaveGrupo,
  familia,
  fonteDaTransicao,
  ordemDoPar,
  parDoGrupo,
  sonsDasTransicoes,
  useBiblioteca,
  type Biblioteca,
  type CorteDoVideo,
  type Grupo,
  type Transicao,
} from './transicoes'

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
  // o corte selecionado é sempre o próximo a partir do cursor (pedido de Rodrigo, out/2026: sem precisar clicar nele);
  // enquanto o vídeo toca fica o que estava (o R toca o corte e passa dele)
  const proximo = cortes.find((c) => c.t >= p.tempo - 0.05) ?? cortes[cortes.length - 1] ?? null
  const [sel, setSel] = useState<string | null>(proximo?.plano ?? null)
  if (!p.tocando && proximo && sel !== proximo.plano) setSel(proximo.plano)
  const corte = cortes.find((c) => c.plano === sel) ?? proximo
  const [tam, arrastarBorda] = useTamanhos()
  // ▶ Ver: toca de 1,5 s antes a 1,5 s depois do corte e para (o trecho do player: pausar o esquece)
  const ver = (c: CorteDoVideo) => p.tocarTrecho(Math.max(c.t - 1.5, 0), Math.min(c.t + 1.5, p.duracao))
  const selecionar = (c: CorteDoVideo) => {
    setSel(c.plano)
    p.buscar(Math.max(c.t - 0.4, 0))
  }
  // R: toca o corte selecionado para ver como ficou
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey || emCampoDeTexto(e.target, e.key) || modalAberto() || !cortes.length) return
      e.preventDefault()
      pararSons()
      if (corte) ver(corte)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
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
              <Opcoes key={corte.plano} corte={corte} b={b} escolher={(tid) => p.escolher(corte, tid)} ver={() => ver(corte)} />
            ) : (
              <p className="text-[12.5px] leading-[1.7] text-fog">
                Cada corte entre planos recebe sozinho a favorita do par (de onde sai → para onde vai).
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

/** As opções do corte selecionado, cada uma com a demonstração (a referência e a recriação lado a lado, como na página
 *  Transições; clicar na prévia toca, com o som da recriação) e o nome embaixo, que escolhe a transição para o corte. */
function Opcoes(p: { corte: CorteDoVideo; b: Biblioteca; escolher: (tid: string | null) => void; ver: () => void }) {
  const { b } = p
  const favoritas = ordemDoPar(b, p.corte.de, p.corte.para)
  const fav = new Set((favoritas?.ids ?? []).slice(0, favoritas?.favoritas ?? 0))
  const ordem = [...(favoritas?.ids ?? []), ...b.transicoes.map((t) => t.id)].filter((x, i, l) => l.indexOf(x) === i)
  const lista = ordem.map((id) => b.transicoes.find((t) => t.id === id)).filter(Boolean) as Transicao[]
  const grupo = parDoGrupo(b, chaveGrupo(familia(p.corte.de) as Grupo, familia(p.corte.para) as Grupo))
  const [demo, setDemo] = useState<string | null>(null)
  useEffect(() => () => pararSons(), [])
  const card = (t: Transicao) => {
    const usada = (p.corte.transicao?.id ?? 'corte-seco') === t.id
    return (
      <div key={t.id} className={cn('grid min-w-0 gap-2 rounded-[8px] p-1.5 ring-1', usada ? 'bg-cream/[0.07] ring-2 ring-cream' : 'ring-transparent')}>
        <Miniatura
          t={t}
          fonte={fonteDaTransicao(b, t, grupo)}
          tocando={demo === t.id}
          tocar={(sim) => {
            pararSons()
            setDemo(sim ? t.id : null)
          }}
          som="recriacao"
          semSelo
        />
        <button
          onClick={() => p.escolher(t.id)}
          title={t.descricao}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-[11.5px] font-semibold',
            usada ? 'bg-cream text-ink' : 'text-cream/80 ring-1 ring-line-dark hover:text-cream hover:ring-cream/40',
          )}
        >
          {fav.has(t.id) && <Star className="size-3 shrink-0 fill-yellow text-yellow" />}
          <span className="min-w-0 flex-1 truncate">{t.nome}</span>
          {usada ? <Check className="size-3.5 shrink-0" /> : t.som && <Volume2 className="size-3 shrink-0 opacity-60" />}
        </button>
      </div>
    )
  }
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-[13px] font-semibold">
          {nomeCat(p.corte.de)} → {nomeCat(p.corte.para)}
        </p>
        <p className="flex items-center gap-2 text-[11.5px] text-fog">
          <span className="tabular-nums">{formatarTempo(p.corte.t)}</span>
          <span>·</span>
          <span className={cn(p.corte.manual && 'text-coral')}>{p.corte.manual ? 'escolhida à mão' : 'a favorita do par'}</span>
          <button onClick={p.ver} className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[11px] font-semibold text-fog hover:text-cream" title="Ver o corte no vídeo (R)">
            <Play className="size-3" /> Ver o corte <kbd className="ml-0.5 rounded-[3px] bg-cream/10 px-1 font-sans text-[10px]">R</kbd>
          </button>
        </p>
        {p.corte.manual && (
          <button onClick={() => p.escolher(null)} className="w-fit text-[11px] text-fog underline-offset-2 hover:text-cream hover:underline">
            Voltar à favorita do par
          </button>
        )}
      </div>
      <div className="grid gap-2">
        <p className="eyebrow text-yellow">Favoritas do par</p>
        <div className="grid grid-cols-2 gap-2">{lista.filter((t) => fav.has(t.id)).map(card)}</div>
      </div>
      <div className="grid gap-2">
        <p className="eyebrow text-fog">Outras transições</p>
        <div className="grid grid-cols-2 gap-2">{lista.filter((t) => !fav.has(t.id)).map(card)}</div>
      </div>
    </div>
  )
}
