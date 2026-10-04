import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { listarClipes, urlArquivoReferencia, type ClipeReferencia, type OrigemClipe } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import { COR_PLANO } from '@/referencias/LinhaDirecao'

type Ordem = 'aleatorio' | 'longos' | 'curtos' | 'video'
const dur = (c: ClipeReferencia) => c.fim - c.inicio
const seg = (t: number) => `${t.toFixed(1).replace('.', ',')} s`
const chave = (c: ClipeReferencia) => `${c.ref}/${c.id}`

/** Galeria dos planos-base identificados nos vídeos de referência, por categoria. Cada clipe toca sozinho. */
export default function Referencias() {
  const [clipes, setClipes] = useState<ClipeReferencia[] | null>(null)
  const [categorias, setCategorias] = useState<Record<string, string>>({})
  const [nomesElementos, setNomesElementos] = useState<Record<string, string>>({})
  const [origens, setOrigens] = useState<Record<string, OrigemClipe>>({})
  const [erro, setErro] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('aleatorio')
  const [soRevisadas, setSoRevisadas] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    listarClipes()
      .then((d) => {
        setClipes(d.clipes)
        setCategorias(d.categorias)
        setNomesElementos(d.elementos)
        setOrigens(d.origens)
      })
      .catch((e) => setErro(e.message))
  }, [])

  // ordem aleatória estável enquanto a página está aberta
  const sorteio = useMemo(() => new Map((clipes ?? []).map((c) => [chave(c), Math.random()])), [clipes])

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (clipes ?? []).filter(
      (c) => (!soRevisadas || c.revisado) && (!q || [c.descricao, c.texto ?? '', c.fala, c.ref_nome].some((t) => t.toLowerCase().includes(q))),
    )
  }, [clipes, busca, soRevisadas])

  const visiveis = useMemo(() => {
    const l = base.filter((c) => !categoria || c.tipo === categoria)
    if (ordem === 'aleatorio') return [...l].sort((a, b) => sorteio.get(chave(a))! - sorteio.get(chave(b))!)
    if (ordem === 'longos') return [...l].sort((a, b) => dur(b) - dur(a))
    if (ordem === 'curtos') return [...l].sort((a, b) => dur(a) - dur(b))
    return [...l].sort((a, b) => a.ref_nome.localeCompare(b.ref_nome) || a.inicio - b.inicio)
  }, [base, categoria, ordem, sorteio])

  const contagem = (tipo: string | null) => base.filter((c) => !tipo || c.tipo === tipo).length
  const indiceAberto = visiveis.findIndex((c) => chave(c) === aberto)

  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
        <label className="ml-6 flex h-9 w-[min(420px,32vw)] items-center gap-2 rounded-full border border-line-dark px-3.5 text-fog focus-within:border-cream/50">
          <Search className="size-3.5" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar na descrição, no texto ou na fala"
            className="w-full bg-transparent text-[12px] text-cream outline-none placeholder:text-fog/70"
          />
        </label>
        <span className="ml-auto rounded-full border border-line-dark px-3 py-1 text-[11px] text-fog tabular-nums">
          {visiveis.length} clipe{visiveis.length === 1 ? '' : 's'}
        </span>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-4 py-3">
        <Chip ativo={!categoria} onClick={() => setCategoria(null)} n={contagem(null)}>
          Todos
        </Chip>
        {Object.entries(categorias).map(([tipo, nome]) => (
          <Chip key={tipo} ativo={categoria === tipo} onClick={() => setCategoria(tipo)} n={contagem(tipo)} cor={COR_PLANO[tipo]}>
            {nome}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-fog">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={soRevisadas} onChange={(e) => setSoRevisadas(e.target.checked)} /> Só revisadas
          </label>
          <span>Ordenar</span>
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="h-8 rounded-full border border-line-dark bg-deep px-3 text-[12px] text-cream outline-none focus:border-cream/50"
          >
            <option value="aleatorio">Aleatório</option>
            <option value="longos">Mais longos</option>
            <option value="curtos">Mais curtos</option>
            <option value="video">Por vídeo</option>
          </select>
        </div>
      </nav>

      <main className="overflow-y-auto px-6 py-6">
        {erro && <p className="text-coral">{erro}</p>}
        {clipes?.length === 0 && (
          <p className="text-[13px] text-fog">
            Nenhum clipe ainda. Suba vídeos editados em <Link to="/calibragem" className="text-yellow underline">Calibragem</Link>; os planos que a IA identificar aparecem aqui.
          </p>
        )}
        {clipes && clipes.length > 0 && visiveis.length === 0 && <p className="text-[13px] text-fog">Nenhum clipe com esses filtros.</p>}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-8">
          {visiveis.map((c) => (
            <Cartao key={chave(c)} clipe={c} nome={categorias[c.tipo]} abrir={() => setAberto(chave(c))} />
          ))}
        </ul>
      </main>

      {indiceAberto >= 0 && (
        <Player
          clipe={visiveis[indiceAberto]}
          origem={origens[visiveis[indiceAberto].ref]}
          categorias={categorias}
          nomesElementos={nomesElementos}
          posicao={`${indiceAberto + 1} de ${visiveis.length}`}
          anterior={indiceAberto > 0 ? () => setAberto(chave(visiveis[indiceAberto - 1])) : null}
          proximo={indiceAberto < visiveis.length - 1 ? () => setAberto(chave(visiveis[indiceAberto + 1])) : null}
          fechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

function Chip({ ativo, onClick, n, cor, children }: { ativo: boolean; onClick: () => void; n: number; cor?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
        ativo ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream',
      )}
    >
      {cor && <span className={cn('size-2.5 rounded-full', cor)} />}
      {children}
      <span className={cn('tabular-nums', ativo ? 'text-ink/60' : 'text-fog/60')}>{n}</span>
    </button>
  )
}

/** Toca só o intervalo [inicio, fim) do vídeo, em loop. */
function useTrecho(video: React.RefObject<HTMLVideoElement | null>, c: ClipeReferencia, ligado: boolean) {
  useEffect(() => {
    const v = video.current
    if (!v || !ligado) return
    const comecar = () => {
      v.currentTime = c.inicio
      // se o navegador barrar o autoplay com som, toca mudo (os controles do player deixam ligar o som)
      v.play().catch(() => {
        v.muted = true
        void v.play().catch(() => undefined)
      })
    }
    const vigiar = () => {
      if (v.currentTime >= c.fim - 0.03 || v.currentTime < c.inicio - 0.5) v.currentTime = c.inicio
    }
    if (v.readyState >= 1) comecar()
    else v.addEventListener('loadedmetadata', comecar, { once: true })
    v.addEventListener('timeupdate', vigiar)
    return () => {
      v.removeEventListener('loadedmetadata', comecar)
      v.removeEventListener('timeupdate', vigiar)
      v.pause()
    }
  }, [video, c, ligado])
}

function Cartao({ clipe: c, nome, abrir }: { clipe: ClipeReferencia; nome: string; abrir: () => void }) {
  const [tocando, setTocando] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useTrecho(video, c, tocando)
  return (
    <li>
      <button onClick={abrir} onMouseEnter={() => setTocando(true)} onMouseLeave={() => setTocando(false)} className="group block w-full text-left">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-coral">
          {c.miniatura && (
            <img src={urlArquivoReferencia(c.ref, c.miniatura)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          )}
          {tocando && (
            <video ref={video} src={`${urlArquivoReferencia(c.ref, 'proxy.mp4')}#t=${c.inicio},${c.fim}`} muted playsInline preload="auto" className="absolute inset-0 size-full object-cover" />
          )}
          <span className={cn('absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[9px] font-semibold', COR_PLANO[c.tipo])}>
            {nome}
            {c.conteudo && ` · ${c.conteudo}`}
          </span>
          <span className="absolute top-2.5 right-2.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums">{seg(dur(c))}</span>
          {c.revisado && <span className="absolute bottom-2.5 left-2.5 rounded-full bg-mint px-2 py-0.5 text-[9px] font-semibold text-ink">✓ revisado</span>}
        </div>
        <p className="mt-2.5 truncate text-[11px] text-fog">
          {c.ref_nome} · {seg(c.inicio)}
        </p>
        {c.texto && <p className="mt-0.5 truncate text-[12px] font-semibold">“{c.texto}”</p>}
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-cream/85">{c.descricao}</p>
      </button>
    </li>
  )
}

const ONDE: Record<string, string> = {
  na_pausa: 'numa pausa da fala',
  entre_palavras: 'entre palavras, sem pausa',
  dentro_da_palavra: 'no meio de uma palavra',
  depois_da_fala: 'depois que a fala acabou',
}

function Player(p: {
  clipe: ClipeReferencia
  origem: OrigemClipe
  categorias: Record<string, string>
  nomesElementos: Record<string, string>
  posicao: string
  anterior: (() => void) | null
  proximo: (() => void) | null
  fechar: () => void
}) {
  const c = p.clipe
  const nome = p.categorias[c.tipo]
  const [modo, setModo] = useState<'trecho' | 'origem'>('trecho')
  const [tempo, setTempo] = useState(c.inicio)
  const [salto, setSalto] = useState<{ t: number; n: number } | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useTrecho(video, c, modo === 'trecho')
  // no vídeo de origem: vai para o ponto pedido e toca (depois que o loop do trecho foi desligado)
  useEffect(() => {
    const v = video.current
    if (modo !== 'origem' || !salto || !v) return
    v.currentTime = salto.t
    void v.play().catch(() => undefined)
  }, [modo, salto])

  useEffect(() => setModo('trecho'), [c])
  // relógio para a faixa do vídeo de origem
  useEffect(() => {
    const v = video.current
    if (!v) return
    const t = () => setTempo(v.currentTime)
    v.addEventListener('timeupdate', t)
    return () => v.removeEventListener('timeupdate', t)
  }, [c])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.fechar()
      else if (e.key === 'ArrowLeft') p.anterior?.()
      else if (e.key === 'ArrowRight') p.proximo?.()
      else if (e.key === ' ') {
        e.preventDefault()
        const v = video.current
        if (v) void (v.paused ? v.play() : v.pause())
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [p])

  const verOrigem = (t: number) => {
    setModo('origem')
    setSalto((s) => ({ t, n: (s?.n ?? 0) + 1 }))
  }
  const e = c.entrada
  const ms = e?.ms != null ? `${e.ms > 0 ? `${e.ms} ms depois` : e.ms < 0 ? `${-e.ms} ms antes` : 'exatamente no começo'} de “${e.palavra}”` : null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={p.fechar}>
      <div
        className="grid max-h-full w-full max-w-[1180px] grid-cols-[auto_minmax(0,1fr)] gap-7 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* vídeo + faixa da origem */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex gap-1 text-[11px] font-semibold">
            {(['trecho', 'origem'] as const).map((m) => (
              <button
                key={m}
                onClick={() => (m === 'origem' ? verOrigem(c.inicio) : setModo('trecho'))}
                className={cn('rounded-full px-3 py-1.5', modo === m ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
              >
                {m === 'trecho' ? 'Este trecho' : 'Vídeo de origem'}
              </button>
            ))}
          </div>
          <video
            key={`${c.ref}/${c.id}`}
            ref={video}
            src={urlArquivoReferencia(c.ref, 'proxy.mp4')}
            playsInline
            controls
            className="h-[min(68vh,700px)] w-auto rounded-[6px] bg-black"
          />
          {/* todos os planos do vídeo de origem; clique leva para aquele ponto */}
          <div
            className="relative h-6 w-full cursor-pointer overflow-hidden rounded-[3px] bg-deeper"
            onClick={(ev) => {
              const r = ev.currentTarget.getBoundingClientRect()
              verOrigem(((ev.clientX - r.left) / r.width) * p.origem.duracao)
            }}
            title="Planos do vídeo de origem: clique para ver a partir dali"
          >
            {p.origem.planos.map((q) => (
              <span
                key={q.id}
                className={cn('absolute inset-y-0 border-r border-deeper', COR_PLANO[q.tipo], q.id === c.id ? 'opacity-100' : 'opacity-45')}
                style={{ left: `${(q.inicio / p.origem.duracao) * 100}%`, width: `${((q.fim - q.inicio) / p.origem.duracao) * 100}%` }}
                title={`${p.categorias[q.tipo]} · ${seg(q.fim - q.inicio)}`}
              />
            ))}
            <span
              className="pointer-events-none absolute inset-y-0 border-2 border-yellow"
              style={{ left: `${(c.inicio / p.origem.duracao) * 100}%`, width: `${((c.fim - c.inicio) / p.origem.duracao) * 100}%` }}
            />
            <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-coral" style={{ left: `${(tempo / p.origem.duracao) * 100}%` }} />
          </div>
        </div>

        {/* dados */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 text-[13px]">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', COR_PLANO[c.tipo])}>
              {nome}
              {c.conteudo && ` · ${c.conteudo} em cima`}
            </span>
            {c.revisado && <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-ink">✓ revisado</span>}
            <span className="text-[11px] text-fog tabular-nums">{p.posicao}</span>
            <button onClick={p.fechar} aria-label="Fechar" className="ml-auto grid size-8 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
              <X className="size-4" />
            </button>
          </div>

          {c.texto && <p className="text-[18px] leading-snug font-semibold">“{c.texto}”</p>}
          <Bloco titulo="O que aparece">
            <p className="leading-[1.7]">{c.descricao}</p>
          </Bloco>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line-dark py-4">
            <Dado rotulo="Duração" valor={seg(dur(c))} />
            <Dado rotulo="Onde no vídeo" valor={`${seg(c.inicio)} → ${seg(c.fim)} · ${Math.round(c.posicao * 100)}%`} detalhe={`plano ${c.numero} de ${c.total}`} />
            <Dado
              rotulo="Entra"
              valor={e ? ONDE[e.onde] ?? e.onde : 'abre o vídeo'}
              detalhe={e ? [e.frase && (e.frase === 'inicio' ? 'no começo de uma frase' : 'no meio de uma frase'), ms].filter(Boolean).join(' · ') : undefined}
            />
            <Dado rotulo="Fala no trecho" valor={`${c.palavras} palavra${c.palavras === 1 ? '' : 's'}`} detalhe={c.por_minuto ? `${c.por_minuto} palavras/min` : undefined} />
            <Dado rotulo="Vem depois de" valor={c.anterior ? p.categorias[c.anterior.tipo] : '— (abre o vídeo)'} detalhe={c.anterior ? seg(c.anterior.duracao) : undefined} />
            <Dado rotulo="Vai para" valor={c.seguinte ? p.categorias[c.seguinte.tipo] : '— (fecha o vídeo)'} detalhe={c.seguinte ? seg(c.seguinte.duracao) : undefined} />
          </div>

          {c.elementos.length > 0 && (
            <Bloco titulo="Elementos dentro do plano">
              <div className="flex flex-wrap gap-1.5">
                {c.elementos.map((el, k) => (
                  <span key={k} className="rounded-full border border-line-dark px-2.5 py-1 text-[11px]">
                    {p.nomesElementos[el.tipo]}
                    {el.texto && `: “${el.texto}”`} · {seg(el.inicio)}
                  </span>
                ))}
              </div>
            </Bloco>
          )}

          {c.fala && (
            <Bloco titulo="Fala">
              <p className="border-l-2 border-line-dark pl-3 leading-[1.7] text-fog">“{c.fala}”</p>
            </Bloco>
          )}

          <Bloco titulo={`Vídeo de origem · ${p.origem.nome}`}>
            <p className="mb-2 text-fog">
              {seg(p.origem.duracao)} · {p.origem.planos.length} planos ·{' '}
              <Link to={`/calibragem/${c.ref}`} className="text-yellow hover:underline">
                abrir na calibragem ↗
              </Link>
            </p>
            <div className="grid gap-1">
              {Object.entries(p.origem.proporcao)
                .sort((a, b) => b[1] - a[1])
                .map(([tipo, f]) => (
                  <div key={tipo} className="grid grid-cols-[150px_1fr_40px] items-center gap-2 text-[11px]">
                    <span className="truncate text-fog">{p.categorias[tipo]}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-deeper">
                      <span className={cn('block h-full', COR_PLANO[tipo])} style={{ width: `${f * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{Math.round(f * 100)}%</span>
                  </div>
                ))}
            </div>
          </Bloco>

          <div className="mt-auto flex items-center gap-2 pt-1">
            <button
              onClick={() => p.anterior?.()}
              disabled={!p.anterior}
              className="flex h-9 items-center gap-1 rounded-full border border-line-dark px-3 text-[12px] font-semibold hover:border-cream/50 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" /> Anterior
            </button>
            <button
              onClick={() => p.proximo?.()}
              disabled={!p.proximo}
              className="flex h-9 items-center gap-1 rounded-full border border-line-dark px-3 text-[12px] font-semibold hover:border-cream/50 disabled:opacity-40"
            >
              Próximo <ChevronRight className="size-4" />
            </button>
            <span className="ml-2 text-[11px] text-fog">← → navegam · Espaço pausa · Esc fecha</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 text-sage">{titulo}</p>
      {children}
    </div>
  )
}

function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{rotulo}</p>
      <p className="mt-0.5 font-semibold">{valor}</p>
      {detalhe && <p className="text-[11px] text-fog">{detalhe}</p>}
    </div>
  )
}
