import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { criarProjeto, lerConfig, type Config } from '@/api'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useTipos } from '@/components/tipos'

type Props = { aberto: boolean; aoFechar: () => void }

export default function NovoProjeto({ aberto, aoFechar }: Props) {
  const navegar = useNavigate()
  // o tipo de vídeo (das Configurações): a direção usa a Heurística e as referências dele
  const tipos = useTipos()
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
          <Campo rotulo="Tipo">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de vídeo">
              {tipos.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-cream"
                >
                  <input type="radio" name="formato" value={t.id} defaultChecked={t.id === 'reels'} className="sr-only" />
                  {t.emoji && <span aria-hidden>{t.emoji}</span>}
                  {t.nome}
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
