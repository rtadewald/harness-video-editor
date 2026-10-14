import { useEffect, useRef, useState } from 'react'
import { Play, Plus, Scissors, Settings2, Star, Trash2, X } from 'lucide-react'
import { enviar, json } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { ChipCodigo } from '@/components/Codigo'
import { Button } from '@/components/ui/button'
import { useFecharComEsc } from '@/lib/atalhos'
import { cn } from '@/lib/utils'
import { tempo } from '@/revisao/comum'

type Cta = { id: string; nome: string; categoria: string | null; produto: string | null; inicio: number; fim: number; duracao: number; favorito: boolean; fonte?: string }
type Categoria = { id: string; nome: string; saida: string; emoji: string }
type Produto = { id: string; nome: string; emoji: string }
type Dados = { ctas: Cta[]; categorias: Categoria[]; produtos: Produto[] }

const ler = () => fetch('/api/ctas').then(json<Dados>)
const editar = (id: string, campos: Partial<Cta>) => enviar<Cta>('PUT', `/api/ctas/${id}`, campos)
const url = (id: string, arq: string) => `/api/ctas/${id}/${arq}`
const FILTRO = 'ctas.produto'

/** `/ctas`: os CTAs (docs/editor-claude.md, E10; Q20; do 19): trechos finais de vídeos já editados, que entram inteiros no
 *  fim de um orgânico e dão as saídas do projeto (📱 Reels ManyChat, 💰 Ad LP, 💰 Ad VSL…). Suba o vídeo editado, marque
 *  onde o CTA começa e termina, escolha a categoria (a saída), o produto e o favorito de cada categoria (o que entra por
 *  padrão). A entrada do CTA no fluxo de edição fica para depois. */
