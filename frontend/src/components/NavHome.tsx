import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Blend, BookOpenText, ChevronLeft, ChevronRight, Clapperboard, Film, FolderOpen, Images, Layers, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fecharAba, useAbasProjetos } from './abasProjetos'

/** A barra de cima de todas as telas, nas pílulas `.tab` do Otto: primeiro os projetos abertos como abas (× fecha; dois
 *  cliques no nome da aba ativa renomeiam, quando a tela permite), depois o trabalho do dia a dia — Projetos, Banco
 *  (vídeos e imagens dos inserts), Motions (galeria dos presets de motion) e Referências (galeria dos planos); à direita,
 *  o que treina e regula o app — Presets (de enriquecimento), Transições (entre os planos), a Calibragem (vídeos que
 *  treinam a Direção visual) e a Heurística da direção. */
const PILULA = 'shrink-0 rounded-full border text-[12px] font-semibold tracking-[-0.01em] transition-colors duration-300'
const ATIVA = 'border-cream bg-cream text-ink'
const INATIVA = 'border-line-dark text-fog hover:border-cream/50 hover:text-cream'
type Link = { para: string; nome: string; icone: LucideIcon; exato?: boolean }
const LINKS: Link[] = [
  { para: '/', nome: 'Projetos', icone: FolderOpen, exato: true },
  { para: '/banco', nome: 'Banco', icone: Images },
  { para: '/motions', nome: 'Motions', icone: Clapperboard },
  { para: '/referencias', nome: 'Referências', icone: Film },
]
// o que treina e regula o app, alinhado à direita
const TREINO: Link[] = [
  { para: '/presets', nome: 'Presets', icone: Layers },
  { para: '/transicoes', nome: 'Transições', icone: Blend },
  { para: '/calibragem', nome: 'Calibragem', icone: SlidersHorizontal }, // acesa também na revisão de uma referência
  { para: '/heuristica', nome: 'Heurística da direção', icone: BookOpenText },
]
export default function NavHome({ renomear }: { renomear?: (id: string, nome: string) => Promise<unknown> }) {
  const abas = useAbasProjetos()
  const local = useLocation()
  const ir = useNavigate()
  const aba = ({ isActive }: { isActive: boolean }) => cn(PILULA, 'flex items-center gap-1.5 px-3.5 py-[7px]', isActive ? ATIVA : INATIVA)
  // os rótulos somem pelo espaço que sobra para os links (container query em `links`), não pela largura da janela: no
  // editor a barra divide o espaço com os botões da etapa e o Exportar, e as abas abertas também ocupam (até 40%: primeiro
  // encolhem, com o nome cortado; depois rolam, com a ativa sempre à vista); se nem só com os ícones couber (a busca do
  // Banco), os links rolam em vez de passar por cima do que vem depois. O que fica fora da vista ganha um degradê e uma
  // seta no lado (clicar rola)
  return (
    <nav className="flex w-0 min-w-0 flex-1 items-center gap-1.5">
      {/* com duas abas ou mais, cabe sempre uma aba inteira (mín. 120 px) entre as duas setas (36 px cada): a ativa, com o × */}
      <Rolavel className={cn('max-w-[40%] shrink-0', abas.length > 1 && 'min-w-[192px]')}>
        {abas.map((a) => {
          const ativa = local.pathname === `/p/${a.id}`
          return (
            <AbaDeProjeto
              key={a.id}
              nome={a.nome}
              ativa={ativa}
              abrir={() => ir(`/p/${a.id}`)}
              fechar={() => {
                fecharAba(a.id)
                if (ativa) ir('/')
              }}
              renomear={ativa && renomear ? (nome) => renomear(a.id, nome) : undefined}
            />
          )
        })}
      </Rolavel>
      <Rolavel className="@container/links flex-1">
        {abas.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-line-dark" />}
        {LINKS.map((l) => (
          <NavLink key={l.para} to={l.para} end={l.exato} className={aba} title={l.nome} aria-label={l.nome}>
            <l.icone className="size-3.5 opacity-80" aria-hidden />
            <span className="@max-[760px]/links:hidden">{l.nome}</span>
          </NavLink>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-3">
          {TREINO.map((l) => (
            <NavLink key={l.para} to={l.para} end={l.exato} className={aba} title={l.nome} aria-label={l.nome}>
              <l.icone className="size-3.5 opacity-80" aria-hidden />
              <span className="@max-[960px]/links:hidden">{l.nome}</span>
            </NavLink>
          ))}
        </div>
      </Rolavel>
    </nav>
  )
}

/** Uma faixa que rola de lado sem barra de rolagem: quando há o que ver fora dela, um degradê e uma seta naquele lado. */
function Rolavel({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fora, setFora] = useState({ esq: false, dir: false })
  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    const esq = el.scrollLeft > 1
    const dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFora((f) => (f.esq === esq && f.dir === dir ? f : { esq, dir }))
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // a faixa e cada item (as abas abrem e fecham, os rótulos somem e voltam): qualquer mudança de tamanho remede
    const tamanhos = new ResizeObserver(medir)
    const observar = () => {
      tamanhos.disconnect()
      tamanhos.observe(el)
      for (const c of el.children) tamanhos.observe(c)
      medir()
    }
    const itens = new MutationObserver(observar)
    itens.observe(el, { childList: true })
    observar()
    return () => {
      tamanhos.disconnect()
      itens.disconnect()
    }
  }, [medir])
  const rolar = (sentido: 1 | -1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: sentido * Math.max(el.clientWidth * 0.7, 80), behavior: 'smooth' })
  }
  return (
    <div className={cn('relative flex min-w-0', className)}>
      {/* scroll-px: um item trazido à vista (a aba ativa) para antes da seta (w-9), sem ficar embaixo do degradê */}
      <div ref={ref} onScroll={medir} className="flex min-w-0 flex-1 scroll-px-10 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {fora.esq && <Seta lado="esq" rolar={() => rolar(-1)} />}
      {fora.dir && <Seta lado="dir" rolar={() => rolar(1)} />}
    </div>
  )
}

