import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pause, Play, Settings2, Trash2 } from 'lucide-react'
import { urlAmostraPreset, urlArquivoReferencia } from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import EditorPreset from '@/editor/EditorPreset'
import CardAjustes from '@/editor/CardAjustes'
import Simulacao, { aspectosSim, type MidiasSim, type Sim } from '@/editor/Simulacao'
import type { Ajustes } from '@/editor/ajustes'
import { telaTodaPermitida } from '@/editor/divisao'
import CenaPreset from '@/editor/CenaPreset'
import { apagarPreset, editarPreset, nMidias, paraMidias, type Preset } from '@/editor/presets'
import { versao } from './comum'
import { OndeVale, Simulador, SonsDoPreset } from './Avaliacao'

const minSeg = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** Um preset, no estilo dos cards da Home: a referência e a recriação coladas numa miniatura, paradas no repouso; clicar
 *  toca as duas em loop, em sincronia (a recriação segue o relógio do vídeo de referência). A engrenagem abre o editor
 *  ao lado (o card ocupa a linha toda). */
export default function CardPreset({ p, aberto, abrir, tocando, tocar, midiasSim }: { p: Preset; aberto: boolean; abrir: () => void; tocando: boolean; tocar: (sim: boolean) => void; midiasSim: MidiasSim | null }) {
  // a situação simulada (null: como na referência) e os ajustes rápidos experimentados nela
  const [sim, setSim] = useState<Sim | null>(null)
  const [simAjustes, setSimAjustes] = useState<Ajustes | undefined>(undefined)
  const [k, setK] = useState(0) // qual referência (um preset pode vir de várias)
  const fonte = p.fontes[Math.min(k, p.fontes.length - 1)]
  const video = useRef<HTMLVideoElement>(null)
  const linha = useRef<HTMLElement>(null)
  const [t, setT] = useState(0)
  // o loop já andou um quadro: os sons ligam aí, com o relógio no começo do trecho (no clique, `t` ainda é o repouso, e
  // o play "no meio" faria um som que já passou entrar adiantado — o riser do Sobe e mergulha tocava duas vezes)
  const [rodando, setRodando] = useState(false)
  const [carregando, setCarregando] = useState(false)
  // fora da tela, para e solta o vídeo: o navegador abre poucas conexões por servidor, e vídeos baixando fora da tela
  // seguram as dos que estão à vista (o play travava no começo do trecho)
  const [visivel, setVisivel] = useState(false)
  useEffect(() => {
    const el = linha.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const dur = fonte ? fonte.fim - fonte.inicio : p.receita.duracao_ref
  const simulando = useRef(false)
  const [reinicio, setReinicio] = useState(0) // o R recomeça também a simulação
  simulando.current = !!(sim || simAjustes)
  // o instante de repouso: depois da última entrada (é o quadro que aparece parado)
  const repouso = Math.min(Math.max(...p.receita.cards.map((c) => c.inicio_frac * dur + (c.entrada?.duracao ?? 0))) + 0.1, dur - 0.05)
  // no modal, R recomeça: o trecho do começo (tocando) e os vídeos da simulação do início, para ver o efeito de novo
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      const v = video.current
      if (v && fonte) v.currentTime = fonte.inicio
      document.querySelectorAll<HTMLVideoElement>('.fixed video').forEach((x) => x !== v && (x.currentTime = 0))
      setReinicio((x) => x + 1)
      if (!tocando) tocar(true)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
  const url = fonte ? (fonte.ref.startsWith('externa:') ? `/api/presets/externa/${fonte.ref.slice(8)}` : urlArquivoReferencia(fonte.ref, 'proxy.mp4')) : null
  useEffect(() => {
    const v = video.current
    if (v && url && v.getAttribute('src') !== url) v.src = url
  }, [tocando, url])
  useEffect(() => {
    const v = video.current
    if (!v || !tocando) return setCarregando(false)
    const esperando = () => setCarregando(true)
    const andando = () => setCarregando(false)
    setCarregando(v.readyState < 3)
    v.addEventListener('waiting', esperando)
    v.addEventListener('playing', andando)
    return () => {
      v.removeEventListener('waiting', esperando)
      v.removeEventListener('playing', andando)
    }
  }, [tocando])
  useEffect(() => {
    const v = video.current
    if (!tocando || !visivel || !v || !fonte) {
      setT(repouso) // parado: a recriação no repouso, junto da foto da referência
      setRodando(false)
      if (tocando && !visivel) tocar(false)
      return
    }
    let id = 0
    const passo = () => {
      // simulando, o loop é só o do efeito (até 5 s) e as mídias da simulação recomeçam junto
      const fim = simulando.current ? Math.min(fonte.fim, fonte.inicio + 5) : fonte.fim
      if (v.currentTime >= fim || v.currentTime < fonte.inicio - 0.2) {
        v.currentTime = fonte.inicio
        if (simulando.current) document.querySelectorAll<HTMLVideoElement>('.fixed video').forEach((x) => x !== v && (x.currentTime = 0))
      }
      setT(Math.max(v.currentTime - fonte.inicio, 0))
      setRodando(true)
      id = requestAnimationFrame(passo)
    }
    v.currentTime = fonte.inicio
    void v.play().catch(() => {})
    id = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(id)
      v.pause()
      setRodando(false)
    }
  }, [fonte?.ref, fonte?.inicio, fonte?.fim, tocando, visivel, repouso]) // eslint-disable-line react-hooks/exhaustive-deps
  const area = p.formato === 'vertical' ? 'aspect-[9/16]' : 'aspect-[9/8]'
  // referência | recriação; no grid, ou no modal da engrenagem (só um lugar por vez: o vídeo é um só)
  const miniatura = (
        <div
          role="button"
          tabIndex={0}
          onClick={() => tocar(!tocando)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tocar(!tocando))}
          className="group relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden [contain:paint] rounded-[6px] bg-line-dark ring-1 ring-line-dark transition-[box-shadow] hover:ring-2 hover:ring-coral"
          title={tocando ? 'Parar' : 'Tocar em loop (referência e recriação juntas)'}
        >
          <div className="relative aspect-[9/16] w-full self-start overflow-hidden bg-black [contain:paint]">
            {fonte && <img src={`/api/presets/quadro/${encodeURIComponent(fonte.ref)}?t=${(fonte.inicio + repouso).toFixed(2)}`} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
            {/* o vídeo só existe tocando: 15 vídeos abertos ao mesmo tempo esgotavam as conexões do navegador */}
            {fonte && tocando && <video ref={video} muted playsInline preload="auto" className="absolute inset-0 size-full object-cover" />}
          </div>
          <div className="relative aspect-[9/16] w-full self-start overflow-hidden bg-black [contain:paint]">
            {/* simulando: o quadro inteiro na situação escolhida; senão, a recriação na mesma área da referência */}
            {sim || simAjustes ? (
              <Simulacao
                preset={p}
                sim={sim ?? { tela: p.formato === 'vertical' ? 'vertical' : 'dividida', n: Math.max(nMidias(p.receita), p.receita.repete ? 2 : 1), prop: 'deitada' }}
                ajustes={simAjustes}
                midias={midiasSim}
                tocando={tocando}
                reinicio={reinicio}
                t={t}
                dur={dur}
                midia={(k) => urlAmostraPreset(p.id, k % Math.max(p.recortes?.length ?? 1, 1), versao(p, k % Math.max(p.recortes?.length ?? 1, 1)))}
                className="absolute inset-0"
              />
            ) : (
            <div className={cn('absolute inset-x-0 top-0', area)}>
              <CenaPreset
                // uma mídia por recorte: quantas a referência mostra no trecho (nem mais, nem menos)
                receita={paraMidias(p.receita, Math.max(p.recortes?.length ?? 0, 1))}
                rel={t}
                dur={dur}
                sons={tocando && rodando}
                fundo="gradiente"
                className="inset-0"
                midia={(j, _rel, topo) => {
                  const a = j % Math.max(p.recortes?.length ?? 1, 1) // um card além dos recortes repete as amostras
                  const rc = p.recortes?.[a]
                  // tocando: a mídia é o próprio vídeo da referência, recortado onde o card está (o conteúdo anda como lá)
                  if (tocando && fonte && url && rc?.quad && !cresce(p.receita.cards[j] ?? p.receita.cards[0])) return <MidiaDaReferencia src={url} quad={rc.quad} t0={fonte.inicio + rc.t} agora={fonte.inicio + t} />
                  return <img src={urlAmostraPreset(p.id, a, versao(p, a))} alt="" className={cn('size-full object-cover', topo && 'object-top')} />
                }}
              />
            </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b1714e6] to-transparent" />
          <span className="absolute bottom-2.5 left-2.5 text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">Referência</span>
          <span className="absolute bottom-2.5 left-[calc(50%+10px)] text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">{sim || simAjustes ? 'Simulação' : 'Recriação'}</span>
          <span className={cn('absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase', p.aprovado ? 'bg-mint text-ink' : 'bg-coral text-cream')}>
            {p.aprovado ? 'Aprovado' : 'A revisar'}
          </span>
          <span className={cn('absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-ink/80 text-cream transition-opacity', tocando && !carregando ? 'opacity-0 group-hover:opacity-100' : 'opacity-90')}>
            {carregando ? <Loader2 className="size-4 animate-spin" /> : tocando ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px fill-current" />}
          </span>
        </div>
  )
  const [cardAberto, setCardAberto] = useState(0) // a mídia em edição no modal (as duas partes do editor)
  const icone = 'grid size-8 shrink-0 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream'
  return (
    <section ref={linha} className="grid min-w-0 grid-cols-1 content-start">
      <div className="grid min-w-0 grid-cols-1 content-start">
        {aberto ? (
          <div className="grid aspect-[9/8] place-items-center rounded-[6px] text-[12px] text-fog ring-1 ring-line-dark">editando…</div>
        ) : (
          miniatura
        )}
        <div className="mt-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]" title={p.nome}>
              {p.nome}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fog">
              {!p.formatos || p.formatos.length === 2 ? 'Tela cheia e dividida' : p.formato === 'vertical' ? 'Tela cheia' : 'Tela dividida'} · {p.receita.repete ? '2 ou mais mídias' : `${nMidias(p.receita)} mídia${nMidias(p.receita) > 1 ? 's' : ''}`}
              {fonte && (
                <span title="De onde veio">
                  · {fonte.ref.replace('externa:', 'externa · ')} {minSeg(fonte.inicio)}
                </span>
              )}
              {p.fontes.length > 1 &&
                p.fontes.map((_, j) => (
                  <button key={j} onClick={() => setK(j)} className={cn('rounded-full px-1.5 text-[10.5px]', j === k ? 'bg-cream/15 text-cream' : 'hover:text-cream')} title="Qual referência mostrar">
                    ref {j + 1}
                  </button>
                ))}
            </p>
          </div>
          <button
            onClick={() => void editarPreset(p.id, { aprovado: !p.aprovado })}
            className={cn(icone, p.aprovado ? 'bg-mint text-ink hover:bg-mint/80 hover:text-ink' : 'text-mint hover:bg-mint/15 hover:text-mint')}
            title={p.aprovado ? 'Aprovado (clique para tirar a aprovação)' : 'Aprovar'}
            aria-label={p.aprovado ? 'Tirar a aprovação' : 'Aprovar'}
          >
            <Check className="size-4" />
          </button>
          <button
            onClick={() => window.confirm(`Descartar o preset “${p.nome}”? (os inserts que o usam voltam ao manual)`) && void apagarPreset(p.id)}
            className={cn(icone, 'text-coral hover:bg-coral/15 hover:text-coral')}
            title="Descartar"
            aria-label="Descartar"
          >
            <Trash2 className="size-4" />
          </button>
          <button onClick={abrir} className={cn(icone, aberto && 'bg-coral text-cream hover:bg-coral')} title="Ajustar" aria-label="Ajustar">
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>
      {aberto && (
        <Modal
          titulo={
            <span className="flex items-center gap-4">
              <NomeEditavel preset={p} />
              <button
                onClick={() => void editarPreset(p.id, { aprovado: !p.aprovado })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors',
                  p.aprovado ? 'bg-mint text-ink hover:bg-mint/80' : 'bg-coral text-cream hover:bg-coral/85',
                )}
                title={p.aprovado ? 'Clique para tirar a aprovação' : 'Aprovar este preset'}
              >
                <Check className="size-4" /> {p.aprovado ? 'Aprovado' : 'Aprovar'}
              </button>
            </span>
          }
          fechar={() => {
            tocar(false) // fechou o modal: a prévia (e os sons) param
            abrir()
          }}
          tamanho="cheia"
        >
          {/* à esquerda a prévia, o simulador (situações de uso), os ajustes rápidos e onde o preset vale; à direita a receita */}
          <div className="flex min-h-0 flex-1 gap-8">
            <div className="w-[504px] shrink-0 space-y-5 overflow-y-auto p-0.5 pr-1.5">
              <div>{miniatura}</div>
              <Simulador preset={p} sim={sim} setSim={setSim} />
              <OndeVale preset={p} />
              <SonsDoPreset preset={p} />
            </div>
            <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto p-0.5 pr-1.5">
              <EditorPreset
                topo={
                  <div className="rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
                    <p className="eyebrow mb-3 text-sage">Ajustes rápidos {sim ? '· na simulação' : ''}</p>
                    <CardAjustes preset={p} ajustes={simAjustes} aspectos={sim ? aspectosSim(sim) : []} telaToda={sim ? telaTodaPermitida(sim.tela === 'vertical' ? 'vertical' : 'dividida', sim.tela === 'atras', aspectosSim(sim)) : undefined} mudar={(a) => setSimAjustes(a ?? undefined)} />
                  </div>
                }
                preset={p}
                parte="lugar" colunas card={cardAberto} escolherCard={setCardAberto} />
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}

/** O card muda de tamanho no trecho (entra ou sai crescendo, zoom, câmera lenta)? Aí o vídeo da referência recortado num
 *  retângulo fixo cresceria junto com o card (zoom em dobro): fica a foto parada. */
const cresce = (c: Preset['receita']['cards'][number]) =>
  Math.abs((c.entrada && 'de' in c.entrada ? c.entrada.de.escala : 1) - 1) > 0.02 ||
  Math.abs((c.saida && 'para' in c.saida ? c.saida.para.escala : 1) - 1) > 0.02 ||
  !!c.zoom ||
  Math.abs(c.continuo?.escala ?? 0) > 0.001

/** A mídia de um card na recriação, tocando: o vídeo da referência recortado no retângulo do card (`quad`, px de um quadro
 *  9:16 de 720×1280), no relógio da referência (`agora`); antes de `t0` (o instante em que o card foi recortado, já
 *  parado) fica nesse quadro, para a entrada não mostrar o fundo. */
function MidiaDaReferencia({ src, quad, t0, agora }: { src: string; quad: [number, number][]; t0: number; agora: number }) {
  const v = useRef<HTMLVideoElement>(null)
  const xs = quad.map((q) => q[0])
  const ys = quad.map((q) => q[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  useEffect(() => {
    const el = v.current
    if (!el || el.readyState < 1) return
    const alvo = Math.max(agora, t0)
    if (Math.abs(el.currentTime - alvo) > 0.25) el.currentTime = alvo
    if (agora >= t0 && el.paused) void el.play().catch(() => {})
    if (agora < t0 && !el.paused) el.pause()
  }, [agora, t0])
  return (
    <div className="relative size-full overflow-hidden">
      <video
        ref={v}
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => (e.currentTarget.currentTime = Math.max(agora, t0))}
        className="absolute max-w-none object-cover"
        style={{
          width: `${(720 / (x1 - x0)) * 100}%`,
          height: `${(1280 / (y1 - y0)) * 100}%`,
          left: `${(-x0 / (x1 - x0)) * 100}%`,
          top: `${(-y0 / (y1 - y0)) * 100}%`,
        }}
      />
    </div>
  )
}

/** O nome do preset no título do modal: dois cliques editam. */
function NomeEditavel({ preset }: { preset: Preset }) {
  const [editando, setEditando] = useState(false)
  if (!editando)
    return (
      <span onDoubleClick={() => setEditando(true)} title="Dois cliques para renomear" className="cursor-text">
        {preset.nome}
      </span>
    )
  return (
    <input
      autoFocus
      defaultValue={preset.nome}
      onBlur={(e) => {
        setEditando(false)
        const v = e.target.value.trim()
        if (v && v !== preset.nome) void editarPreset(preset.id, { nome: v }).catch((x) => window.alert((x as Error).message))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.preventDefault() // só sai da edição do nome; o modal continua aberto
          setEditando(false)
        }
      }}
      className="w-[420px] rounded-[4px] border border-cream/30 bg-transparent px-1.5 text-[16px] font-semibold text-cream outline-none"
    />
  )
}
