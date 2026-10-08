import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fecharAba, useAbasProjetos } from './abasProjetos'

/** A barra de cima de todas as telas, nas pílulas `.tab` do Otto: primeiro os projetos abertos como abas (× fecha; dois
 *  cliques no nome da aba ativa renomeiam, quando a tela permite), depois Projetos, Banco (vídeos e imagens dos inserts),
 *  Referências (galeria dos planos), Calibragem (vídeos que treinam a Direção visual) e a Heurística da direção. */
const PILULA = 'shrink-0 rounded-full border text-[12px] font-semibold tracking-[-0.01em] transition-colors duration-300'
const ATIVA = 'border-cream bg-cream text-ink'
const INATIVA = 'border-line-dark text-fog hover:border-cream/50 hover:text-cream'
export default function NavHome({ renomear }: { renomear?: (id: string, nome: string) => Promise<unknown> }) {
  const abas = useAbasProjetos()
  const local = useLocation()
  const ir = useNavigate()
  const aba = ({ isActive }: { isActive: boolean }) => cn(PILULA, 'px-4 py-[7px]', isActive ? ATIVA : INATIVA)
  return (
    <nav className="flex min-w-0 items-center gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
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
      {abas.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-line-dark" />}
      <NavLink to="/" end className={aba}>
        Projetos
      </NavLink>
      <NavLink to="/banco" className={aba}>
        Banco
      </NavLink>
      <span className="mx-1.5 h-5 w-px shrink-0 bg-line-dark" />
      <NavLink to="/referencias" className={aba}>
        Referências
      </NavLink>
      <NavLink to="/presets" className={aba}>
        Presets
      </NavLink>
      <NavLink to="/calibragem" end className={aba}>
        Calibragem
      </NavLink>
      <NavLink to="/heuristica" className={aba}>
        Heurística da direção
      </NavLink>
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
