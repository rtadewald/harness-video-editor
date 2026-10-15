import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Blend, BookOpenText, GraduationCap, Megaphone, ChevronLeft, ChevronRight, Film, Images, Layers, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
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
// o trabalho do dia a dia (os projetos: o logo do Harness, no canto)
const LINKS: Link[] = [
  { para: '/banco', nome: 'Banco', icone: Images }, // as mídias dos inserts e os motions
  { para: '/referencias', nome: 'Referências', icone: Film },
  { para: '/ctas', nome: 'CTAs', icone: Megaphone }, // os finais prontos que dão as saídas do projeto (docs/editor-claude.md, E10)
  { para: '/presets', nome: 'Presets', icone: Layers },
  { para: '/transicoes', nome: 'Transições', icone: Blend },
]
// o que treina e regula o app, alinhado à direita (como no 19)
const TREINO: Link[] = [
  { para: '/calibragem', nome: 'Calibragem', icone: SlidersHorizontal }, // acesa também na revisão de uma referência
  { para: '/heuristica', nome: 'Heurística', icone: BookOpenText },
  { para: '/aprendizados', nome: 'Aprendizados', icone: GraduationCap }, // o que o Claude aprendeu editando (a skill do editor)
]
export default function NavHome({ renomear }: { renomear?: (id: string, nome: string) => Promise<unknown> }) {
  const abas = useAbasProjetos()
  const local = useLocation()
  const ir = useNavigate()
  const aba = ({ isActive }: { isActive: boolean }) => cn(PILULA, 'flex items-center gap-1.5 px-3 py-[7px]', isActive ? ATIVA : INATIVA)
  // os da direita (Calibragem, Heurística, Aprendizados) são sempre só ícone; os rótulos da esquerda somem pelo espaço que
  // sobra (medido, não por um corte fixo de largura) quando nem assim cabem. `precisa[n]`: a largura que os
  // links pediam no degrau n quando não couberam (para voltar a ele quando houver espaço)
  const links = useRef<HTMLDivElement>(null)
  const [compacto, setCompacto] = useState<0 | 1 | 2>(0)
  const precisa = useRef<number[]>([0, 0, 0])
  useEffect(() => {
    const el = links.current
    if (!el) return
    const medir = () => {
      if (compacto < 2 && el.scrollWidth > el.clientWidth + 1) {
        precisa.current[compacto] = el.scrollWidth
        setCompacto((compacto + 1) as 1 | 2)
      } else if (compacto > 0 && precisa.current[compacto - 1] && el.clientWidth >= precisa.current[compacto - 1]) {
        setCompacto((compacto - 1) as 0 | 1)
      }
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compacto, abas.length])
  // os rótulos somem todos juntos (os da esquerda e os da direita, o mesmo padrão em todas as páginas) pelo espaço que sobra para os links (container query em `links`), não pela largura da janela: no
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
      <Rolavel className="flex-1" refInterno={links}>
        {abas.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-line-dark" />}
        {LINKS.map((l) => (
          <NavLink key={l.para} to={l.para} end={l.exato} className={aba} title={l.nome} aria-label={l.nome}>
            <l.icone className="size-3.5 opacity-80" aria-hidden />
            {compacto < 2 && <span>{l.nome}</span>}
          </NavLink>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-3">
          {TREINO.map((l) => (
            <NavLink key={l.para} to={l.para} end={l.exato} className={aba} title={l.nome} aria-label={l.nome}>
              {({ isActive }) => (
                <>
                  <l.icone className="size-3.5 opacity-80" aria-hidden />
                  {/* a direita é só ícone (o nome no title), menos a página aberta, que mostra o nome */}
                  {isActive && <span>{l.nome}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </Rolavel>
    </nav>
  )
}

/** Uma faixa que rola de lado sem barra de rolagem: quando há o que ver fora dela, um degradê e uma seta naquele lado. */
function Rolavel({ className, children, refInterno }: { className?: string; children: ReactNode; refInterno?: React.RefObject<HTMLDivElement | null> }) {
  const proprio = useRef<HTMLDivElement>(null)
  const ref = refInterno ?? proprio
  const [fora, setFora] = useState({ esq: false, dir: false })
  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    const esq = el.scrollLeft > 1
    const dir = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFora((f) => (f.esq === esq && f.dir === dir ? f : { esq, dir }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- o ref (próprio ou de fora) é fixo
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
  }, [medir]) // eslint-disable-line react-hooks/exhaustive-deps
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
