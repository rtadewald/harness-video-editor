import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { criarProjeto } from '@/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'

type Props = { aberto: boolean; aoFechar: () => void }

export default function NovoProjeto({ aberto, aoFechar }: Props) {
  const navegar = useNavigate()
  const [progresso, setProgresso] = useState<number | null>(null)
  const [erro, setErro] = useState('')

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro('')
    setProgresso(0)
    try {
      const projeto = await criarProjeto(new FormData(e.currentTarget), setProgresso)
      navegar(`/p/${projeto.id}`)
    } catch (err) {
      setErro((err as Error).message)
      setProgresso(null)
    }
  }

  const enviando = progresso !== null

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !enviando && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>Suba o bruto, o briefing e os vídeos de apoio.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="grid gap-4">
          <Campo rotulo="Nome">
            <Input name="nome" required placeholder="Ex.: Melhor IA para design" autoFocus />
          </Campo>
          <Campo rotulo="Vídeo bruto">
            <Input name="bruto" type="file" accept="video/*" required />
          </Campo>
          <Campo rotulo="Briefing (texto)" opcional>
            <Textarea name="briefing_texto" rows={3} placeholder="O que esse vídeo precisa passar, pedidos específicos…" />
          </Campo>
          <Campo rotulo="Briefing (áudio)" opcional>
            <Input name="briefing_audio" type="file" accept="audio/*,video/*" />
          </Campo>
          <Campo rotulo="Vídeos de apoio" opcional>
            <Input name="apoios" type="file" accept="video/*" multiple />
          </Campo>

          {enviando && (
            <div className="grid gap-1.5">
              <Progress value={progresso} />
              <span className="text-xs text-muted-foreground">
                {progresso < 100 ? `Enviando… ${Math.round(progresso)}%` : 'Lendo os vídeos…'}
              </span>
            </div>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ rotulo, opcional, children }: { rotulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {rotulo} {opcional && <span className="font-normal text-muted-foreground">(opcional)</span>}
      </Label>
      {children}
    </div>
  )
}