export default function Ctas() {
  const [d, setD] = useState<Dados | null>(null)
  const [filtro, setFiltroBruto] = useState(() => {
    try {
      return localStorage.getItem(FILTRO) ?? ''
    } catch {
      return ''
    }
  })
  const [marcando, setMarcando] = useState<Cta | null>(null)
  const [produtosAberto, setProdutosAberto] = useState(false)
  const [aviso, setAviso] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const recarregar = () => void ler().then(setD).catch((e) => setAviso((e as Error).message))
  useEffect(recarregar, [])
  const setFiltro = (f: string) => {
    setFiltroBruto(f)
    try {
      localStorage.setItem(FILTRO, f)
    } catch {
      /* sem armazenamento */
    }
  }
  const mudar = (id: string, campos: Partial<Cta>) =>
    void editar(id, campos)
      .then(recarregar)
      .catch((e) => setAviso((e as Error).message))
  const subir = async (arquivos: File[]) => {
    const l = arquivos.filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f.name))
    if (!l.length) return setAviso('Use um vídeo (MP4, MOV ou WebM)')
    for (const [k, f] of l.entries()) {
      setAviso(`Enviando ${k + 1} de ${l.length}… ${f.name}`)
      const corpo = new FormData()
      corpo.append('arquivos', f)
      try {
        await fetch('/api/ctas', { method: 'POST', body: corpo }).then(json)
      } catch (e) {
        setAviso(`${f.name}: ${(e as Error).message}`)
        return recarregar()
      }
    }
    setAviso('Subiu: escolha a categoria e marque onde o CTA começa')
    recarregar()
  }
  const apagar = (c: Cta) => {
    if (!window.confirm(`Apagar “${c.nome}”? Vai para dados/ctas/_lixeira/, de onde dá para recuperar.`)) return
    void enviar('DELETE', `/api/ctas/${c.id}`).then(recarregar)
  }

  const prods = Object.fromEntries((d?.produtos ?? []).map((p) => [p.id, p]))
  const cats = Object.fromEntries((d?.categorias ?? []).map((c) => [c.id, c]))
  const ordem = ['', ...(d?.categorias ?? []).map((c) => c.id)]
  const passa = (c: Cta, f: string) => (f === '' ? true : f === '_sem' ? !prods[c.produto ?? ''] : c.produto === f)
  const lista = (d?.ctas ?? []).filter((c) => passa(c, filtro)).sort((a, b) => ordem.indexOf(a.categoria ?? '') - ordem.indexOf(b.categoria ?? ''))

  return (
    <div
      className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream"
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        void subir([...e.dataTransfer.files])
      }}
    >
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
        <Button variant="coral" size="sm" className="ml-auto h-9 gap-6 px-4" onClick={() => entrada.current?.click()}>
          Subir vídeo <span className="seta">↗</span>
        </Button>
        <input
          ref={entrada}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          multiple
          hidden
          onChange={(e) => {
            void subir([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>
      <nav className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-6 py-3">
        {[['', 'Todos', ''], ...(d?.produtos ?? []).map((p) => [p.id, p.nome, p.emoji]), ['_sem', 'Sem produto', '']].map(([id, nome, em]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={cn(
              'flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold',
              filtro === id ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream',
            )}
          >
            {em && `${em} `}
            {nome}
            <span className="tabular-nums opacity-60">{(d?.ctas ?? []).filter((c) => passa(c, id)).length}</span>
          </button>
        ))}
        <button onClick={() => setProdutosAberto(true)} className="ml-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-fog ring-1 ring-line-dark hover:text-cream">
          <Settings2 className="size-3.5" /> Produtos
        </button>
        <span className="ml-auto text-[12px] text-fog">{aviso}</span>
      </nav>
      <main className={cn('overflow-y-auto px-8 py-8', arrastando && 'bg-coral/10')}>
        <div className="mb-6 grid gap-2 border-b border-line-dark pb-4">
          <p className="eyebrow text-sage">CTAs · {String(d?.ctas.length ?? 0).padStart(2, '0')}</p>
          <p className="max-w-[760px] text-[12px] leading-[1.7] text-fog">
            Trechos finais de vídeos já editados, que entram inteiros no fim de um orgânico. A categoria define a saída que o CTA dá ao projeto (📱 Reels ManyChat,
            💰 Ad LP, 💰 Ad VSL…); a ★ é o favorito da categoria, o que entra por padrão. Suba o vídeo editado (ou arraste para esta página) e marque onde o CTA começa
            e termina.
          </p>
        </div>
        {d && !d.ctas.length && <p className="text-[13px] text-fog">Nenhum CTA ainda.</p>}
        <ul className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {lista.map((c) => (
            <CartaoCta
              key={c.id}
              c={c}
              cat={cats[c.categoria ?? '']}
              d={d!}
              mudar={(campos) => mudar(c.id, campos)}
              marcar={() => setMarcando(c)}
              apagar={() => apagar(c)}
            />
          ))}
          <li>
            <button
              onClick={() => entrada.current?.click()}
              className="group flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-[6px] border border-dashed border-line-dark text-fog hover:border-coral hover:text-cream"
            >
              <span className="grid size-11 place-items-center rounded-full bg-coral text-cream transition-transform group-hover:rotate-90">
                <Plus className="size-5" />
              </span>
              <span className="text-[13px] font-semibold text-cream">Subir vídeo</span>
            </button>
          </li>
        </ul>
      </main>
      {marcando && <MarcarCta c={marcando} fechar={() => setMarcando(null)} salvar={(ini, fim) => void editar(marcando.id, { inicio: ini, fim }).then(() => (setMarcando(null), recarregar())).catch((e) => setAviso((e as Error).message))} />}
      {produtosAberto && d && <EditarProdutos lista={d.produtos} fechar={() => setProdutosAberto(false)} salvo={recarregar} />}
    </div>
  )
}

/** O card: a miniatura (com o mouse em cima, toca o trecho mudo; clicar toca com som), a categoria, a ★, o nome, o
 *  código, o produto e a categoria. */
function CartaoCta(p: { c: Cta; cat?: Categoria; d: Dados; mudar: (campos: Partial<Cta>) => void; marcar: () => void; apagar: () => void }) {
  const { c } = p
  const v = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState<'mudo' | 'som' | null>(null)
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const el = v.current
    if (!el || !tocando) return
    el.muted = tocando === 'mudo'
    el.currentTime = c.inicio
    void el.play().catch(() => undefined)
    let raf = 0
    const passo = () => {
      if (el.currentTime >= c.fim || el.currentTime < c.inicio - 0.2) el.currentTime = c.inicio
      setPct(Math.min(100, Math.max(0, ((el.currentTime - c.inicio) / (c.fim - c.inicio)) * 100)))
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(raf)
      el.pause()
    }
  }, [tocando, c.inicio, c.fim])
  const [nome, setNome] = useState(c.nome)
  return (
    <li className="group grid content-start gap-2.5">
      <div
        className="relative aspect-[9/16] cursor-pointer overflow-hidden rounded-[6px] bg-black ring-1 ring-line-dark"
        onMouseEnter={() => tocando !== 'som' && setTocando('mudo')}
        onMouseLeave={() => tocando !== 'som' && setTocando(null)}
        onClick={() => setTocando(tocando === 'som' ? null : 'som')}
      >
        <img src={`${url(c.id, 'miniatura.jpg')}?${c.inicio}`} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        {tocando && <video ref={v} src={url(c.id, 'proxy.mp4')} playsInline className="absolute inset-0 size-full object-cover" />}
        <span className={cn('absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold', p.cat ? 'bg-yellow text-ink' : 'bg-coral text-cream')}>
          {p.cat ? `${p.cat.emoji} ${p.cat.saida}` : 'Sem categoria'}
        </span>
        <button
          onClick={(e) => (e.stopPropagation(), p.mudar({ favorito: !c.favorito }))}
          title={c.favorito ? 'Favorito da categoria (entra por padrão)' : 'Tornar o favorito da categoria'}
          className={cn('absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-ink/80', c.favorito ? 'text-yellow' : 'text-fog hover:text-cream')}
        >
          <Star className={cn('size-3.5', c.favorito && 'fill-current')} />
        </button>
        {!tocando && <Play className="absolute top-1/2 left-1/2 size-8 -translate-1/2 text-cream/80 opacity-0 group-hover:opacity-100" />}
        <span className="absolute right-2 bottom-2 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums">{tempo(c.fim - c.inicio)}</span>
        <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={(e) => (e.stopPropagation(), p.marcar())} title="Marcar onde o CTA começa e termina" className="grid size-7 place-items-center rounded-full bg-ink/85 text-fog hover:text-cream">
            <Scissors className="size-3.5" />
          </button>
          <button onClick={(e) => (e.stopPropagation(), p.apagar())} title="Apagar (vai para dados/ctas/_lixeira/)" className="grid size-7 place-items-center rounded-full bg-ink/85 text-fog hover:text-coral">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {tocando && <div className="absolute inset-x-0 bottom-0 h-[3px] bg-cream/20"><i className="block h-full bg-coral" style={{ width: `${pct}%` }} /></div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => (nome.trim() && nome.trim() !== c.nome ? p.mudar({ nome: nome.trim() }) : setNome(c.nome))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          title={c.fonte ? `${c.nome} · ${c.fonte}` : c.nome}
          className="min-w-0 flex-1 truncate bg-transparent text-[13px] font-semibold outline-none focus:underline"
        />
        <ChipCodigo tipo="cta" id={c.id} nome={c.nome} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <select value={c.produto ?? ''} onChange={(e) => p.mudar({ produto: e.target.value || null })} className="rounded-full bg-deeper px-2 py-1 text-cream ring-1 ring-line-dark" title="Produto">
          <option value="">Sem produto</option>
          {p.d.produtos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.emoji} {x.nome}
            </option>
          ))}
        </select>
        <select value={c.categoria ?? ''} onChange={(e) => p.mudar({ categoria: e.target.value || null })} className="rounded-full bg-deeper px-2 py-1 text-cream ring-1 ring-line-dark" title="Categoria (a saída que o CTA dá)">
          <option value="">Sem categoria</option>
          {p.d.categorias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.emoji} {x.nome} → {x.saida}
            </option>
          ))}
        </select>
      </div>
    </li>
  )
}

