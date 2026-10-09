import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Blend, BookOpenText, Clapperboard, Film, FolderOpen, Images, Layers, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fecharAba, useAbasProjetos } from './abasProjetos'

/** A barra de cima de todas as telas, nas pílulas `.tab` do Otto: primeiro os projetos abertos como abas (× fecha; dois
 *  cliques no nome da aba ativa renomeiam, quando a tela permite), depois Projetos, Banco (vídeos e imagens dos inserts),
 *  Referências (galeria dos planos), Presets (de enriquecimento), Motions (galeria dos presets de motion) e Transições
 *  (entre os planos), juntos; à
 *  direita, a Calibragem (vídeos que treinam a Direção visual) e a Heurística da direção. */
const PILULA = 'shrink-0 rounded-full border text-[12px] font-semibold tracking-[-0.01em] transition-colors duration-300'
const ATIVA = 'border-cream bg-cream text-ink'
const INATIVA = 'border-line-dark text-fog hover:border-cream/50 hover:text-cream'
type Link = { para: string; nome: string; icone: LucideIcon; exato?: boolean }
const LINKS: Link[] = [
  { para: '/', nome: 'Projetos', icone: FolderOpen, exato: true },
  { para: '/banco', nome: 'Banco', icone: Images },
  { para: '/referencias', nome: 'Referências', icone: Film },
  { para: '/presets', nome: 'Presets', icone: Layers },
  { para: '/motions', nome: 'Motions', icone: Clapperboard },
  { para: '/transicoes', nome: 'Transições', icone: Blend },
]
// o treino da Direção visual, alinhado à direita
const TREINO: Link[] = [
  { para: '/calibragem', nome: 'Calibragem', icone: SlidersHorizontal, exato: true },
  { para: '/heuristica', nome: 'Heurística da direção', icone: BookOpenText },
]
export default function NavHome({ renomear }: { renomear?: (id: string, nome: string) => Promise<unknown> }) {
  const abas = useAbasProjetos()
  const local = useLocation()
  const ir = useNavigate()
  const aba = ({ isActive }: { isActive: boolean }) => cn(PILULA, 'flex items-center gap-1.5 px-3.5 py-[7px]', isActive ? ATIVA : INATIVA)
  // os rótulos somem pelo espaço que sobra para os links (container query em `links`), não pela largura da janela: no
  // editor a barra divide o espaço com os botões da etapa e o Exportar, e as abas abertas também ocupam (até 40%, depois
  // rolam); se nem só com os ícones couber (a busca do Banco), os links rolam em vez de passar por cima do que vem depois
  return (
    <nav className="flex w-0 min-w-0 flex-1 items-center gap-1.5">
      <div className="flex max-w-[40%] shrink-0 items-center gap-1.5 overflow-x-auto">
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
      </div>
      <div className="@container/links flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
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
      </div>
    </nav>
  )
}

function AbaDeProjeto(p: { nome: string; ativa: boolean; abrir: () => void; fechar: () => void; renomear?: (nome: string) => Promise<unknown> }) {
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
    <div className={cn(PILULA, 'flex max-w-[230px] items-center gap-2 py-[3px] pr-1 pl-3.5', p.ativa ? ATIVA : INATIVA)}>
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
