import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pause, Play, Settings2, Star, Trash2 } from 'lucide-react'
import { abrirProjeto, listarBanco, listarProjetos, urlAmostraPreset, urlArquivo, urlArquivoReferencia, urlBancoArquivo } from '@/api'
import { Logo } from '@/components/Marca'
import Modal from '@/components/Modal'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import EditorPreset from '@/editor/EditorPreset'
import CardAjustes from '@/editor/CardAjustes'
import Simulacao, { PROPORCOES, TELAS, aspectosSim, type MidiasSim, type Sim } from '@/editor/Simulacao'
import { AJUSTES, rapidosDe, type Ajustes } from '@/editor/ajustes'
import { telaTodaPermitida } from '@/editor/divisao'
import CenaPreset from '@/editor/CenaPreset'
import {
  apagarPreset,
  comRecomendados,
  definirOrdem,
  editarPreset,
  N_RECOMENDADOS,
  nMidias,
  paraMidias,
  PROPORCOES_USO,
  recarregarOrdem,
  recarregarPresets,
  serve,
  situacao,
  type ProporcaoSituacao,
  useOrdem,
  usePresets,
  usosDe,
  type Preset,
  type Proporcao,
  type Usos,
} from '@/editor/presets'

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

/** Os vídeos para as simulações: do banco, separados pela proporção, e o ator (o projeto mais recente: o proxy do bruto e,
 *  se já recortado, só a pessoa). */
function useMidiasSim(): MidiasSim | null {
  const [m, setM] = useState<MidiasSim | null>(null)
  useEffect(() => {
    void (async () => {
      const banco = await listarBanco('', 'video').catch(() => [])
      const de = (f: (a: number) => boolean) => banco.filter((i) => i.largura && i.altura && f(i.largura / i.altura)).map((i) => urlBancoArquivo(i.id))
      let ator: MidiasSim['ator'] = null
      const [prj] = await listarProjetos().catch(() => [])
      if (prj) {
        const p = await abrirProjeto(prj.id).catch(() => null)
        const b = p?.fontes.find((f) => f.papel === 'bruto')
        if (p && b)
          ator = {
            video: urlArquivo(p.id, `midia/proxy/${b.id}.mp4`),
            pessoa: p.recorte?.estado === 'pronto' ? urlArquivo(p.id, `midia/recorte/${b.id}_pessoa.webm`) : null,
          }
      }
      setM({ pe: de((a) => a < 0.8), h43: de((a) => a >= 1.2 && a < 1.5), h169: de((a) => a >= 1.5), ator })
    })()
  }, [])
  return m
}

