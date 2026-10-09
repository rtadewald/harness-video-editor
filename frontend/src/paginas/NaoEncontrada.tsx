import { useNavigate } from 'react-router-dom'
import { fecharAba } from '@/components/abasProjetos'
import { Logo, Marca } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'

/** Um endereço que não leva a nada (uma rota que não existe, um projeto apagado): a barra de cima de sempre e o caminho
 *  de volta. Num projeto, `projetoId` oferece fechar a aba dele, que ficou lembrada neste navegador. */
export default function NaoEncontrada({ titulo = 'Página não encontrada.', texto, projetoId }: { titulo?: string; texto?: string; projetoId?: string }) {
  const ir = useNavigate()
  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <main className="grid place-items-center px-6">
        <div className="w-full max-w-[460px]">
          <Marca className="mb-6 size-10 text-coral" />
          <p className="eyebrow text-sage">Nada aqui</p>
          <h2 className="titulo mt-3 text-[38px]">{titulo}</h2>
          {texto && <p className="mt-4 text-[13px] leading-[1.6] text-fog">{texto}</p>}
          <div className="mt-8 grid gap-3">
            <Button variant="cream" className="justify-between" onClick={() => ir('/')}>
              Voltar aos projetos <span className="seta">↗</span>
            </Button>
            {projetoId && (
              <Button
                variant="pill"
                className="justify-between text-fog"
                onClick={() => {
                  fecharAba(projetoId)
                  ir('/')
                }}
              >
                Fechar a aba deste projeto
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
