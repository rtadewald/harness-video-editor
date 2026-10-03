import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { abrirProjeto, formatarDuracao, urlArquivo, type Fonte, type Projeto as TProjeto } from '@/api'

/** Fase 1: só mostra o que foi subido. O editor (etapas, timeline, chat) chega na fase 2. */
export default function Projeto() {
  const { id = '' } = useParams()
  const [projeto, setProjeto] = useState<TProjeto | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    abrirProjeto(id).then(setProjeto).catch((e) => setErro(e.message))
  }, [id])

  if (erro) return <p className="p-12 text-destructive">{erro}</p>
  if (!projeto) return null

  const bruto = projeto.fontes.find((f) => f.papel === 'bruto')!
  const apoios = projeto.fontes.filter((f) => f.papel === 'apoio')

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projetos
      </Link>
      <h1 className="mb-8 text-2xl font-semibold">{projeto.nome}</h1>

      <div className="grid gap-8 md:grid-cols-[minmax(0,320px)_1fr]">
        <video
          src={urlArquivo(projeto.id, bruto.arquivo)}
          controls
          className="w-full rounded-xl border bg-black"
          style={{ aspectRatio: `${bruto.largura} / ${bruto.altura}` }}
        />

        <div className="grid content-start gap-6">
          <Secao titulo="Bruto">
            <InfoFonte fonte={bruto} />
          </Secao>
          <Secao titulo="Briefing">
            {projeto.briefing.texto ? (
              <p className="whitespace-pre-wrap text-sm">{projeto.briefing.texto}</p>
            ) : (
              !projeto.briefing.audio && <Vazio>Sem briefing em texto.</Vazio>
            )}
            {projeto.briefing.audio && (
              <audio src={urlArquivo(projeto.id, projeto.briefing.audio)} controls className="mt-2 w-full" />
            )}
          </Secao>
          <Secao titulo={`Vídeos de apoio (${apoios.length})`}>
            {apoios.length ? apoios.map((f) => <InfoFonte key={f.id} fonte={f} />) : <Vazio>Nenhum.</Vazio>}
          </Secao>
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            O editor (etapas, timeline e chat) chega na fase 2.
          </p>
        </div>
      </div>
    </main>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

function InfoFonte({ fonte }: { fonte: Fonte }) {
  return (
    <div className="text-sm">
      <span className="font-medium">{fonte.nome_original}</span>{' '}
      <span className="text-muted-foreground">
        · {formatarDuracao(fonte.duracao)} · {fonte.largura}×{fonte.altura}
        {!fonte.tem_audio && ' · sem áudio'}
      </span>
    </div>
  )
}

const Vazio = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
)
