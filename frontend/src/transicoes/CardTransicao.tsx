import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, Settings2, Star, Volume2 } from 'lucide-react'
import { formatarTempo, urlArquivoReferencia } from '@/api'
import Modal from '@/components/Modal'
import { CATEGORIAS } from '@/editor/EtapaDirecao'
import { NOME_INTENSIDADE, eventoNoTempo, useCatalogoSons, type Intensidade } from '@/editor/sons'
import { cn } from '@/lib/utils'
import EfeitoNoPalco from './EfeitoNoPalco'
import { LUZ, editarTransicao, useBiblioteca, type Biblioteca, type CorteDoVideo, type Transicao } from './transicoes'

const DEPOIS = 1.5 // quanto o trecho mostra depois do corte
const quadro = (ref: string, t: number) => `/api/presets/quadro/${encodeURIComponent(ref)}?t=${Math.max(t, 0).toFixed(2)}`

/** A prévia de uma transição (SPEC §8.8): a referência (o corte de onde ela veio, tocando com o som dela) e a
 *  recriação ao lado (o quadro de antes e o de depois do corte, com o efeito e o som do motor, no mesmo relógio), de
 *  borda a borda, como nos presets. `som`: de qual lado sai o som. Serve ao card e ao modal da transição. */
function Miniatura(p: {
  t: Transicao
  fonte: { ref: string; t: number } | null
  tocando: boolean
  tocar: (sim: boolean) => void
  som: 'referencia' | 'recriacao'
  favorita?: { ligada: boolean; primeira: boolean }
}) {
  const { t, fonte } = p
  const cat = useCatalogoSons()
  const e = t.efeito
  // o trecho começa antes do corte o bastante para o som inteiro (o riser sobe ~1 s até o golpe) e o efeito
  const ev = t.som && cat ? eventoNoTempo(t.som, 0, cat) : null
  const antes = Math.max(1.5, e.antes + 0.6, ev ? 0.3 - ev.t : 0)
  const ini = fonte ? Math.max(fonte.t - antes, 0) : 0
  const corte = fonte ? fonte.t - ini : antes
  const fim = corte + Math.max(DEPOIS, e.depois + 0.6, e.tipo === 'luz' ? LUZ.duracao - e.antes + 0.4 : 0)
  const [rel, setRel] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = video.current
    if (!p.tocando || !v || !fonte) return setRel(0)
    let id = 0
    const passo = () => {
      if (v.currentTime >= ini + fim || v.currentTime < ini - 0.2) v.currentTime = ini
      setRel(Math.max(v.currentTime - ini, 0))
      id = requestAnimationFrame(passo)
    }
    v.currentTime = ini
    void v.play().catch(() => {})
    id = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(id)
      v.pause()
    }
  }, [p.tocando, fonte?.ref, ini, fim]) // eslint-disable-line react-hooks/exhaustive-deps
  const cortes = useMemo<CorteDoVideo[]>(() => [{ t: corte, plano: 'demo', de: '', para: '', transicao: t, manual: false }], [corte, t])
  // a recriação: o quadro de antes do efeito até o corte, o de depois do efeito a partir dele
  const fimEfeito = e.tipo === 'luz' ? LUZ.duracao - e.antes : e.depois
  // a altura da recriação (o desfoque é proporcional a ela, como no MP4), medida e acompanhada
  const caixa = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState(320)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const obs = new ResizeObserver(() => setAltura(el.clientHeight || 320))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => p.tocar(!p.tocando)}
        onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), p.tocar(!p.tocando))}
        className={cn(
          'group relative grid w-full cursor-pointer grid-cols-2 gap-px overflow-hidden rounded-[6px] bg-line-dark ring-1 transition-[box-shadow] [contain:paint] hover:ring-2 hover:ring-coral',
          p.favorita?.ligada ? 'ring-yellow/50' : 'ring-line-dark',
        )}
        title={p.tocando ? 'Parar' : 'Tocar em loop (a referência e a recriação juntas)'}
      >
        <div className="relative aspect-[9/16] overflow-hidden bg-black">
          {fonte ? (
            <>
              <img src={quadro(fonte.ref, fonte.t - 0.4)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              {p.tocando && (
                <video ref={video} src={urlArquivoReferencia(fonte.ref, 'proxy.mp4')} muted={p.som !== 'referencia'} playsInline preload="auto" className="absolute inset-0 size-full object-cover" />
              )}
            </>
          ) : (
            <p className="absolute inset-0 grid place-items-center p-3 text-center text-[11px] text-fog">Sem corte de referência</p>
          )}
        </div>
        <div ref={caixa} className="relative aspect-[9/16] overflow-hidden bg-black">
          {fonte && (
            <EfeitoNoPalco tempo={rel} tocando={p.tocando} altura={altura} cortes={cortes} mudo={p.som !== 'recriacao'}>
              <img src={quadro(fonte.ref, fonte.t - e.antes - 0.15)} alt="" loading="lazy" className={cn('absolute inset-0 size-full object-cover', rel >= corte && 'invisible')} />
              <img src={quadro(fonte.ref, fonte.t + fimEfeito + 0.15)} alt="" loading="lazy" className={cn('absolute inset-0 size-full object-cover', rel < corte && 'invisible')} />
            </EfeitoNoPalco>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b1714e6] to-transparent" />
        <span className="absolute bottom-2.5 left-2.5 text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">Referência</span>
        <span className="absolute bottom-2.5 left-[calc(50%+10px)] text-[9.5px] font-semibold tracking-[0.08em] text-cream/70 uppercase">Recriação</span>
        <span className={cn('absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase', t.aprovado ? 'bg-mint text-ink' : 'bg-coral text-cream')}>
          {t.aprovado ? 'Aprovada' : 'A revisar'}
        </span>
        {p.favorita?.primeira && (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-yellow px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-ink uppercase">Padrão do par</span>
        )}
        <span className={cn('absolute top-1/2 left-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-ink/80 text-cream transition-opacity', p.tocando ? 'opacity-0 group-hover:opacity-100' : 'opacity-90')}>
          {p.tocando ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px fill-current" />}
        </span>
        {p.tocando && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-coral" style={{ width: `${(rel / fim) * 100}%` }} />
            <div className="absolute inset-y-0 w-px bg-cream" style={{ left: `${(corte / fim) * 100}%` }} />
          </div>
        )}
      </div>
  )
}

