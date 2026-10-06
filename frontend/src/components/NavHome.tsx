import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Abas da tela inicial: Projetos, Banco (vídeos e imagens dos inserts), Referências (galeria dos planos identificados),
 *  Calibragem (vídeos que treinam a Direção visual) e a Heurística da direção (regras + roteiros de exemplo). */
export default function NavHome() {
  const aba = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', isActive ? 'bg-cream text-ink' : 'text-fog hover:text-cream')
  return (
    <nav className="flex items-center gap-1">
      <NavLink to="/" end className={aba}>
        Projetos
      </NavLink>
      <NavLink to="/banco" className={aba}>
        Banco
      </NavLink>
      <NavLink to="/referencias" className={aba}>
        Referências
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
