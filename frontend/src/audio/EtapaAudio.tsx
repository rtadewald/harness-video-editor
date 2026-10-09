import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AudioLines, Loader2, Pause, Play, SlidersVertical, VolumeX } from 'lucide-react'
import LinhaBase, { type Trilha as TrilhaLinha } from '@/editor/LinhaBase'
import { Alca, Cabecalho, useTamanhos } from '@/inserts/layout'
import type { EventoSom } from '@/editor/sons'
import { cn } from '@/lib/utils'
import { ganhoDucking, urlFaixa, type AudioDoProjeto, type Catalogo, type Limpeza, type Timbre, type Trilha } from './audio'

const LIMPEZAS: { id: Limpeza; nome: string }[] = [
  { id: 'sem', nome: 'Sem' },
  { id: 'leve', nome: 'Leve' },
  { id: 'media', nome: 'Média' },
  { id: 'forte', nome: 'Forte' },
]
const TIMBRES: { id: Timbre; nome: string; dica: string }[] = [
  { id: 'natural', nome: 'Natural', dica: 'A voz como foi gravada (só o corte dos graves abaixo de 80 Hz)' },
  { id: 'quente', nome: 'Quente', dica: 'Mais corpo nos graves, agudos um pouco mais suaves' },
  { id: 'clara', nome: 'Clara', dica: 'Menos embolado nos médios-graves, mais presença' },
]
const FADERS: { id: Trilha; nome: string }[] = [
  { id: 'ator', nome: 'Ator' },
  { id: 'presets', nome: 'Sons dos presets' },
  { id: 'transicoes', nome: 'Transições' },
  { id: 'fundo', nome: 'Fundo' },
]
const LINHA: TrilhaLinha[] = [
  { id: 'voz', nome: 'Voz', alt: 26 },
  { id: 'sons', nome: 'Transições', alt: 22 },
  { id: 'fundo', nome: 'Fundo', alt: 30 },
]

/** A etapa Áudio (SPEC §8.9; docs/audio.md), no arranjo da etapa Inserts, tudo à vista: à esquerda a voz (a limpeza e o
 *  timbre) e a faixa de fundo; no meio a prévia (com a cadeia da voz, os faders e o fundo tocando); à direita o mixer;
 *  embaixo a linha do tempo com as falas, os sons e o fundo (abaixando nas falas). */
