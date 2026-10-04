import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Abas da tela inicial: Projetos e Referências (vídeos que treinam a Direção visual). */
export default function NavHome() {
  const aba = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', isActive ? 'bg-cream text-ink' : 'text-fog hover:text-cream')
  return (
    <nav className="flex items-center gap-1">
      <NavLink to="/" end className={aba}>
        Projetos
      </NavLink>
      <NavLink to="/referencias" className={aba}>
        Referências
      </NavLink>
    </nav>
  )
}
