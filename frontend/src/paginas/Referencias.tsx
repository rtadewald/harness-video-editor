import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Search, Star, X } from 'lucide-react'
import { listarClipes, listarFontesPresets, marcarFavorito, urlArquivoReferencia, type ClipeReferencia, type FontePreset, type OrigemClipe } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import { useLembrado } from '@/lib/useLembrado'
import IconeGrupo from '@/referencias/IconeGrupo'
import { COR_PLANO } from '@/referencias/LinhaDirecao'

type Ordem = 'aleatorio' | 'longos' | 'curtos' | 'video'
const dur = (c: ClipeReferencia) => c.fim - c.inicio
/** Só o ator falando (com ou sem lettering): a caixa "Ignorar Full ator" esconde os dois. */
export const SO_ATOR = ['full_ator', 'full_ator_lettering']
/** Os chips de filtro, agrupados (pedido de Rodrigo, out/2026): tela dividida e tela cheia valem para insert e motion; o
 *  comentário vai no fim. Uma categoria nova que não esteja aqui vira um chip próprio antes do comentário. */
export const GRUPOS: { id: string; nome: string; tipos: string[] }[] = [
  { id: 'tela_dividida', nome: 'Tela dividida', tipos: ['tela_dividida_insert', 'tela_dividida_motion'] },
  { id: 'tela_cheia', nome: 'Tela cheia', tipos: ['insert_tela_cheia', 'motion_tela_cheia'] },
  { id: 'full_ator_lettering', nome: 'Full ator com lettering', tipos: ['full_ator_lettering'] },
  { id: 'full_ator', nome: 'Full ator', tipos: ['full_ator'] },
  { id: 'comentario_insert_ator', nome: 'Comentário + insert + ator', tipos: ['comentario_insert_ator'] },
]
/** Os presets feitos a partir deste trecho (o trecho do preset cai dentro do clipe, com folga de meio segundo). */
const presetsDoClipe = (fs: FontePreset[], c: ClipeReferencia) => fs.filter((f) => f.ref === c.ref && f.inicio >= c.inicio - 0.5 && f.fim <= c.fim + 0.5)
const seg = (t: number) => `${t.toFixed(1).replace('.', ',')} s`
const chave = (c: ClipeReferencia) => `${c.ref}/${c.id}`