export default function EtapaAudio(p: {
  previa: ReactNode
  a: AudioDoProjeto | null
  cat: Catalogo | null
  mudar: (campos: Record<string, unknown>, salvar?: boolean) => void
  falas: [number, number][]
  sons: EventoSom[]
  duracao: number
  tempo: number
  tocando: boolean
  buscar: (t: number) => void
  /** Pausa a prévia (ouvir uma faixa de fundo sozinha). */
  pausar: () => void
}) {
  const [tam, arrastarBorda] = useTamanhos()
  const esq = Math.min(tam.esq, 480)
  const e = p.a?.escolhas
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: `minmax(0,1fr) ${tam.linha}px` }}>
      <div className="relative grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${esq}px minmax(0,1fr) 300px` }}>
        <Alca lado="esq" pos={esq} arrastar={arrastarBorda} />
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line-dark text-cream">
          <Cabecalho icone={AudioLines} titulo="Voz e fundo" />
          <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-4 py-4">{p.a && e ? <Voz a={p.a} mudar={p.mudar} /> : <p className="text-[12px] text-fog">Carregando…</p>}
            {e && <Fundo cat={p.cat} escolhido={e.fundo} escolher={(id) => p.mudar({ fundo: id })} previaTocando={p.tocando} pausarPrevia={p.pausar} />}
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col px-6 pt-5 pb-3">{p.previa}</section>
        <aside className="flex min-h-0 min-w-0 flex-col border-l border-line-dark text-cream">
          <Cabecalho icone={SlidersVertical} titulo="Mixer" />
          <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
            {e && p.cat && (
              <>
                <div className="grid grid-cols-4 items-start gap-2">
                  {FADERS.map((f) => (
                    <Fader
                      key={f.id}
                      nome={f.nome}
                      valor={e.niveis[f.id]}
                      faixa={p.cat!.niveis}
                      mudo={f.id === 'fundo' ? e.fundo_mudo : undefined}
                      desligado={f.id === 'fundo' && !e.fundo}
                      alternarMudo={f.id === 'fundo' ? () => p.mudar({ fundo_mudo: !e.fundo_mudo }) : undefined}
                      mudar={(v, salvar) => p.mudar({ niveis: { [f.id]: v } }, salvar)}
                    />
                  ))}
                </div>
                <p className="text-[11px] leading-[1.6] text-fog">
                  Os faders ajustam cada trilha em volta do nível medido nas referências (0 dB). No MP4, o volume final fica em {p.cat.lufs} LUFS, o padrão do
                  Instagram; a prévia toca no nível de trabalho.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        <LinhaBase duracao={p.duracao} trilhas={LINHA} tempo={p.tempo} tocando={p.tocando} buscar={p.buscar}>
          {({ x, faixa, px }) => (
            <>
              {p.falas.map(([a, b]) => (
                <div key={a} className="absolute rounded-[3px] bg-cream/25" style={{ left: x(a), width: Math.max(x(b - a), 2), top: faixa(0) + 4, height: LINHA[0].alt - 8 }} title="O ator fala" />
              ))}
              {p.sons.map((s) => (
                <div
                  key={`${s.som}@${s.t}`}
                  className={cn('absolute overflow-hidden rounded-[3px] px-1 text-[9px] leading-[22px]', s.grupo === 'transicoes' ? 'bg-coral/25 text-coral' : 'bg-sage/25 text-sage')}
                  style={{ left: x(s.t), width: Math.max(x(s.dur ?? 0.4), 4), top: faixa(1), height: LINHA[1].alt }}
                  title={`${s.som}${s.grupo === 'transicoes' ? ' (transição)' : ''}`}
                >
                  {s.som}
                </div>
              ))}
              {e?.fundo && !e.fundo_mudo && p.cat && <CurvaFundo largura={x(p.duracao)} topo={faixa(2)} alt={LINHA[2].alt} px={px} duracao={p.duracao} falas={p.falas} cat={p.cat} />}
            </>
          )}
        </LinhaBase>
      </div>
    </div>
  )
}