const EFEITO = { seco: 'Corte seco', luz: 'Luz colorida', brilho: 'Brilho', zoom: 'Zoom com desfoque' }

/** Uma transição na página Transições: a prévia (clicar toca a referência e a recriação juntas), o nome, a estrela de
 *  favorita do par, aprovar e a engrenagem, que abre o modal com o som e os cortes das referências onde ela aparece. */
export default function CardTransicao(p: {
  t: Transicao
  fonte: { ref: string; t: number } | null
  tocando: boolean
  tocar: (sim: boolean) => void
  som: 'referencia' | 'recriacao'
  favorita?: { ligada: boolean; primeira: boolean; alternar: () => void; tornarPrimeira: () => void }
}) {
  const { t } = p
  const [aberto, setAberto] = useState(false)
  const icone = 'grid size-8 shrink-0 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream'
  const abrir = () => {
    p.tocar(false)
    setAberto(true)
  }
  return (
    <section className="flex min-w-0 flex-col">
      <Miniatura t={t} fonte={p.fonte} tocando={p.tocando} tocar={p.tocar} som={p.som} favorita={p.favorita} />
      <div className="mt-3 flex items-start gap-1">
        <button onClick={abrir} className="min-w-0 flex-1 text-left" title={t.descricao || t.nome}>
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] hover:underline">{t.nome}</h3>
          <p className="mt-0.5 truncate text-[12px] text-fog">
            {EFEITO[t.efeito.tipo]}
            {t.som ? ' · com som' : ''}
          </p>
        </button>
        {p.favorita && (
          <button
            onClick={p.favorita.alternar}
            className={cn(icone, p.favorita.ligada && 'text-yellow hover:text-yellow')}
            title={p.favorita.ligada ? 'Tirar das favoritas do par' : 'Tornar favorita do par'}
            aria-label="Favorita do par"
          >
            <Star className={cn('size-4', p.favorita.ligada && 'fill-yellow')} />
          </button>
        )}
        <button
          onClick={() => void editarTransicao(t.id, { aprovado: !t.aprovado })}
          className={cn(icone, t.aprovado ? 'bg-mint text-ink hover:bg-mint/80 hover:text-ink' : 'text-mint hover:bg-mint/15 hover:text-mint')}
          title={t.aprovado ? 'Aprovada (clique para tirar a aprovação)' : 'Aprovar'}
          aria-label={t.aprovado ? 'Tirar a aprovação' : 'Aprovar'}
        >
          <Check className="size-4" />
        </button>
        <button onClick={abrir} className={cn(icone, aberto && 'bg-coral text-cream hover:bg-coral')} title="Ajustar o som e ver onde aparece" aria-label="Ajustar">
          <Settings2 className="size-4" />
        </button>
      </div>
      {p.favorita?.ligada && !p.favorita.primeira && (
        <button onClick={p.favorita.tornarPrimeira} className="mt-1 w-fit text-[11.5px] text-fog underline-offset-2 hover:text-cream hover:underline">
          Tornar o padrão do par
        </button>
      )}
      {aberto && <DetalheTransicao t={t} fonte={p.fonte} fechar={() => setAberto(false)} />}
    </section>
  )
}

