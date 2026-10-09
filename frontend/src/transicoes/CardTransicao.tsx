import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Star, Volume2 } from 'lucide-react'
import { urlArquivoReferencia } from '@/api'
import { NOME_INTENSIDADE, eventoNoTempo, useCatalogoSons, type Intensidade } from '@/editor/sons'
import { cn } from '@/lib/utils'
import EfeitoNoPalco from './EfeitoNoPalco'
import { LUZ, editarTransicao, type CorteDoVideo, type Transicao } from './transicoes'

const DEPOIS = 1.5 // quanto o trecho mostra depois do corte
const quadro = (ref: string, t: number) => `/api/presets/quadro/${encodeURIComponent(ref)}?t=${Math.max(t, 0).toFixed(2)}`

/** Uma transição na página Transições (SPEC §8.8): a referência (o corte de onde ela veio, tocando com o som dela) e a
 *  recriação ao lado (o quadro de antes e o de depois do corte, com o efeito e o som do motor, no mesmo relógio). `som`:
 *  de qual lado sai o som. Embaixo, a estrela de favorita do par, o som (qual e a intensidade) e aprovar. */
export default function CardTransicao(p: {
  t: Transicao
  fonte: { ref: string; t: number } | null
  tocando: boolean
  tocar: (sim: boolean) => void
  som: 'referencia' | 'recriacao'
  favorita?: { ligada: boolean; primeira: boolean; alternar: () => void; tornarPrimeira: () => void }
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
    <article className={cn('grid gap-2 rounded-[8px] p-2 ring-1', p.favorita?.ligada ? 'bg-cream/[0.04] ring-yellow/30' : 'ring-line-dark')}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => p.tocar(!p.tocando)}
        onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), p.tocar(!p.tocando))}
        className="group relative grid cursor-pointer grid-cols-2 gap-px overflow-hidden rounded-[6px] bg-line-dark ring-1 ring-line-dark hover:ring-2 hover:ring-coral"
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
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-cream">Referência</span>
        </div>
        <div ref={caixa} className="relative aspect-[9/16] overflow-hidden bg-black">
          {fonte && (
            <EfeitoNoPalco tempo={rel} tocando={p.tocando} altura={altura} cortes={cortes} mudo={p.som !== 'recriacao'}>
              <img src={quadro(fonte.ref, fonte.t - e.antes - 0.15)} alt="" loading="lazy" className={cn('absolute inset-0 size-full object-cover', rel >= corte && 'invisible')} />
              <img src={quadro(fonte.ref, fonte.t + fimEfeito + 0.15)} alt="" loading="lazy" className={cn('absolute inset-0 size-full object-cover', rel < corte && 'invisible')} />
            </EfeitoNoPalco>
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-cream">Recriação</span>
        </div>
        {p.tocando && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-coral" style={{ width: `${(rel / fim) * 100}%` }} />
            <div className="absolute inset-y-0 w-px bg-cream" style={{ left: `${(corte / fim) * 100}%` }} />
          </div>
        )}
      </div>
      <div className="flex items-start gap-2">
        {p.favorita && (
          <button
            onClick={p.favorita.alternar}
            title={p.favorita.ligada ? 'Tirar das favoritas do par' : 'Tornar favorita do par'}
            className="mt-0.5 shrink-0"
          >
            <Star className={cn('size-4', p.favorita.ligada ? 'fill-yellow text-yellow' : 'text-fog hover:text-cream')} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <span className="truncate">{t.nome}</span>
            {p.favorita?.primeira && <span className="rounded-full bg-yellow/15 px-1.5 text-[10px] text-yellow">padrão do par</span>}
          </p>
          <p className="text-[11px] leading-[1.5] text-fog">{t.descricao}</p>
        </div>
      </div>
      <Som t={t} />
      <div className="flex items-center gap-2">
        {p.favorita?.ligada && !p.favorita.primeira && (
          <button onClick={p.favorita.tornarPrimeira} className="text-[11px] text-fog underline-offset-2 hover:text-cream hover:underline">
            Tornar o padrão do par
          </button>
        )}
        <button
          onClick={() => void editarTransicao(t.id, { aprovado: !t.aprovado })}
          className={cn(
            'ml-auto flex h-7 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold',
            t.aprovado ? 'border-sage/50 bg-sage/15 text-sage' : 'border-line-dark text-fog hover:text-cream',
          )}
        >
          <Check className="size-3" /> {t.aprovado ? 'Aprovada' : 'Aprovar'}
        </button>
      </div>
    </article>
  )
}

/** O som da transição: qual (ou nenhum) e a intensidade. */
function Som({ t }: { t: Transicao }) {
  const cat = useCatalogoSons()
  const mudar = (som: Transicao['som']) => void editarTransicao(t.id, { som }).catch((x) => window.alert((x as Error).message))
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
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
      {t.som &&
        (Object.keys(NOME_INTENSIDADE) as Intensidade[]).map((i) => (
          <button
            key={i}
            onClick={() => t.som && mudar({ ...t.som, intensidade: i })}
            className={cn('h-7 rounded-full border px-2.5 font-semibold', t.som?.intensidade === i ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}
          >
            {NOME_INTENSIDADE[i]}
          </button>
        ))}
    </div>
  )
}