function Botoes<T extends string>(p: { opcoes: { id: T; nome: string; dica?: string }[]; valor: T; escolher: (v: T) => void }) {
  return (
    <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
      {p.opcoes.map((o) => (
        <button
          key={o.id}
          title={o.dica}
          onClick={() => p.escolher(o.id)}
          className={cn('flex-1 rounded-full py-1 text-[11.5px] font-semibold', p.valor === o.id ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
        >
          {o.nome}
        </button>
      ))}
    </div>
  )
}

const AVISO_ISOLAMENTO = 'O isolamento máximo usa o Voice Isolator do ElevenLabs: é pago e envia o áudio da sua voz a esse serviço. Continuar?'

function Voz(p: { a: AudioDoProjeto; mudar: (c: Record<string, unknown>) => void }) {
  const { voz } = p.a.escolhas
  const v = p.a.voz
  const isolamento = voz.limpeza === 'isolamento'
  // ao desligar o isolamento, volta à limpeza de antes dele (ou à Leve, o padrão)
  const [antes, setAntes] = useState<Limpeza>('leve')
  const escolher = (l: Limpeza) => {
    if (l === 'isolamento' && !window.confirm(AVISO_ISOLAMENTO)) return
    if (l === 'isolamento' && !isolamento) setAntes(voz.limpeza)
    p.mudar({ voz: { limpeza: l } })
  }
  return (
    <section className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="flex items-center text-[11px] text-fog">
          Limpeza de ruído
          <span className="ml-auto">
            {(v.estado === 'fila' || v.estado === 'rodando') && (
              <span className="flex items-center gap-1 text-yellow">
                <Loader2 className="size-3 animate-spin" /> limpando… {Math.round((v.progresso ?? 0) * 100)}%
              </span>
            )}
            {v.estado === 'pronta' && <span className="text-sage">pronta</span>}
            {v.estado === 'falta' && <span title="A limpeza começa quando o vídeo da prévia estiver pronto">esperando o vídeo</span>}
            {v.estado === 'erro' && <span className="text-coral" title={v.erro ?? ''}>falhou</span>}
          </span>
        </span>
        <Botoes opcoes={LIMPEZAS} valor={isolamento ? ('' as Limpeza) : voz.limpeza} escolher={escolher} />
        <button
          onClick={() => escolher(isolamento ? antes : 'isolamento')}
          className={cn(
            'w-full rounded-[6px] px-3 py-2 text-left text-[11.5px] ring-1',
            isolamento ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream',
          )}
        >
          <b className="font-semibold">Isolamento máximo</b> <span className="opacity-70">· ElevenLabs (pago; a voz vai para o serviço)</span>
        </button>
        {v.estado === 'erro' && (
          <p className="text-[11px] leading-[1.6] text-coral">
            Não deu para limpar: {v.erro}. A prévia e o MP4 usam a voz original.{' '}
            <button onClick={() => escolher(voz.limpeza)} className="font-semibold text-cream underline underline-offset-2">
              Tentar de novo
            </button>
          </p>
        )}
        <p className="text-[11px] leading-[1.6] text-fog">
          DeepFilterNet, no seu Mac. Leve, Média e Forte deixam o ruído de fundo 6, 12 e 24 dB mais baixo; a fala fica igual. A prévia toca a voz já limpa.
        </p>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[11px] text-fog">Timbre</span>
        <Botoes opcoes={TIMBRES} valor={voz.timbre} escolher={(t) => p.mudar({ voz: { timbre: t } })} />
        <p className="text-[11px] leading-[1.6] text-fog">Depois do timbre, um compressor leve deixa a voz mais por igual.</p>
      </div>
    </section>
  )
}

/** As faixas de fundo. O ▶ de uma faixa a toca sozinha: pausa a prévia (que tocaria a voz e o fundo escolhido junto);
 *  dar play na prévia para a faixa que se estava ouvindo. */
function Fundo(p: { cat: Catalogo | null; escolhido: string | null; escolher: (id: string | null) => void; previaTocando: boolean; pausarPrevia: () => void }) {
  const [ouvindo, setOuvindo] = useState<string | null>(null)
  const el = useRef<HTMLAudioElement | null>(null)
  const [previaAntes, setPreviaAntes] = useState(p.previaTocando)
  if (p.previaTocando !== previaAntes) {
    setPreviaAntes(p.previaTocando)
    if (p.previaTocando && ouvindo) setOuvindo(null)
  }
  useEffect(() => {
    el.current?.pause()
    if (!ouvindo) return
    const a = new Audio(urlFaixa(ouvindo))
    a.onended = () => setOuvindo(null)
    void a.play().catch(() => setOuvindo(null))
    el.current = a
    return () => a.pause()
  }, [ouvindo])
  const faixas = p.cat?.trilhas ?? []
  return (
    <section className="grid gap-1.5">
      <span className="text-[11px] text-fog">Faixa de fundo</span>
      <button
        onClick={() => p.escolher(null)}
        className={cn('rounded-[6px] px-3 py-2 text-left text-[12px] font-semibold ring-1', !p.escolhido ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}
      >
        Sem fundo
      </button>
      {!faixas.length && <p className="text-[11px] text-fog">Nenhuma faixa ainda: o Claude gera a biblioteca a partir da música das referências (docs/audio.md).</p>}
      {faixas.map((f) => (
        <div
          key={f.id}
          className={cn('flex items-center gap-2 rounded-[6px] px-2 py-1.5 ring-1', p.escolhido === f.id ? 'bg-cream/10 ring-cream/60' : 'ring-line-dark')}
        >
          <button
            onClick={() => {
              if (ouvindo !== f.id && p.previaTocando) p.pausarPrevia()
              setOuvindo(ouvindo === f.id ? null : f.id)
            }}
            className="grid size-7 shrink-0 place-items-center rounded-full bg-cream/10 hover:bg-cream/20"
            title={ouvindo === f.id ? 'Parar' : 'Ouvir a faixa'}
          >
            {ouvindo === f.id ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button onClick={() => p.escolher(f.id)} className="grid min-w-0 flex-1 text-left" title={f.descricao}>
            <span className="truncate text-[12px] font-semibold">{f.nome}</span>
            <span className="truncate text-[10.5px] text-fog">
              {[f.clima, f.bpm && `${Math.round(f.bpm)} BPM`, f.duracao && `${Math.floor(f.duracao / 60)}:${String(Math.round(f.duracao % 60)).padStart(2, '0')}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        </div>
      ))}
    </section>
  )
}

/** Um fader vertical em dB (a prévia muda enquanto arrasta; o servidor recebe quando para). */
/** `desligado`: a trilha não existe neste vídeo (o Fundo, com "Sem fundo"). */
function Fader(p: {
  nome: string
  valor: number
  faixa: [number, number]
  mudo?: boolean
  desligado?: boolean
  alternarMudo?: () => void
  mudar: (v: number, salvar: boolean) => void
}) {
  const salvar = useRef(0)
  const mover = (v: number) => {
    p.mudar(v, false)
    window.clearTimeout(salvar.current)
    salvar.current = window.setTimeout(() => p.mudar(v, true), 350)
  }
  return (
    <div className={cn('grid content-start justify-items-center gap-1.5', (p.mudo || p.desligado) && 'opacity-50')} title={p.desligado ? 'Sem faixa de fundo' : undefined}>
      <span className="text-[11px] font-semibold text-cream tabular-nums">{p.valor > 0 ? `+${p.valor.toFixed(1)}` : p.valor.toFixed(1)}</span>
      <input
        type="range"
        min={p.faixa[0]}
        max={p.faixa[1]}
        step={0.5}
        value={p.valor}
        onChange={(x) => mover(Number(x.target.value))}
        onDoubleClick={() => mover(0)}
        disabled={p.desligado}
        aria-label={p.nome}
        title="Duplo clique: 0 dB"
        className="h-40 accent-coral [direction:rtl] [writing-mode:vertical-lr]"
      />
      <span className="min-h-[2.6em] text-center text-[10.5px] leading-[1.3] text-fog">{p.nome}</span>
      {p.alternarMudo && (
        <button onClick={p.alternarMudo} disabled={p.desligado} className={cn('grid size-6 place-items-center rounded-full', p.mudo ? 'bg-coral text-ink' : 'text-fog hover:text-cream')} title={p.mudo ? 'Ligar o fundo' : 'Fundo mudo'}>
          <VolumeX className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/** O fundo na linha do tempo: a altura da faixa acompanha o ganho (abaixa nas falas, some no fim). */
function CurvaFundo(p: { largura: number; topo: number; alt: number; px: number; duracao: number; falas: [number, number][]; cat: Catalogo }) {
  const passo = Math.max(2 / p.px, 0.05)
  const pontos: string[] = []
  for (let t = 0; t <= p.duracao; t += passo) {
    const fade = Math.min(Math.max((p.duracao - t) / p.cat.fade_fundo, 0), 1)
    const g = ganhoDucking(p.falas, t, p.cat) * fade
    pontos.push(`${(t * p.px).toFixed(1)},${(p.alt - g * (p.alt - 4)).toFixed(1)}`)
  }
  return (
    <svg className="absolute" style={{ left: 0, top: p.topo, width: p.largura, height: p.alt }}>
      <title>O nível do fundo</title>
      <polygon points={`0,${p.alt} ${pontos.join(' ')} ${(p.duracao * p.px).toFixed(1)},${p.alt}`} className="fill-yellow/20 stroke-yellow/60" strokeWidth={1} />
    </svg>
  )
}