export default function Presets() {
  const presets = usePresets()
  const midiasSim = useMidiasSim()
  const [filtro, setFiltro] = useState<'pendentes' | 'aprovados' | 'todos'>('todos')
  const [qtd, setQtd] = useState<'todas' | '1' | '2' | '3+'>('todas') // quantas mídias o preset pede
  const [aberto, setAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null) // um por vez
  const [ordenando, setOrdenando] = useState(false)

  const passa = (f: typeof filtro, p: Preset) => (f === 'todos' ? true : f === 'aprovados' ? p.aprovado : !p.aprovado)
  // os que faltam revisar primeiro (a ordem fica a mesma dentro de cada grupo)
  const temQtd = (q: typeof qtd, p: Preset) =>
    q === 'todas' || (p.receita.repete ? q !== '1' : q === '3+' ? nMidias(p.receita) >= 3 : nMidias(p.receita) === Number(q))
  const lista = (presets ?? []).filter((p) => passa(filtro, p) && temQtd(qtd, p)).sort((a, b) => Number(a.aprovado) - Number(b.aprovado))

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
            <span className="opacity-60">{(presets ?? []).filter((p) => passa(f, p) && temQtd(qtd, p)).length}</span>
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line-dark" />
        {(['todas', '1', '2', '3+'] as const).map((q) => (
          <button key={q} onClick={() => setQtd(q)} className={cn('h-8 rounded-full border px-3.5 font-semibold', qtd === q ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}>
            {q === 'todas' ? 'Qualquer nº de mídias' : q === '1' ? '1 mídia' : q === '2' ? '2 mídias' : '3 ou mais'}{' '}
            <span className="opacity-60">{(presets ?? []).filter((p) => passa(filtro, p) && temQtd(q, p)).length}</span>
          </button>
        ))}
        <button
          onClick={() => {
            void recarregarOrdem()
            setOrdenando(true)
          }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-line-dark px-3.5 font-semibold text-fog hover:text-cream"
          title="Os 3 presets favoritos de cada situação, que ficam em cima no Enriquecimento"
        >
          <Star className="size-3.5" /> Recomendados
        </button>
      </nav>
      {ordenando && presets && <OrdemPresets presets={presets} fechar={() => setOrdenando(false)} />}
      <main className="overflow-y-auto px-6 py-6">
        {presets && !presets.length && <p className="text-[13px] text-fog">Nenhum preset ainda. Mande ao Claude o trecho de uma referência (ou um print) e ele monta o preset.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-x-6 gap-y-8">
          {lista.map((p) => (
            <Linha
              midiasSim={midiasSim}
              key={p.id}
              p={p}
              aberto={aberto === p.id}
              abrir={() => {
                if (aberto !== p.id) void recarregarPresets() // abre com o preset como está no servidor agora
                setAberto(aberto === p.id ? null : p.id)
              }}
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
function Linha({ p, aberto, abrir, tocando, tocar, midiasSim }: { p: Preset; aberto: boolean; abrir: () => void; tocando: boolean; tocar: (sim: boolean) => void; midiasSim: MidiasSim | null }) {
  // a situação simulada (null: como na referência) e os ajustes rápidos experimentados nela
  const [sim, setSim] = useState<Sim | null>(null)
  const [simAjustes, setSimAjustes] = useState<Ajustes | undefined>(undefined)
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
                receita={paraMidias(p.receita, Math.max(p.recortes?.length ?? 0, 2))}
                rel={t}
                dur={dur}
                fundo="gradiente"
                className="inset-0"
                midia={(j, _rel, topo) => {
                  const rc = p.recortes?.[j]
                  // tocando: a mídia é o próprio vídeo da referência, recortado onde o card está (o conteúdo anda como lá)
                  if (tocando && fonte && url && rc?.quad && !cresce(p.receita.cards[j] ?? p.receita.cards[0])) return <MidiaDaReferencia src={url} quad={rc.quad} t0={fonte.inicio + rc.t} agora={fonte.inicio + t} />
                  return <img src={urlAmostraPreset(p.id, j, versao(p, j))} alt="" className={cn('size-full object-cover', topo && 'object-top')} />
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
          fechar={abrir}
          tamanho="cheia"
        >
          {/* à esquerda a prévia, o simulador (situações de uso), os ajustes rápidos e onde o preset vale; à direita a receita */}
          <div className="flex min-h-0 flex-1 gap-8">
            <div className="w-[504px] shrink-0 space-y-5 overflow-y-auto p-0.5 pr-1.5">
              <div>{miniatura}</div>
              <Simulador preset={p} sim={sim} setSim={setSim} />
              <OndeVale preset={p} />
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
        if (e.key === 'Escape') setEditando(false)
      }}
      className="w-[420px] rounded-[4px] border border-cream/30 bg-transparent px-1.5 text-[16px] font-semibold text-cream outline-none"
    />
  )
}

const CHIP = 'rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1'
const chip = (ativo: boolean) => cn(CHIP, ativo ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')

/** Simular o preset numa situação de uso: o original (a referência), o modo de tela, quantas mídias e as proporções.
 *  Só aparecem as telas e os números de mídias em que o preset vale (`usos`). */
function Simulador({ preset, sim, setSim }: { preset: Preset; sim: Sim | null; setSim: (s: Sim | null) => void }) {
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

/** Onde o preset vale (só aparece no Enriquecimento nessas situações) e quais ajustes rápidos aparecem no insert. */
function OndeVale({ preset }: { preset: Preset }) {
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
        {AJUSTES.map((a) => (
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


/** Uma imagem vazia para o arrastar do navegador (sem o fantasma do card). */
const SEM_IMAGEM = (() => {
  if (typeof Image === 'undefined') return null as unknown as HTMLImageElement
  const i = new Image()
  i.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return i
})()

/** A ordem dos presets em cada situação (o modo de tela e o número de mídias), numa grade: arrastar reordena; a estrela
 *  favorita (até 3), e os favoritos ficam sempre no começo: são os Recomendados, em cima, no Enriquecimento do insert.
 *  Só os aprovados que valem na situação; a prévia toca ao passar o mouse. Sem ordem, o insert mostra uma lista só. */
function OrdemPresets({ presets, fechar }: { presets: Preset[]; fechar: () => void }) {
  const ordem = useOrdem()
  // as situações: com 1 mídia, separadas pela proporção (9:16 ou horizontal); com várias, só pelo número
  type Sit = { tela: Sim['tela']; n: number; prop?: ProporcaoSituacao }
  const VARIANTES: Omit<Sit, 'tela'>[] = [{ n: 1, prop: 'pe' }, { n: 1, prop: 'deitada' }, { n: 2 }, { n: 3 }]
  const [sit, setSit] = useState<Sit>({ tela: 'vertical', n: 1, prop: 'pe' })
  const [sobre, setSobre] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const valem = (s: Sit) => presets.filter((p) => p.aprovado && serve(p, '', s.n, s.tela, s.prop ? [s.prop === 'pe' ? 9 / 16 : 16 / 9] : undefined))
  const chave = situacao(sit.tela, sit.n, sit.prop)
  const chaveDe = (s: Sit) => situacao(s.tela, s.n, s.prop)
  const { recomendados, outros } = comRecomendados(valem(sit), ordem?.[chave])
  const lista = [...recomendados, ...outros]
  const nFav = recomendados.length
  const salvar = (ids: string[], favoritos: number) => void definirOrdem(chave, { ids, favoritos }).catch((x) => window.alert((x as Error).message))
  // a estrela: favoritar põe no fim dos favoritos; desfavoritar, logo depois deles
  const favoritar = (id: string) => {
    const ids = lista.map((p) => p.id).filter((x) => x !== id)
    const fav = recomendados.some((p) => p.id === id)
    ids.splice(fav ? nFav - 1 : nFav, 0, id)
    salvar(ids, nFav + (fav ? -1 : 1))
  }
  // arrastar: a grade já mostra onde vai cair (o card arrastado fica no lugar novo, tracejado, e os outros abrem espaço);
  // o que cai entre os favoritos vira favorito (o número de favoritos fica o mesmo; o último sai)
  const [alvo, setAlvo] = useState<string | null>(null)
  const exibida = (() => {
    if (!arrastando || !alvo || alvo === arrastando) return lista
    const sem = lista.filter((p) => p.id !== arrastando)
    sem.splice(lista.findIndex((p) => p.id === alvo), 0, lista.find((p) => p.id === arrastando)!) // vindo de antes, depois do alvo; de depois, antes
    return sem
  })()
  const parar = () => {
    setArrastando(null)
    setAlvo(null)
  }
  const soltar = () => {
    if (arrastando && alvo && alvo !== arrastando) salvar(exibida.map((p) => p.id), nFav)
    parar()
  }
  const nomeN = (s: Omit<Sit, 'tela'>) => (s.n === 1 ? (s.prop === 'pe' ? '1 mídia 9:16' : '1 mídia horizontal') : s.n === 2 ? '2 mídias' : '3 ou mais')
  return (
    <Modal titulo="Recomendados por situação" fechar={fechar} tamanho="cheia">
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-5">
        <div className="grid content-start gap-4">
          <p className="text-[12px] leading-[1.6] text-fog">
            Arraste para ordenar. A <Star className="inline size-3 fill-yellow text-yellow" /> favorita até {N_RECOMENDADOS}: ficam no começo e em <b className="text-cream">Recomendados</b>, em cima, no Enriquecimento do insert.
          </p>
          {TELAS.map((t) => (
            <div key={t.id} className="grid gap-1.5">
              <p className="eyebrow text-sage">{t.nome}</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIANTES.map((v) => {
                  const s = { ...v, tela: t.id }
                  const nf = ordem?.[situacao(t.id, v.n, v.prop)]?.favoritos ?? 0
                  return (
                    <button key={`${v.n}${v.prop ?? ''}`} onClick={() => setSit(s)} className={chip(chaveDe(sit) === chaveDe(s))}>
                      {nomeN(v)} <span className="opacity-60">{valem(s).length}</span>
                      {nf > 0 && <span className="ml-1 text-yellow">★{nf}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 content-start gap-2.5 overflow-y-auto p-1">
          <p className="flex items-center gap-3 text-[13px] font-semibold">
            {TELAS.find((t) => t.id === sit.tela)?.nome} · {nomeN(sit)}
            <span className="font-normal text-fog">
              {nFav}/{N_RECOMENDADOS} favoritos
            </span>
            {ordem?.[chave] && (
              <button onClick={() => salvar([], 0)} className="ml-auto text-[11.5px] font-normal text-fog hover:text-cream" title="Volta a uma lista só, sem recomendados">
                Limpar a ordem
              </button>
            )}
          </p>
          {!lista.length && <p className="text-[12px] text-fog">Nenhum preset aprovado vale nesta situação (veja o “Vale em” de cada um).</p>}
          <div className="grid grid-cols-6 gap-3" onDragOver={(e) => e.preventDefault()} onDrop={soltar}>
            {exibida.map((p, i) => {
              const fav = i < nFav
              const cheio = !fav && nFav >= N_RECOMENDADOS
              const props = usosDe(p).proporcoes
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', p.id)
                    e.dataTransfer.setDragImage(SEM_IMAGEM, 0, 0) // sem o fantasma voando: o card já aparece onde vai cair
                    setArrastando(p.id)
                  }}
                  onDragEnd={parar}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (arrastando && p.id !== arrastando && alvo !== p.id) setAlvo(p.id)
                  }}
                  onMouseEnter={() => setSobre(p.id)}
                  onMouseLeave={() => setSobre(null)}
                  className={cn('grid cursor-grab gap-1.5 transition-opacity active:cursor-grabbing', arrastando === p.id && 'opacity-50')}
                >
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-[6px]',
                      arrastando === p.id ? 'outline-2 outline-offset-2 outline-coral outline-dashed' : fav ? 'ring-2 ring-yellow/70' : 'ring-1 ring-line-dark',
                    )}
                  >
                    <Simulacao
                      preset={p}
                      sim={{ tela: sit.tela, n: sit.n, prop: sit.prop === 'pe' ? 'pe' : sit.prop === 'deitada' ? '16:9' : !props || props.includes('deitada') ? 'deitada' : 'pe' }}
                      tocando={sobre === p.id && !arrastando}
                      t={p.receita.duracao_ref * 0.7}
                      dur={p.receita.duracao_ref}
                      midia={(k) => urlAmostraPreset(p.id, k % Math.max(p.recortes?.length ?? 1, 1), versao(p, k % Math.max(p.recortes?.length ?? 1, 1)))}
                    />
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-ink/70 px-1.5 text-[10.5px] font-semibold text-fog tabular-nums">{i + 1}</span>
                    <button
                      onClick={() => favoritar(p.id)}
                      disabled={cheio}
                      className={cn(
                        'absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full transition-colors disabled:opacity-30',
                        fav ? 'bg-yellow/20 text-yellow' : 'bg-ink/70 text-fog hover:text-cream',
                      )}
                      title={fav ? 'Tirar dos recomendados' : cheio ? `Já há ${N_RECOMENDADOS} favoritos: tire um antes` : 'Favoritar (recomendado nesta situação)'}
                      aria-label="Favoritar"
                    >
                      <Star className={cn('size-3.5', fav && 'fill-yellow')} />
                    </button>
                  </div>
                  <div className="grid min-w-0">
                    <span className="truncate text-[12px] font-semibold">{p.nome}</span>
                    <span className="truncate text-[10.5px] text-fog">{(props ?? PROPORCOES_USO.map((x) => x.id)).map((x) => PROPORCOES_USO.find((y) => y.id === x)?.nome).join(' · ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
