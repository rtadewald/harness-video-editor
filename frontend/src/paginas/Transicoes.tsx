import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { CartaoEmConstrucao } from '@/editor/EmConstrucao'

/** A página Transições (SPEC §8.8, a P2): por par de categorias (de onde sai, para onde vai), a referência e a recriação
 *  lado a lado, aprovar, as 2 favoritas de cada par em cima e "Outras transições" embaixo, como os presets. Por ora, em
 *  construção. */
export default function Transicoes() {
  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <main className="overflow-y-auto px-6 py-6">
        <div className="max-w-[640px]">
          <CartaoEmConstrucao
            resumo={{
              fase: 'P2',
              titulo: 'Transições entre planos',
              frase: 'Cada tipo de transição é o par exato de categorias: o plano que sai e o que entra (por exemplo, Full ator → Tela dividida).',
              itens: [
                'O Claude analisa cada corte das referências, com o som, e recria o efeito à mão: corte seco, brilho, zoom de impacto, desfoque, deslize.',
                'Aqui, por par: a referência e a recriação lado a lado, para aprovar.',
                'As 2 favoritas de cada par em cima e "Outras transições" embaixo; a 1ª favorita entra sozinha em cada corte do vídeo.',
              ],
              doc: 'docs/transicoes.md',
            }}
          />
        </div>
      </main>
    </div>
  )
}