/** Galeria dos planos-base identificados nos vídeos de referência, por categoria. Cada clipe toca sozinho. */
export default function Referencias() {
  const [clipes, setClipes] = useState<ClipeReferencia[] | null>(null)
  const [categorias, setCategorias] = useState<Record<string, string>>({})
  const [nomesElementos, setNomesElementos] = useState<Record<string, string>>({})
  const [origens, setOrigens] = useState<Record<string, OrigemClipe>>({})
  const [fontes, setFontes] = useState<FontePreset[]>([])
  const [erro, setErro] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('aleatorio')
  const [soRevisadas, setSoRevisadas] = useState(false)
  const [soFavoritos, setSoFavoritos] = useState(false)
  // os "Full ator" (só o ator falando, com ou sem lettering) quase nunca servem de referência: ficam de fora por padrão (lembrado neste navegador)
  const [semFullAtor, lembrarSemFullAtor] = useLembrado('referencias.semFullAtor', true)
  const setSemFullAtor = (v: boolean) => {
    lembrarSemFullAtor(v)
    if (v && categoria && SO_ATOR.includes(categoria)) setCategoria(null)
  }
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
    listarFontesPresets().then(setFontes).catch(() => {})
  }, [])

  /** Liga/desliga o favorito na hora e grava no servidor; se falhar, volta. */
  const favoritar = (c: ClipeReferencia) => {
    const novo = !c.favorito
    const trocar = (v: boolean) => setClipes((l) => l && l.map((x) => (chave(x) === chave(c) ? { ...x, favorito: v } : x)))
    trocar(novo)
    marcarFavorito(c.ref, c.inicio, c.fim, novo).catch((e) => {
      trocar(!novo)
      setErro(e.message)
    })
  }

  // ordem aleatória estável enquanto a página está aberta: cada clipe é sorteado uma vez só (favoritar não embaralha)
  const sorteado = useRef(new Map<string, number>())
  const sorteio = useMemo(() => {
    for (const c of clipes ?? []) if (!sorteado.current.has(chave(c))) sorteado.current.set(chave(c), Math.random())
    return sorteado.current
  }, [clipes])

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (clipes ?? []).filter(
      (c) =>
        (!semFullAtor || !SO_ATOR.includes(c.tipo)) && (!soRevisadas || c.revisado) && (!soFavoritos || c.favorito) && (!q || [c.descricao, c.texto ?? '', c.fala, c.ref_nome].some((t) => t.toLowerCase().includes(q))),
    )
  }, [clipes, busca, soRevisadas, soFavoritos, semFullAtor])

  // os grupos fixos, com as categorias que não estão neles antes do comentário
  const grupos = useMemo(() => {
    const cobertos = new Set(GRUPOS.flatMap((g) => g.tipos))
    const soltos = Object.entries(categorias).filter(([t]) => !cobertos.has(t)).map(([t, nome]) => ({ id: t, nome, tipos: [t] }))
    return [...GRUPOS.slice(0, -1), ...soltos, GRUPOS[GRUPOS.length - 1]]
  }, [categorias])
  const tiposDe = (grupo: string) => grupos.find((g) => g.id === grupo)?.tipos ?? [grupo]

  const visiveis = useMemo(() => {
    const l = base.filter((c) => !categoria || tiposDe(categoria).includes(c.tipo))
    if (ordem === 'aleatorio') return [...l].sort((a, b) => sorteio.get(chave(a))! - sorteio.get(chave(b))!)
    if (ordem === 'longos') return [...l].sort((a, b) => dur(b) - dur(a))
    if (ordem === 'curtos') return [...l].sort((a, b) => dur(a) - dur(b))
    return [...l].sort((a, b) => a.ref_nome.localeCompare(b.ref_nome) || a.inicio - b.inicio)
  }, [base, categoria, ordem, sorteio, grupos]) // eslint-disable-line react-hooks/exhaustive-deps

  const contagem = (grupo: string | null) => base.filter((c) => !grupo || tiposDe(grupo).includes(c.tipo)).length
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
            placeholder="Buscar na marcação, no texto ou na fala"
            className="w-full bg-transparent text-[12px] text-cream outline-none placeholder:text-fog/70"
          />
        </label>
        <span className="ml-auto rounded-full border border-line-dark px-3 py-1 text-[11px] text-fog tabular-nums">
          {visiveis.length} clipe{visiveis.length === 1 ? '' : 's'}
        </span>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-4 py-3">
        <button
          onClick={() => setSoFavoritos((v) => !v)}
          className={cn(
            'mr-2 flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
            soFavoritos ? 'border-yellow bg-yellow text-ink' : 'border-line-dark text-fog hover:border-yellow/60 hover:text-cream',
          )}
          title="Mostrar só os trechos favoritos"
        >
          <Star className={cn('size-3.5', soFavoritos && 'fill-current')} /> Favoritos
          <span className={cn('tabular-nums', soFavoritos ? 'text-ink/60' : 'text-fog/60')}>{(clipes ?? []).filter((c) => c.favorito).length}</span>
        </button>
        <Chip ativo={!categoria} onClick={() => setCategoria(null)} n={contagem(null)} icone="todos">
          Todos
        </Chip>
        {grupos
          .filter((g) => !semFullAtor || !g.tipos.every((t) => SO_ATOR.includes(t)))
          .map((g) => (
            <Chip key={g.id} ativo={categoria === g.id} onClick={() => setCategoria(g.id)} n={contagem(g.id)} cor={COR_PLANO[g.tipos[0]]} icone={g.id}>
              {g.nome}
            </Chip>
          ))}
        <div className="ml-auto flex items-center gap-3 text-[12px] text-fog">
          <label className="flex cursor-pointer items-center gap-1.5" title="Esconde os planos em que só o ator fala (com ou sem lettering)">
            <input type="checkbox" checked={semFullAtor} onChange={(e) => setSemFullAtor(e.target.checked)} /> Ignorar Full ator
          </label>
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
        <ul className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}>
          {visiveis.map((c) => (
            <Cartao key={chave(c)} clipe={c} nome={categorias[c.tipo]} presets={presetsDoClipe(fontes, c)} abrir={() => setAberto(chave(c))} favoritar={() => favoritar(c)} />
          ))}
        </ul>
      </main>

      {indiceAberto >= 0 && (
        <Player
          clipe={visiveis[indiceAberto]}
          origem={origens[visiveis[indiceAberto].ref]}
          presets={presetsDoClipe(fontes, visiveis[indiceAberto])}
          categorias={categorias}
          nomesElementos={nomesElementos}
          posicao={`${indiceAberto + 1} de ${visiveis.length}`}
          favoritar={() => favoritar(visiveis[indiceAberto])}
          anterior={indiceAberto > 0 ? () => setAberto(chave(visiveis[indiceAberto - 1])) : null}
          proximo={indiceAberto < visiveis.length - 1 ? () => setAberto(chave(visiveis[indiceAberto + 1])) : null}
          fechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

export function Chip({ ativo, onClick, n, cor, icone, children }: { ativo: boolean; onClick: () => void; n: number; cor?: string; icone?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
        ativo ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream',
      )}
    >
      {icone ? <IconeGrupo grupo={icone} className={ativo ? 'text-ink' : 'text-cream/70'} /> : cor && <span className={cn('size-2.5 rounded-full', cor)} />}
      {children}
      <span className={cn('tabular-nums', ativo ? 'text-ink/60' : 'text-fog/60')}>{n}</span>
    </button>
  )
}

