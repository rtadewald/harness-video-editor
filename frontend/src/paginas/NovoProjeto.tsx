import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { criarProjeto, lerConfig, type Config } from '@/api'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type Props = { aberto: boolean; aoFechar: () => void }

/** Os formatos (SPEC §1): só o Reels está ativo; Anúncio e Aula aparecem como "em breve". */
const FORMATOS = [
  { id: 'reels', nome: 'Reels', detalhe: 'vertical, 9:16', ativo: true },
  { id: 'anuncio', nome: 'Anúncio', detalhe: 'em breve', ativo: false },
  { id: 'aula', nome: 'Aula', detalhe: 'em breve', ativo: false },
]

export default function NovoProjeto({ aberto, aoFechar }: Props) {
  const navegar = useNavigate()
  const [progresso, setProgresso] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [config, setConfig] = useState<Config | null>(null)

  useEffect(() => {
    if (aberto) lerConfig().then(setConfig).catch(() => setConfig(null))
  }, [aberto])

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
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <Marca className="mb-3 text-coral" />
          <p className="eyebrow text-[#56625d]">Novo projeto</p>
          <DialogTitle>Do bruto ao Reels.</DialogTitle>
          <DialogDescription>Dê um nome, escolha o formato e suba o vídeo bruto, vertical ou horizontal.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="grid gap-4">
          <Campo rotulo="Nome">
            <Input name="nome" required placeholder="Ex.: Melhor IA para design" autoFocus />
          </Campo>
          <Campo rotulo="Motor de transcrição">
            <select
              name="motor"
              key={config?.motor_padrao}
              defaultValue={config?.motor_padrao}
              className="h-11 w-full rounded-[3px] border border-line bg-white px-3.5 text-[13px] text-ink outline-none focus-visible:border-ink"
            >
              {config &&
                Object.entries(config.motores).map(([vid, m]) => (
                  <option key={vid} value={vid}>
                    {m.nome}
                    {m.chave === false ? ' — sem chave de API' : ''}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo rotulo="Formato">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formato">
              {FORMATOS.map((f) => (
                <label
                  key={f.id}
                  title={f.ativo ? undefined : 'Em breve'}
                  className={cn(
                    'grid gap-0.5 rounded-[3px] border px-3 py-2.5 text-[13px] text-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-cream',
                    f.ativo ? 'cursor-pointer border-line bg-white hover:border-ink' : 'cursor-not-allowed border-line bg-white/50 opacity-50',
                  )}
                >
                  <input type="radio" name="formato" value={f.id} defaultChecked={f.id === 'reels'} disabled={!f.ativo} className="sr-only" />
                  <span className="font-semibold">{f.nome}</span>
                  <span className="text-[11px] opacity-70">{f.detalhe}</span>
                </label>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Vídeo bruto">
            <Input name="bruto" type="file" accept="video/*" required />
          </Campo>

          {enviando && (
            <div className="grid gap-1.5">
              <Progress value={progresso} />
              <span className="text-[11px] text-[#667466]">
                {progresso < 100 ? `Enviando… ${Math.round(progresso)}%` : 'Lendo os vídeos…'}
              </span>
            </div>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando} className="flex-1 justify-between">
              Criar projeto <span className="seta">↗</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>
        {rotulo}
      </Label>
      {children}
    </div>
  )
}
