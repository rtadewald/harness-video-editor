import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pause, Play, Settings2, Trash2, X } from 'lucide-react'
import { urlAmostraPreset, urlArquivoReferencia } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import EditorPreset from '@/editor/EditorPreset'
import CenaPreset from '@/editor/CenaPreset'
import { apagarPreset, editarPreset, usePresets, type Preset } from '@/editor/presets'

/** A revisão dos presets (SPEC §8.4): cada um numa miniatura com o trecho de referência de onde veio e a recriação lado
 *  a lado (a recriação segue o relógio do próprio vídeo de referência, então os dois andam juntos), o editor e
 *  aprovar/descartar. Só os aprovados aparecem no Enriquecimento. Os presets são feitos pelo Claude, a partir de trechos
 *  que o criador manda. */
const minSeg = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
/** Muda quando a posição parada do card muda (o recorte da referência é refeito). */
const versao = (p: Preset, j: number) => {
  const c = p.receita.cards[j]
  let h = 0
  for (const ch of JSON.stringify([p.fontes[0], c?.repouso, c?.inicio_frac, c?.entrada?.duracao])) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

export default function Presets() {
  const presets = usePresets()
  const [filtro, setFiltro] = useState<'pendentes' | 'aprovados' | 'todos'>('todos')
  const [aberto, setAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null) // um por vez

  const passa = (f: typeof filtro, p: Preset) => (f === 'todos' ? true : f === 'aprovados' ? p.aprovado : !p.aprovado)
  const lista = (presets ?? []).filter((p) => passa(filtro, p))

  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <nav className="flex flex-wrap items-center gap-2 border-b border-line-dark px-6 py-3 text-[12px]">
        {(['todos', 'pendentes', 'aprovados'] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={cn('h-8 rounded-full border px-3.5 font-semibold', filtro === f ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}>
            {f === 'todos' ? 'Todos' : f === 'pendentes' ? 'A revisar' : 'Aprovados'}{' '}
            <span className="opacity-60">{(presets ?? []).filter((p) => passa(f, p)).length}</span>
          </button>
        ))}
      </nav>
      <main className="overflow-y-auto px-6 py-6">
        {presets && !presets.length && <p className="text-[13px] text-fog">Nenhum preset ainda. Mande ao Claude o trecho de uma referência (ou um print) e ele monta o preset.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-x-6 gap-y-8">
          {lista.map((p) => (
            <Linha
              key={p.id}
              p={p}
              aberto={aberto === p.id}
              abrir={() => setAberto(aberto === p.id ? null : p.id)}
              tocando={tocando === p.id}
              tocar={(sim) => setTocando(sim ? p.id : null)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

/** Um preset, no estilo dos cards da Home: a referência e a recriação coladas numa miniatura, paradas no repouso; clicar
 *  toca as duas em loop, em sincronia (a recriação segue o relógio do vídeo de referência). A engrenagem abre o editor
 *  ao lado (o card ocupa a linha toda). */
function Linha({ p, aberto, abrir, tocando, tocar }: { p: Preset; aberto: boolean; abrir: () => void; tocando: boolean; tocar: (sim: boolean) => void }) {
  const [k, setK] = useState(0) // qual referência (um preset pode vir de várias)
  const fonte = p.fontes[Math.min(k, p.fontes.length - 1)]
  const video = useRef<HTMLVideoElement>(null)
  const linha = useRef<HTMLElement>(null)
  const [t, setT] = useState(0)
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
  // o instante de repouso: depois da última entrada (é o quadro que aparece parado)
  const repouso = Math.min(Math.max(...p.receita.cards.map((c) => c.inicio_frac * dur + (c.entrada?.duracao ?? 0))) + 0.1, dur - 0.05)
  const url = fonte ? urlArquivoReferencia(fonte.ref, 'proxy.mp4') : null
  useEffect(() => {
    const v = video.current
    if (!v || !url) return
    if (visivel) {
      if (v.getAttribute('src') !== url) v.src = url
    } else if (v.getAttribute('src')) {
      v.removeAttribute('src')
      v.load() // corta o download
    }
  }, [visivel, url])
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
    if (!v || !fonte || !visivel) return
    const parar = () => {
      v.pause()
      v.currentTime = fonte.inicio + repouso
      setT(repouso)
    }
    if (!tocando) {
      if (v.readyState >= 1) parar()
      else v.addEventListener('loadedmetadata', parar, { once: true })
      return
    }
    let id = 0
    const passo = () => {
      if (v.currentTime >= fonte.fim || v.currentTime < fonte.inicio - 0.2) v.currentTime = fonte.inicio
      setT(Math.max(v.currentTime - fonte.inicio, 0))
      id = requestAnimationFrame(passo)
    }
    v.currentTime = fonte.inicio
    void v.play().catch(() => {})
    id = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(id)
      v.pause()
    }
  }, [fonte?.ref, fonte?.inicio, fonte?.fim, tocando, visivel, repouso]) // eslint-disable-line react-hooks/exhaustive-deps
  const area = p.formato === 'vertical' ? 'aspect-[9/16]' : 'aspect-[9/8]'
  const icone = 'grid size-8 shrink-0 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream'
  return (
    <section ref={linha} className={cn('grid min-w-0 grid-cols-1 content-start', aberto && 'col-span-full grid-cols-[minmax(0,460px)_minmax(0,380px)] gap-8')}>
      <div className="grid min-w-0 grid-cols-1 content-start">
        {/* referência | recriação numa miniatura só; clicar toca as duas em loop */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => tocar(!tocando)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tocar(!tocando))}
          className="group relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden [contain:paint] rounded-[6px] bg-line-dark ring-1 ring-line-dark transition-[box-shadow] hover:ring-2 hover:ring-coral"
          title={tocando ? 'Parar' : 'Tocar em loop (referência e recriação juntas)'}
        >
          <div className="relative aspect-[9/16] w-full self-start overflow-hidden bg-black [contain:paint]">
            {fonte && <video ref={video} muted playsInline preload="auto" className="absolute inset-0 size-full object-cover" />}
          </div>
          <div className="relative aspect-[9/16] w-full self-start overflow-hidden bg-black [contain:paint]">
            {/* a recriação na mesma área da referência (tela dividida: a metade de cima) */}
            <div className={cn('absolute inset-x-0 top-0', area)}>
              <CenaPreset
                receita={p.receita}
                rel={t}
                dur={dur}
                fundo="gradiente"
                className="inset-0"
                midia={(j, _rel, topo) => <img src={urlAmostraPreset(p.id, j, versao(p, j))} alt="" className={cn('size-full object-cover', topo && 'object-top')} />}
              />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b1714e6] to-transparent" />
          <span className="absolute bottom-2.5 left-2.5 text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">Referência</span>
          <span className="absolute bottom-2.5 left-[calc(50%+10px)] text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">Recriação</span>
          <span className={cn('absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase', p.aprovado ? 'bg-mint text-ink' : 'bg-coral text-cream')}>
            {p.aprovado ? 'Aprovado' : 'A revisar'}
          </span>
          <span className={cn('absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-ink/80 text-cream transition-opacity', tocando && !carregando ? 'opacity-0 group-hover:opacity-100' : 'opacity-90')}>
            {carregando ? <Loader2 className="size-4 animate-spin" /> : tocando ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px fill-current" />}
          </span>
        </div>
        <div className="mt-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em]" title={p.nome}>
              {p.nome}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-fog">
              {p.formato === 'vertical' ? 'Tela cheia' : 'Tela dividida'} · {p.receita.cards.length} mídia{p.receita.cards.length > 1 ? 's' : ''}
              {fonte && (
                <span title="De onde veio">
                  · {fonte.ref} {minSeg(fonte.inicio)}
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
            className={cn(icone, p.aprovado && 'text-mint hover:text-mint')}
            title={p.aprovado ? 'Tirar a aprovação' : 'Aprovar'}
            aria-label={p.aprovado ? 'Tirar a aprovação' : 'Aprovar'}
          >
            {p.aprovado ? <X className="size-4" /> : <Check className="size-4" />}
          </button>
          <button onClick={abrir} className={cn(icone, aberto && 'bg-coral text-cream hover:bg-coral')} title="Ajustar" aria-label="Ajustar">
            <Settings2 className="size-4" />
          </button>
          <button
            onClick={() => window.confirm(`Descartar o preset “${p.nome}”? (os inserts que o usam voltam ao manual)`) && void apagarPreset(p.id)}
            className={cn(icone, 'hover:text-coral')}
            title="Descartar"
            aria-label="Descartar"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      {aberto && (
        <div className="max-h-[720px] overflow-y-auto pr-1">
          <EditorPreset preset={p} ver={() => tocar(true)} />
        </div>
      )}
    </section>
  )
}
