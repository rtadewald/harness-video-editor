import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { ChipsTipo, useFiltroTipo, useTipos } from '@/components/tipos'
import { HeuristicaDirecao } from '@/referencias/PainelCalibragem'

/** A heurística da direção (SPEC §8.2.1), uma por tipo de vídeo (docs/editor-claude.md, Q33): as regras (do criador e
 *  sugeridas pela IA) e os roteiros de exemplo das referências daquele tipo. */
export default function Heuristica() {
  const tipos = useTipos()
  const [escolhido, setTipo] = useFiltroTipo('heuristica')
  const tipo = escolhido ?? 'reels'
  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      {/* a segunda linha: de qual tipo de vídeo é a heurística (cada tipo tem a sua) */}
      <nav className="flex items-center gap-3 border-b border-line-dark px-4 py-3">
        <ChipsTipo tipos={tipos} atual={tipo} mudar={(t) => setTipo(t ?? 'reels')} semTodos />
      </nav>
      <main className="overflow-y-auto px-8 py-8">
        <HeuristicaDirecao versao={0} tipo={tipo} />
      </main>
    </div>
  )
}
