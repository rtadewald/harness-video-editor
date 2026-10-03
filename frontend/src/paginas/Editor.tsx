import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { History, Redo2, Undo2 } from 'lucide-react'
import { abrirEditor, formatarDuracao, urlArquivo, type DadosEditor, type Etapa, type Mensagem } from '@/api'
import { Logo } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Chat from '@/editor/Chat'
import { ETAPAS } from '@/editor/etapas'
import Painel from '@/editor/Painel'
import Preview from '@/editor/Preview'
import { montarSequencia } from '@/editor/sequencia'
import Timeline from '@/editor/Timeline'
import { usePlayer } from '@/editor/usePlayer'

export default function Editor() {
  const { id = '' } = useParams()
  const [dados, setDados] = useState<DadosEditor | null>(null)
  const [erro, setErro] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('cortes')
  const seq = useMemo(() => (dados ? montarSequencia(dados.timeline, dados.palavras) : null), [dados])
  const player = usePlayer(seq)

  useEffect(() => {
    abrirEditor(id).then(setDados).catch((e) => setErro(e.message))
  }, [id])

  // espaço toca/pausa; setas andam 0,5 s (com shift, 5 s) — fora de campos de texto
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.alternar()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const d = (e.shiftKey ? 5 : 0.5) * (e.key === 'ArrowLeft' ? -1 : 1)
        player.buscar(player.tempo + d)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [player])

  if (erro) return <p className="p-12 text-destructive">{erro}</p>
  if (!dados || !seq) return <div className="h-svh bg-deep" />

  const { projeto, timeline } = dados
  const bruto = projeto.fontes.find((f) => f.papel === 'bruto')!
  const sob = <T extends { palavra_ini: string; palavra_fim: string }>(itens: T[]) =>
    itens.find((i) => {
      const r = seq.intervalo(i)
      return r && player.tempo >= r.ini && player.tempo < r.fim
    })
  const receber = (novas: Mensagem[]) =>
    setDados({ ...dados, projeto: { ...projeto, chats: { ...projeto.chats, [etapa]: [...projeto.chats[etapa], ...novas] } } })

  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Link to="/" title="Projetos">
          <Logo />
        </Link>
        <span className="h-5 w-px bg-line-dark" />
        <span className="truncate text-[13px] font-semibold">{projeto.nome}</span>

        <div className="ml-auto flex items-center gap-1 text-fog">
          <BotaoFuturo rotulo="Desfazer (fase 3)"><Undo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Refazer (fase 3)"><Redo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Versões (fase 3)"><History /></BotaoFuturo>
        </div>
        <span className="rounded-full bg-yellow px-3 py-1 text-[9px] font-semibold tracking-[0.12em] text-ink">FASE 2 · DADOS SIMULADOS</span>
        <Button variant="coral" size="sm" disabled title="Exportação chega na fase 4" className="h-9 gap-6 px-4">
          Exportar <span className="seta">↗</span>
        </Button>
      </header>

      <div className="grid min-h-0 grid-cols-[clamp(170px,14vw,210px)_minmax(0,1fr)_clamp(290px,25vw,380px)]">
        <nav className="flex min-h-0 flex-col gap-1 border-r border-line-dark px-3 py-6">
          <p className="eyebrow mb-3 ml-3 text-sage">Etapas</p>
          {ETAPAS.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setEtapa(e.id)}
              className={cn(
                'flex items-baseline gap-3 rounded-full px-3 py-2.5 text-left text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-300',
                e.id === etapa ? 'bg-cream text-ink' : 'text-[#dfe7dc] hover:bg-cream/8 hover:text-cream',
              )}
            >
              <b className={cn('text-[9px] tracking-[0.1em] tabular-nums', e.id === etapa ? 'text-[#c4502f]' : 'text-[#9fb3a6]')}>
                {String(i + 1).padStart(2, '0')}
              </b>
              {e.nome}
              {e.id === etapa && <span className="seta ml-auto text-[16px]">↗</span>}
            </button>
          ))}

          <div className="mt-auto grid gap-3 border-t border-line-dark pt-5 text-[11px] text-fog">
            <p className="eyebrow text-sage">Projeto</p>
            <p>
              <span className="block text-cream">{bruto.nome_original}</span>
              {formatarDuracao(bruto.duracao)} · {bruto.largura}×{bruto.altura}
            </p>
            {projeto.briefing.texto && <p className="line-clamp-4 leading-[1.6]">“{projeto.briefing.texto}”</p>}
          </div>
        </nav>

        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_266px] overflow-hidden">
          <div className="grid min-h-0 grid-cols-[minmax(220px,1fr)_minmax(140px,0.75fr)] gap-6 px-6 pt-6 pb-4">
            <Painel etapa={etapa} dados={dados} seq={seq} tempo={player.tempo} buscar={player.buscar} />
            <Preview
              videoRef={player.ref}
              src={urlArquivo(projeto.id, bruto.arquivo)}
              enquadramentoX={projeto.enquadramento.x}
              tempo={player.tempo}
              duracao={seq.duracao}
              tocando={player.tocando}
              alternar={player.alternar}
              buscar={player.buscar}
              insert={sob(timeline.V2)}
              motion={sob(timeline.V3)}
              legenda={sob(timeline.LEG)?.texto}
            />
          </div>
          <Timeline
            seq={seq}
            duracaoBruto={bruto.duracao}
            timeline={timeline}
            palavras={dados.palavras}
            tempo={player.tempo}
            tocando={player.tocando}
            ativa={ETAPAS.find((e) => e.id === etapa)!.trilha}
            buscar={player.buscar}
          />
        </div>

        <div className="min-h-0 border-l border-line-dark">
          <Chat projetoId={projeto.id} etapa={etapa} mensagens={projeto.chats[etapa]} aoReceber={receber} />
        </div>
      </div>
    </div>
  )
}

function BotaoFuturo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <button disabled title={rotulo} aria-label={rotulo} className="grid size-8 place-items-center rounded-full opacity-40 [&_svg]:size-4">
      {children}
    </button>
  )
}
