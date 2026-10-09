import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import { formatarTempo, urlArquivoReferencia } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { CATEGORIAS } from '@/editor/EtapaDirecao'
import { pararSons } from '@/editor/sons'
import { cn } from '@/lib/utils'
import CardTransicao from '@/transicoes/CardTransicao'
import { definirOrdem, ordemDoPar, useBiblioteca, type Biblioteca, type Par, type Transicao } from '@/transicoes/transicoes'

const FAMILIAS: Record<string, string> = { ator: 'Ator', insert: 'Insert', motion: 'Motion' }
const nomeLado = (c: string) => CATEGORIAS.planos[c] ?? FAMILIAS[c] ?? c
const nomePar = (k: string) => {
  const [de, para] = k.replace(/^familia:/, '').split('>')
  return `${nomeLado(de)} → ${nomeLado(para)}`
}

/** A página Transições (SPEC §8.8; docs/transicoes.md): à esquerda os pares (o plano que sai → o que entra), os vistos
 *  nas referências pelo nº de cortes e as famílias (que valem para os pares que nunca apareceram); à direita, as
 *  transições do par: as 2 favoritas em cima (a 1ª é o padrão: entra sozinha em cada corte desse par) e "Outras
 *  transições" embaixo, cada uma com a referência e a recriação lado a lado; e os cortes do par nas referências. */
