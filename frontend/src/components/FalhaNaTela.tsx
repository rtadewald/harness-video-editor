import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'

/** Um erro inesperado numa tela (um efeito que lançou, um dado fora do esperado) não deixa a página em branco: mostra o
 *  que houve e o caminho de volta. O que estava gravado no servidor continua lá; recarregar abre a tela de novo. Trocar
 *  de endereço tenta a tela nova (ela não herda o erro). */
export default function FalhaNaTela({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Guarda chave={pathname}>{children}</Guarda>
}

class Guarda extends Component<{ chave: string; children: ReactNode }, { erro: Error | null; chave: string }> {
  state = { erro: null as Error | null, chave: this.props.chave }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  static getDerivedStateFromProps(props: { chave: string }, state: { erro: Error | null; chave: string }) {
    return props.chave !== state.chave ? { erro: null, chave: props.chave } : null
  }

  componentDidCatch(erro: Error) {
    console.error('Erro na tela:', erro)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children
    return (
      <div className="grid h-svh place-items-center bg-deep px-6 text-cream">
        <div className="w-full max-w-[460px]">
          <Marca className="mb-6 size-10 text-coral" />
          <p className="eyebrow text-sage">Algo falhou</p>
          <h2 className="titulo mt-3 text-[38px]">Esta tela parou por um erro.</h2>
          <p className="mt-4 text-[13px] leading-[1.6] text-fog">
            O que já estava salvo continua salvo. Recarregue para abrir a tela de novo.
          </p>
          <p className="mt-3 rounded-[4px] bg-ink px-3 py-2 font-mono text-[11px] leading-[1.5] break-words text-fog/80">{erro.message}</p>
          <div className="mt-8 grid gap-3">
            <Button variant="cream" className="justify-between" onClick={() => window.location.reload()}>
              Recarregar <span className="seta">↗</span>
            </Button>
            <Button variant="pill" className="justify-between text-fog" onClick={() => window.location.assign('/')}>
              Voltar aos projetos
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