/** Marcar onde o CTA começa e termina: o vídeo inteiro com a tira de quadros; I/O (ou os botões) no instante do vídeo. */
function MarcarCta(p: { c: Cta; fechar: () => void; salvar: (ini: number, fim: number) => void }) {
  const ref = useFecharComEsc(p.fechar)
  const v = useRef<HTMLVideoElement>(null)
  const [ini, setIni] = useState(p.c.inicio)
  const [fim, setFim] = useState(p.c.fim)
  const [t, setT] = useState(p.c.inicio)
  const dur = p.c.duracao
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const agora = v.current?.currentTime ?? 0
      if (e.key.toLowerCase() === 'i') setIni(Math.min(agora, fim - 0.5))
      else if (e.key.toLowerCase() === 'o') setFim(Math.max(agora, ini + 0.5))
      else if (e.code === 'Space') {
        e.preventDefault()
        if (v.current) void (v.current.paused ? v.current.play() : v.current.pause())
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ini, fim])
  const ir = (x: number) => {
    if (v.current) v.current.currentTime = x
  }
  return (
    <div ref={ref} data-modal className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={p.fechar}>
      <div className="grid w-full max-w-[900px] gap-4 rounded-[8px] bg-deep p-6 ring-1 ring-line-dark" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <p className="text-[16px] font-semibold">Marcar o CTA · {p.c.nome}</p>
          <button onClick={p.fechar} className="ml-auto text-fog hover:text-cream" title="Fechar (Esc)">
            <X className="size-4" />
          </button>
        </div>
        <video ref={v} src={url(p.c.id, 'proxy.mp4')} controls playsInline onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} onLoadedMetadata={() => ir(p.c.inicio)} className="mx-auto max-h-[52vh] rounded-[6px] bg-black" />
        <div
          className="relative h-[54px] cursor-pointer overflow-hidden rounded-[4px] bg-black"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            ir(((e.clientX - r.left) / r.width) * dur)
          }}
        >
          <img src={url(p.c.id, 'tira.jpg')} alt="" className="absolute inset-0 h-full w-full object-fill opacity-60" />
          <div className="absolute inset-y-0 border-x-2 border-coral bg-coral/25" style={{ left: `${(ini / dur) * 100}%`, width: `${((fim - ini) / dur) * 100}%` }} />
          <div className="absolute inset-y-0 w-[2px] bg-cream" style={{ left: `${(t / dur) * 100}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Button variant="pill" size="sm" onClick={() => setIni(Math.min(t, fim - 0.5))}>
            Início aqui <kbd className="text-fog">I</kbd>
          </Button>
          <Button variant="pill" size="sm" onClick={() => setFim(Math.max(t, ini + 0.5))}>
            Fim aqui <kbd className="text-fog">O</kbd>
          </Button>
          <span className="font-mono text-fog tabular-nums">
            {tempo(ini)} – {tempo(fim)} · {tempo(fim - ini)}
          </span>
          <Button variant="pill" size="sm" onClick={() => ir(ini)}>
            Ouvir do início
          </Button>
          <Button variant="coral" size="sm" className="ml-auto" onClick={() => p.salvar(ini, fim)}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Os produtos (a que produto cada CTA leva): emoji e nome editáveis, novo e tirar; grava a lista inteira. */
function EditarProdutos(p: { lista: Produto[]; fechar: () => void; salvo: () => void }) {
  const ref = useFecharComEsc(p.fechar)
  const [l, setL] = useState(p.lista.map((x) => ({ ...x })))
  const mudar = (k: number, campo: 'nome' | 'emoji', valor: string) => setL((x) => x.map((y, i) => (i === k ? { ...y, [campo]: valor } : y)))
  return (
    <div ref={ref} data-modal className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={p.fechar}>
      <div className="grid w-full max-w-[460px] gap-4 rounded-[8px] bg-deep p-6 ring-1 ring-line-dark" onClick={(e) => e.stopPropagation()}>
        <p className="text-[16px] font-semibold">Produtos <span className="text-[12px] font-normal text-fog">a que produto cada CTA leva</span></p>
        {l.map((x, k) => (
          <div key={k} className="flex items-center gap-2">
            <input value={x.emoji} onChange={(e) => mudar(k, 'emoji', e.target.value)} maxLength={8} placeholder="🏷️" className="w-12 rounded-[4px] bg-deeper px-2 py-1.5 text-center ring-1 ring-line-dark" />
            <input value={x.nome} onChange={(e) => mudar(k, 'nome', e.target.value)} maxLength={60} placeholder="Nome do produto" className="flex-1 rounded-[4px] bg-deeper px-2.5 py-1.5 text-[13px] ring-1 ring-line-dark" />
            <button onClick={() => setL((y) => y.filter((_, i) => i !== k))} title="Tirar (os CTAs dele ficam sem produto)" className="text-fog hover:text-coral">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button variant="pill" size="sm" onClick={() => setL((y) => [...y, { id: '', nome: '', emoji: '' }])}>
            <Plus className="size-3.5" /> Novo produto
          </Button>
          <Button
            variant="coral"
            size="sm"
            className="ml-auto"
            onClick={() =>
              void enviar('PUT', '/api/ctas-produtos', { produtos: l })
                .then(() => (p.fechar(), p.salvo()))
                .catch((e) => window.alert((e as Error).message))
            }
          >
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