type Uso = { ref: string; t: number; par?: string }
const nomeCat = (c: string) => CATEGORIAS.planos[c] ?? c
const nomePar = (k: string) => {
  const [de, para] = k.replace(/^familia:/, '').split('>')
  return `${nomeCat(de)} → ${nomeCat(para)}`
}
/** Os cortes das referências onde a transição aparece: os de onde ela foi recriada e, nas de som, os cortes em que esse
 *  som cai (no corte seco, os secos sem som), com o par de cada um. */
function usosDe(b: Biblioteca, t: Transicao): Uso[] {
  const out: Uso[] = []
  const tem = (u: Uso) => out.some((x) => x.ref === u.ref && Math.abs(x.t - u.t) < 0.2)
  const parDe = (u: { ref: string; t: number }) => Object.entries(b.pares).find(([, p]) => p.cortes.some((c) => c.ref === u.ref && Math.abs(c.t - u.t) < 0.2))?.[0]
  for (const f of t.fontes) if (!tem(f)) out.push({ ...f, par: parDe(f) })
  for (const [k, p] of Object.entries(b.pares))
    for (const c of p.cortes) {
      const casa = t.efeito.tipo !== 'seco' ? false : t.som ? c.sons.includes(t.som.som) : c.classe === 'seco' && !c.sons.length
      if (casa && !tem(c)) out.push({ ref: c.ref, t: c.t, par: k })
    }
  return out
}

/** O modal da transição: a prévia grande (num corte das referências que se escolhe na lista), o som (qual e a
 *  intensidade), o efeito e os cortes das referências onde ela aparece; os pares em que é favorita. */