export default function Transicoes() {
  const b = useBiblioteca()
  const [sel, setSel] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null) // um por vez
  const [som, setSom] = useState<'referencia' | 'recriacao'>('recriacao')
  useEffect(() => () => pararSons(), [])
  const vistos = b ? Object.keys(b.pares) : []
  const familias = b ? Object.keys(b.ordem).filter((k) => k.startsWith('familia:')).sort() : []
  const par = sel ?? vistos[0] ?? null
  const tocar = (id: string) => (sim: boolean) => {
    pararSons()
    setTocando(sim ? id : null)
  }

  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <div className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid min-h-0 content-start gap-4 overflow-y-auto border-r border-line-dark px-3 py-5">
          {!b && <p className="px-2 text-[12px] text-fog">Carregando…</p>}
          {b && !vistos.length && !familias.length && (
            <p className="px-2 text-[12px] leading-[1.6] text-fog">Nenhuma transição ainda: o Claude analisa os cortes das referências e grava as transições (docs/transicoes.md).</p>
          )}
          {vistos.length > 0 && (
            <Grupo titulo="Pares das referências">
              {vistos.map((k) => (
                <ItemPar key={k} k={k} b={b!} n={b!.pares[k].n} ativo={par === k} abrir={() => setSel(k)} />
              ))}
            </Grupo>
          )}
          {familias.length > 0 && (
            <Grupo titulo="Famílias (os outros pares)">
              {familias.map((k) => (
                <ItemPar key={k} k={k} b={b!} ativo={par === k} abrir={() => setSel(k)} />
              ))}
            </Grupo>
          )}
        </aside>
        <main className="min-h-0 overflow-y-auto px-6 py-5">
          {b && par && (
            <DetalhePar
              key={par}
              k={par}
              b={b}
              som={som}
              mudarSom={setSom}
              tocando={tocando}
              tocar={tocar}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Grupo(p: { titulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <p className="eyebrow px-2 pb-1 text-sage">{p.titulo}</p>
      {p.children}
    </div>
  )
}

function ItemPar(p: { k: string; b: Biblioteca; n?: number; ativo: boolean; abrir: () => void }) {
  const [de, para] = p.k.replace(/^familia:/, '').split('>')
  const o = p.k.startsWith('familia:') ? p.b.ordem[p.k] : ordemDoPar(p.b, de, para)
  const padrao = o && o.favoritas > 0 ? p.b.transicoes.find((t) => t.id === o.ids[0]) : null
  return (
    <button onClick={p.abrir} className={cn('grid rounded-[6px] px-2 py-1.5 text-left ring-1', p.ativo ? 'bg-cream/10 ring-cream/40' : 'ring-transparent hover:bg-cream/[0.05]')}>
      <span className="flex items-center gap-2 text-[12px] font-semibold">
        <span className="min-w-0 flex-1 truncate">{nomePar(p.k)}</span>
        {p.n != null && <span className="text-[11px] font-normal text-fog tabular-nums">{p.n}</span>}
      </span>
      <span className="truncate text-[11px] text-fog">{padrao?.nome ?? 'Corte seco'}</span>
    </button>
  )
}

/** As transições de um par, na ordem dele (a própria; sem ela, a da família), e os cortes do par nas referências. */
function DetalhePar(p: {
  k: string
  b: Biblioteca
  som: 'referencia' | 'recriacao'
  mudarSom: (s: 'referencia' | 'recriacao') => void
  tocando: string | null
  tocar: (id: string) => (sim: boolean) => void
}) {
  const { b, k } = p
  const familia = k.startsWith('familia:')
  const [de, para] = k.replace(/^familia:/, '').split('>')
  const o = familia ? b.ordem[k] : ordemDoPar(b, de, para)
  const herdada = !familia && !b.ordem[k] && !!o
  // a ordem inteira (as transições que ainda não estão nela vão para o fim)
  const ids = [...(o?.ids ?? []), ...b.transicoes.map((t) => t.id)].filter((x, i, l) => l.indexOf(x) === i && b.transicoes.some((t) => t.id === x))
  const nFav = Math.min(o?.favoritas ?? 0, ids.length)
  const salvar = (novos: string[], n: number) => void definirOrdem(k, novos, n).catch((x) => window.alert((x as Error).message))
  const alternar = (id: string) => {
    const i = ids.indexOf(id)
    const resto = ids.filter((x) => x !== id)
    if (i < nFav) salvar([...resto.slice(0, nFav - 1), id, ...resto.slice(nFav - 1)], nFav - 1)
    else if (nFav < 2) salvar([...resto.slice(0, nFav), id, ...resto.slice(nFav)], nFav + 1)
    else salvar([resto[0], id, ...resto.slice(1)], 2) // já são 2: entra no lugar da 2ª, que vai para as outras
  }
  const tornarPrimeira = (id: string) => salvar([id, ...ids.filter((x) => x !== id)], nFav)
  const parInfo: Par | undefined = familia ? undefined : b.pares[k]
  // de qual corte mostrar cada transição: um corte dela neste par; senão, o 1º dela; o corte seco, um corte seco do par
  const fonteDe = (t: Transicao) => {
    const noPar = t.fontes.find((f) => parInfo?.cortes.some((c) => c.ref === f.ref && Math.abs(c.t - f.t) < 0.2))
    if (noPar ?? t.fontes[0]) return noPar ?? t.fontes[0]
    const seco = (parInfo?.cortes ?? Object.values(b.pares).flatMap((x) => x.cortes)).find((c) => c.classe === 'seco' && !c.sons.length)
    return seco ? { ref: seco.ref, t: seco.t } : null
  }
  const card = (t: Transicao, i: number) => (
    <CardTransicao
      key={t.id}
      t={t}
      fonte={fonteDe(t)}
      som={p.som}
      tocando={p.tocando === t.id}
      tocar={p.tocar(t.id)}
      favorita={{ ligada: i < nFav, primeira: i === 0 && nFav > 0, alternar: () => alternar(t.id), tornarPrimeira: () => tornarPrimeira(t.id) }}
    />
  )
  const lista = ids.map((id) => b.transicoes.find((t) => t.id === id)!)

  return (
    <div className="grid max-w-[1200px] gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <p className="eyebrow text-sage">{familia ? 'Família' : 'Par'}</p>
          <h1 className="text-[22px] font-semibold">{nomePar(k)}</h1>
          <p className="text-[12px] leading-[1.6] text-fog">
            {parInfo
              ? `${parInfo.n} cortes nas referências · ${Object.entries(parInfo.sons)
                  .map(([s, n]) => `${s} ${n}×`)
                  .join(', ') || 'sem som de corte'}`
              : 'Vale para os pares desta família que não aparecem nas referências.'}
            {herdada && ' Este par ainda segue a ordem da família; mudar uma favorita grava a dele.'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[11.5px]">
          <Volume2 className="mr-1 size-3.5 text-fog" />
          {(['referencia', 'recriacao'] as const).map((s) => (
            <button
              key={s}
              onClick={() => p.mudarSom(s)}
              className={cn('h-8 rounded-full border px-3 font-semibold', p.som === s ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}
            >
              Som da {s === 'referencia' ? 'referência' : 'recriação'}
            </button>
          ))}
        </div>
      </div>
      <section className="grid gap-3">
        <p className="eyebrow text-yellow">Favoritas do par</p>
        {!nFav && <p className="text-[12px] text-fog">Nenhuma favorita: os cortes deste par ficam secos. Marque a estrela de uma transição.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">{lista.slice(0, nFav).map(card)}</div>
      </section>
      <section className="grid gap-3">
        <p className="eyebrow text-fog">Outras transições</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">{lista.slice(nFav).map((t, j) => card(t, j + nFav))}</div>
      </section>
      {parInfo && parInfo.cortes.length > 0 && <CortesDoPar par={parInfo} tocando={p.tocando} tocar={p.tocar} />}
    </div>
  )
}

/** Os cortes do par nas referências: cada um toca (com o som) de 1,5 s antes a 1,5 s depois. */
function CortesDoPar(p: { par: Par; tocando: string | null; tocar: (id: string) => (sim: boolean) => void }) {
  const [sel, setSel] = useState(0)
  const c = p.par.cortes[Math.min(sel, p.par.cortes.length - 1)]
  const id = `corte:${c.ref}@${c.t}`
  const video = useRef<HTMLVideoElement>(null)
  const ativo = p.tocando === id
  useEffect(() => {
    const v = video.current
    if (!v || !ativo) return
    const ini = Math.max(c.t - 1.5, 0)
    const ver = () => {
      if (v.currentTime >= c.t + 1.5 || v.currentTime < ini - 0.2) v.currentTime = ini
    }
    v.currentTime = ini
    void v.play().catch(() => {})
    v.addEventListener('timeupdate', ver)
    return () => {
      v.removeEventListener('timeupdate', ver)
      v.pause()
    }
  }, [ativo, c.ref, c.t])
  return (
    <section className="grid gap-3">
      <p className="eyebrow text-fog">Os cortes deste par nas referências</p>
      <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-4">
        <button onClick={() => p.tocar(id)(!ativo)} className="relative aspect-[9/16] overflow-hidden rounded-[6px] bg-black ring-1 ring-line-dark hover:ring-2 hover:ring-coral" title={ativo ? 'Parar' : 'Tocar o corte'}>
          <img src={`/api/presets/quadro/${encodeURIComponent(c.ref)}?t=${Math.max(c.t - 0.3, 0).toFixed(2)}`} alt="" className="absolute inset-0 size-full object-cover" />
          {ativo && <video ref={video} src={urlArquivoReferencia(c.ref, 'proxy.mp4')} playsInline preload="auto" className="absolute inset-0 size-full object-cover" />}
        </button>
        <div className="flex flex-wrap content-start gap-1.5">
          {p.par.cortes.map((x, i) => (
            <button
              key={`${x.ref}@${x.t}`}
              onClick={() => {
                setSel(i)
                p.tocar(`corte:${x.ref}@${x.t}`)(true)
              }}
              className={cn('rounded-full border px-2.5 py-1 text-[11px]', i === sel ? 'border-cream bg-cream/10 text-cream' : 'border-line-dark text-fog hover:text-cream')}
              title={`${x.classe}${x.sons.length ? ' · ' + x.sons.join(', ') : ''}`}
            >
              {x.ref} · {formatarTempo(x.t)}
              {x.sons.length > 0 && <Volume2 className="ml-1 inline size-3 text-sage" />}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