function Seta({ lado, rolar }: { lado: 'esq' | 'dir'; rolar: () => void }) {
  return (
    <button
      onClick={rolar}
      tabIndex={-1}
      aria-label={lado === 'esq' ? 'Ver os da esquerda' : 'Ver mais'}
      title={lado === 'esq' ? 'Ver os da esquerda' : 'Ver mais'}
      className={cn(
        'absolute inset-y-0 z-10 flex w-9 items-center text-fog hover:text-cream',
        lado === 'esq' ? 'left-0 justify-start bg-gradient-to-r from-ink from-40% to-transparent' : 'right-0 justify-end bg-gradient-to-l from-ink from-40% to-transparent',
      )}
    >
      {lado === 'esq' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  )
}

function AbaDeProjeto(p: { nome: string; ativa: boolean; abrir: () => void; fechar: () => void; renomear?: (nome: string) => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  // a aba ativa nunca fica escondida na rolagem das abas
  useEffect(() => {
    if (p.ativa) ref.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [p.ativa])
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(p.nome)
  const confirmar = async () => {
    const novo = valor.trim()
    setEditando(false)
    if (!novo || novo === p.nome || !p.renomear) return
    try {
      await p.renomear(novo)
    } catch (e) {
      window.alert((e as Error).message)
      setValor(p.nome)
    }
  }
  return (
    <div ref={ref} className={cn(PILULA, 'flex max-w-[230px] min-w-[120px] shrink items-center gap-2 py-[3px] pr-1 pl-3.5', p.ativa ? ATIVA : INATIVA)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', p.ativa ? 'bg-[#c4502f]' : 'bg-coral/70')} />
      {editando ? (
        <input
          autoFocus
          value={valor}
          maxLength={120}
          onChange={(e) => setValor(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => void confirmar()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setValor(p.nome)
              setEditando(false)
            }
          }}
          aria-label="Nome do projeto"
          className="h-6 w-36 rounded-[3px] border border-ink/30 bg-cream px-1.5 text-[12px] text-ink outline-none"
        />
      ) : (
        <button
          onClick={p.abrir}
          onDoubleClick={() => p.renomear && (setValor(p.nome), setEditando(true))}
          className="min-w-0 truncate"
          title={p.renomear ? `${p.nome} · dois cliques para renomear` : p.nome}
        >
          {p.nome}
        </button>
      )}
      <button
        onClick={p.fechar}
        className={cn('grid size-[22px] shrink-0 place-items-center rounded-full border', p.ativa ? 'border-ink/20 hover:bg-ink/10' : 'border-line-dark hover:bg-cream/10')}
        aria-label={`Fechar ${p.nome}`}
        title="Fechar o projeto"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
