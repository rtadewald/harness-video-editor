import { useEffect, useState } from 'react'
import { enviar, json } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Area = { area: string; nome: string; texto: string; atualizado: string }
const listar = () => fetch('/api/aprendizados').then(json<Area[]>)
const salvar = (area: string, texto: string) => enviar<Area>('PUT', `/api/aprendizados/${area}`, { texto })

/** `/aprendizados`: o que o Claude aprendeu editando, um Markdown por área (docs/editor-claude.md §7, E9; Q17, Q22), na
 *  biblioteca (`biblioteca/aprendizados/`, fora do git: cada pessoa evolui os seus). Ele lê o da área antes de cada etapa; na aprovação de
 *  um vídeo, propõe novos e só grava o que você confirma. Aqui você lê e corrige à mão. */
export default function Aprendizados() {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')
  useEffect(() => {
    void listar().then((l) => {
      setAreas(l)
      if (l[0]) {
        setAberta(l[0].area)
        setTexto(l[0].texto)
      }
    })
  }, [])
  const atual = areas?.find((a) => a.area === aberta)
  const mudou = !!atual && texto !== atual.texto
  const abrir = (a: Area) => {
    if (mudou && !window.confirm(`Descartar o que você mudou em “${atual!.nome}”?`)) return
    setAberta(a.area)
    setTexto(a.texto)
    setEstado('')
  }
  const gravar = async () => {
    if (!atual) return
    try {
      const a = await salvar(atual.area, texto)
      setAreas((l) => l && l.map((x) => (x.area === a.area ? a : x)))
      setTexto(a.texto)
      setEstado('✓ Salvo na skill')
    } catch (e) {
      setEstado((e as Error).message)
    }
  }
  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <main className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)]">
        <nav className="grid content-start gap-1 overflow-y-auto border-r border-line-dark px-3 py-6">
          <p className="eyebrow mb-2 ml-3 text-sage">Aprendizados</p>
          {areas?.map((a) => (
            <button
              key={a.area}
              onClick={() => abrir(a)}
              className={cn('rounded-full px-3 py-2 text-left text-[13px] font-semibold', a.area === aberta ? 'bg-cream text-ink' : 'text-[#dfe7dc] hover:bg-cream/8')}
            >
              {a.nome}
            </button>
          ))}
          {areas?.length === 0 && <p className="px-3 text-[12px] text-fog">Nenhum ainda.</p>}
        </nav>
        <section className="flex min-h-0 flex-col gap-3 px-8 py-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{atual?.nome ?? '—'}</h1>
              <p className="text-[12px] text-fog">
                <code className="text-cream/80">biblioteca/aprendizados/{atual?.area}.md</code>
                {atual && ` · mudou em ${new Date(atual.atualizado).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
            <span className="ml-auto text-[12px] text-fog">{mudou ? 'Não salvo' : estado}</span>
            <Button variant="coral" size="sm" onClick={() => void gravar()} disabled={!mudou}>
              Salvar
            </Button>
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                void gravar()
              }
            }}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-[6px] border border-line-dark bg-deeper px-4 py-3 font-mono text-[12.5px] leading-[1.7] text-cream outline-none focus:border-cream/50"
          />
        </section>
      </main>
    </div>
  )
}