/** Toca só o intervalo [inicio, fim) do vídeo, em loop. */
export function useTrecho(video: React.RefObject<HTMLVideoElement | null>, c: ClipeReferencia, ligado: boolean) {
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

function Estrela({ ligada, onClick, className }: { ligada: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={ligada ? 'Tirar dos favoritos' : 'Favoritar'}
      title={ligada ? 'Tirar dos favoritos' : 'Favoritar (preferência para as próximas etapas)'}
      className={cn('grid place-items-center rounded-full transition-colors', ligada ? 'text-yellow' : 'text-cream/80 hover:text-yellow', className)}
    >
      <Star className={cn('size-4', ligada && 'fill-current')} />
    </button>
  )
}

export function Cartao({ clipe: c, nome, presets = [], abrir, favoritar }: { clipe: ClipeReferencia; nome: string; presets?: FontePreset[]; abrir: () => void; favoritar: () => void }) {
  const [tocando, setTocando] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useTrecho(video, c, tocando)
  return (
    <li className="group relative" onMouseEnter={() => setTocando(true)} onMouseLeave={() => setTocando(false)}>
      <Estrela
        ligada={c.favorito}
        onClick={favoritar}
        className={cn('absolute top-2 right-2 z-10 size-8 bg-ink/80', !c.favorito && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
      />
      <button onClick={abrir} className="block w-full text-left">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-coral">
          {c.miniatura && (
            <img src={urlArquivoReferencia(c.ref, c.miniatura)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          )}
          {tocando && (
            <video ref={video} src={`${urlArquivoReferencia(c.ref, 'proxy.mp4')}#t=${c.inicio},${c.fim}`} muted playsInline preload="auto" className="absolute inset-0 size-full object-cover" />
          )}
          <span className={cn('absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[9px] font-semibold', COR_PLANO[c.tipo])}>
            {nome}
          </span>
          {presets.length > 0 && (
            <span className="absolute top-8 left-2.5 flex items-center gap-1 rounded-full bg-ink/85 px-2 py-0.5 text-[9px] font-semibold text-yellow" title={`Já virou preset: ${presets.map((f) => f.nome).join(', ')}`}>
              <Layers className="size-2.5" /> preset
            </span>
          )}
          <span className="absolute right-2.5 bottom-2.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums">{seg(dur(c))}</span>
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
  presets: FontePreset[]
  categorias: Record<string, string>
  nomesElementos: Record<string, string>
  posicao: string
  favoritar: () => void
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
      else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) p.favoritar()
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
        className="grid max-h-full w-full max-w-[1180px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-7 gap-y-5 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark"
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
        </div>

        {/* dados */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 text-[13px]">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', COR_PLANO[c.tipo])}>
              {nome}
            </span>
            {c.revisado && <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-ink">✓ revisado</span>}
            <span className="text-[11px] text-fog tabular-nums">{p.posicao}</span>
            {p.presets.length > 0 && (
              <Link to="/presets" className="flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-yellow ring-1 ring-yellow/40 hover:bg-yellow hover:text-ink" title={p.presets.map((f) => f.nome).join(', ')}>
                <Layers className="size-3" /> {p.presets.length > 1 ? `${p.presets.length} presets` : 'Virou preset'}
              </Link>
            )}
            <button
              onClick={p.favoritar}
              className={cn(
                'ml-auto flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors',
                c.favorito ? 'border-yellow bg-yellow text-ink' : 'border-line-dark text-fog hover:border-yellow/60 hover:text-cream',
              )}
              title="Favoritos viram preferência para as próximas etapas"
            >
              <Star className={cn('size-3.5', c.favorito && 'fill-current')} /> {c.favorito ? 'Favorito' : 'Favoritar'}
            </button>
            <button onClick={p.fechar} aria-label="Fechar" className="grid size-8 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
              <X className="size-4" />
            </button>
          </div>

          {c.texto && <p className="text-[18px] leading-snug font-semibold">“{c.texto}”</p>}
          <Bloco titulo="Marcação">
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

        </div>

        {/* todos os planos do vídeo de origem, na largura do modal; clique leva para aquele ponto */}
        <div className="col-span-2 grid gap-1.5">
        <div
          className="relative h-8 w-full cursor-pointer overflow-hidden rounded-[4px] bg-deeper"
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
          <div className="flex justify-between text-[10px] text-fog tabular-nums">
            <span>0 s</span>
            <span>{p.origem.nome} · {p.origem.planos.length} planos</span>
            <span>{seg(p.origem.duracao)}</span>
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
