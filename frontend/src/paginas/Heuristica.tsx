import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { HeuristicaDirecao } from '@/referencias/PainelCalibragem'

/** A heurística da direção (SPEC §8.2.1): as regras (do criador e sugeridas pela IA, com a seção de captura dos inserts)
 *  e os roteiros de exemplo das referências, com a marcação de cada plano e como cada insert foi capturado. */
export default function Heuristica() {
  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <main className="overflow-y-auto px-8 py-8">
        <HeuristicaDirecao versao={0} />
      </main>
    </div>
  )
}
