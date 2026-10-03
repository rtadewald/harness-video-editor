import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, Plus } from 'lucide-react'
import { formatarDuracao, listarProjetos, type ResumoProjeto } from '@/api'
import { Button } from '@/components/ui/button'
import NovoProjeto from './NovoProjeto'

export default function Projetos() {
  const [projetos, setProjetos] = useState<ResumoProjeto[] | null>(null)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    listarProjetos().then(setProjetos).catch((e) => setErro(e.message))
  }, [])

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <p className="text-sm text-muted-foreground">Harness Video Editor</p>
        </div>
        <Button onClick={() => setCriando(true)}>
          <Plus /> Novo projeto
        </Button>
      </header>

      {erro && <p className="text-destructive">{erro}</p>}
      {projetos?.length === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Nenhum projeto ainda. Crie o primeiro subindo um vídeo bruto.
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {projetos?.map((p) => (
          <li key={p.id}>
            <Link
              to={`/p/${p.id}`}
              className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent"
            >
              <Clapperboard className="size-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                  {formatarDuracao(p.duracao)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <NovoProjeto aberto={criando} aoFechar={() => setCriando(false)} />
    </main>
  )
}