function DetalheTransicao(p: { t: Transicao; fonte: { ref: string; t: number } | null; fechar: () => void }) {
  const b = useBiblioteca()
  const [fonte, setFonte] = useState(p.fonte)
  const [tocando, setTocando] = useState(false)
  const [som, setSom] = useState<'referencia' | 'recriacao'>('recriacao')
  const t = b?.transicoes.find((x) => x.id === p.t.id) ?? p.t
  const usos = useMemo(() => (b ? usosDe(b, t) : []), [b, t])
  const favoritaEm = b ? Object.entries(b.ordem).filter(([, o]) => o.ids.slice(0, o.favoritas).includes(t.id)).map(([k]) => k) : []
  const e = t.efeito
  const s1 = (v: number) => v.toFixed(2).replace('.', ',')
  return (
    <Modal titulo={t.nome} fechar={p.fechar} tamanho="largo">
      <div className="flex min-h-0 flex-1 gap-8">
        <div className="grid w-[420px] shrink-0 content-start gap-3">
          <Miniatura t={t} fonte={fonte} tocando={tocando} tocar={setTocando} som={som} />
          <div className="flex items-center gap-1 text-[11.5px]">
            <Volume2 className="mr-1 size-3.5 text-fog" />
            {(['referencia', 'recriacao'] as const).map((x) => (
              <button
                key={x}
                onClick={() => setSom(x)}
                className={cn('h-7 rounded-full border px-3 font-semibold', som === x ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}
              >
                Som da {x === 'referencia' ? 'referência' : 'recriação'}
              </button>
            ))}
          </div>
          <p className="text-[12px] leading-[1.6] text-fog">{t.descricao}</p>
        </div>
        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
          <section className="grid gap-2">
            <p className="eyebrow text-sage">Som</p>
            <Som t={t} />
            <p className="text-[11.5px] leading-[1.6] text-fog">O golpe do som cai no corte. Vale para todos os cortes que usam esta transição.</p>
          </section>
          <section className="grid gap-1.5">
            <p className="eyebrow text-sage">Efeito</p>
            <p className="text-[12.5px]">
              {EFEITO[e.tipo]}
              {e.tipo !== 'seco' && (
                <span className="text-fog">
                  {' '}
                  · começa {s1(e.antes)} s antes do corte e acaba {s1(e.depois)} s depois · força {Math.round(e.forca * 100)}%
                </span>
              )}
            </p>
          </section>
          {favoritaEm.length > 0 && (
            <section className="grid gap-1.5">
              <p className="eyebrow text-yellow">Favorita em</p>
              <div className="flex flex-wrap gap-1.5">
                {favoritaEm.map((k) => (
                  <span key={k} className="rounded-full px-2.5 py-1 text-[11px] text-cream ring-1 ring-line-dark">
                    {k.startsWith('familia:') ? 'Família ' : ''}
                    {nomePar(k)}
                  </span>
                ))}
              </div>
            </section>
          )}
          <section className="grid gap-2">
            <p className="eyebrow text-sage">Onde aparece nas referências · {usos.length}</p>
            {!usos.length && <p className="text-[12px] text-fog">Nenhum corte das referências ligado a esta transição.</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
              {usos.map((u) => {
                const atual = fonte && fonte.ref === u.ref && Math.abs(fonte.t - u.t) < 0.05
                return (
                  <button
                    key={`${u.ref}@${u.t}`}
                    onClick={() => {
                      setFonte({ ref: u.ref, t: u.t })
                      setTocando(true)
                    }}
                    className={cn('grid gap-1 rounded-[6px] p-1.5 text-left ring-1', atual ? 'bg-cream/10 ring-cream/50' : 'ring-line-dark hover:bg-cream/[0.05]')}
                    title="Ver este corte na prévia"
                  >
                    <img src={quadro(u.ref, u.t - 0.3)} alt="" loading="lazy" className="aspect-[9/16] w-full rounded-[4px] bg-black object-cover" />
                    <span className="truncate text-[11px] font-semibold">{u.ref}</span>
                    <span className="truncate text-[10.5px] text-fog">
                      {formatarTempo(u.t)}
                      {u.par ? ` · ${nomePar(u.par)}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  )
}

/** O som da transição: qual (ou nenhum) e a intensidade. */
function Som({ t }: { t: Transicao }) {
  const cat = useCatalogoSons()
  const mudar = (som: Transicao['som']) => void editarTransicao(t.id, { som }).catch((x) => window.alert((x as Error).message))
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
      <Volume2 className="size-3.5 shrink-0 text-fog" />
      <select
        value={t.som?.som ?? ''}
        onChange={(x) => mudar(x.target.value ? { som: x.target.value, intensidade: t.som?.intensidade ?? 'baixo', atraso: t.som?.atraso ?? 0 } : null)}
        className="h-7 min-w-0 flex-1 rounded-[6px] border border-line-dark bg-ink px-1.5 text-cream"
      >
        <option value="">Sem som</option>
        {cat?.sons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>
      {t.som && (
        // a intensidade num grupo compacto (cabe no card mais estreito da grade, ao lado do som)
        <div className="flex shrink-0 rounded-full p-0.5 ring-1 ring-line-dark">
          {(Object.keys(NOME_INTENSIDADE) as Intensidade[]).map((i) => (
            <button
              key={i}
              onClick={() => t.som && mudar({ ...t.som, intensidade: i })}
              className={cn('h-6 rounded-full px-2 font-semibold', t.som?.intensidade === i ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
            >
              {NOME_INTENSIDADE[i]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
