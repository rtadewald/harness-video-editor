import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { History, Redo2, Undo2 } from 'lucide-react'
import { abrirEditor, abrirPicos, abrirProjeto, emAndamento, formatarDuracao, refazerCortes, urlArquivo, type DadosEditor, type Etapa, type Mensagem, type Palavra, type Picos } from '@/api'
import { Logo } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Chat from '@/editor/Chat'
import { ETAPAS } from '@/editor/etapas'
import { calcularCortes, trechoDaEmenda, type Corte, type Selecao } from '@/editor/cortes'
import LinhaBruto from '@/editor/LinhaBruto'
import Painel from '@/editor/Painel'
import PainelCortes from '@/editor/PainelCortes'
import Preview from '@/editor/Preview'
import Processamento from '@/editor/Processamento'
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
  const [picos, setPicos] = useState<Picos | null>(null)
  const [selecao, setSelecao] = useState<Selecao>(null)
  const [repetir, setRepetir] = useState(false)
  const bruto = dados?.projeto.fontes.find((f) => f.papel === 'bruto')
  const cortes = useMemo(() => (dados && bruto ? calcularCortes(dados.timeline.V1, dados.palavras, bruto.duracao) : []), [dados, bruto])

  useEffect(() => {
    abrirEditor(id).then(setDados).catch((e) => setErro(e.message))
  }, [id])

  useEffect(() => {
    if (dados?.palavras.length && !picos) abrirPicos(id).then(setPicos).catch(() => undefined)
  }, [id, dados?.palavras.length, picos])

  const ouvirEmenda = useCallback((c: Corte) => {
    const { de, ate } = trechoDaEmenda(c)
    player.tocarTrecho(de, ate, { pular: true, loop: repetir })
    setSelecao({ tipo: 'corte', n: c.n })
  }, [player, repetir])
  const ouvirPalavra = useCallback((w: Palavra) => player.tocarTrecho(Math.max(w.inicio - 0.3, 0), w.fim + 0.3, { pular: false }), [player])

  // enquanto o pipeline roda, acompanha o projeto; quando termina, recarrega o editor com o resultado
  const rodando = dados ? emAndamento(dados.projeto) : false
  useEffect(() => {
    if (!rodando) return
    const timer = setInterval(async () => {
      const p = await abrirProjeto(id).catch(() => null)
      if (!p) return
      if (emAndamento(p)) setDados((d) => d && { ...d, projeto: p })
      else setDados(await abrirEditor(id))
    }, 1000)
    return () => clearInterval(timer)
  }, [id, rodando])

  // espaço toca/pausa · ←/→ 0,5 s (Shift 5 s, Alt 10 ms) · E ouve a emenda mais próxima · B alterna resultado/bruto
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea') || e.metaKey || e.ctrlKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.alternar()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const d = (e.altKey ? 0.01 : e.shiftKey ? 5 : 0.5) * (e.key === 'ArrowLeft' ? -1 : 1)
        if (etapa === 'cortes') player.buscarBruto(player.bruto + d)
        else player.buscar(player.tempo + d)
      } else if (etapa === 'cortes' && e.key.toLowerCase() === 'e' && cortes.length) {
        const c = cortes.find((x) => x.fim > player.bruto + 0.05) ?? cortes[cortes.length - 1]
        ouvirEmenda(c)
      } else if (etapa === 'cortes' && e.key.toLowerCase() === 'b') {
        player.setPular(!player.pular)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [player, etapa, cortes, ouvirEmenda])

  if (erro) return <p className="p-12 text-destructive">{erro}</p>
  if (!dados || !seq) return <div className="h-svh bg-deep" />

  const { projeto, timeline } = dados
  if (!bruto) return null
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
          <BotaoFuturo rotulo="Desfazer (fase 3b)"><Undo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Refazer (fase 3b)"><Redo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Versões (fase 3b)"><History /></BotaoFuturo>
        </div>
        <span className="rounded-full bg-yellow px-3 py-1 text-[9px] font-semibold tracking-[0.12em] text-ink">INSERTS · MOTION · LEGENDA SIMULADOS</span>
        <Button variant="coral" size="sm" disabled title="Exportação chega na fase 4" className="h-9 gap-6 px-4">
          Exportar <span className="seta">↗</span>
        </Button>
      </header>

      {dados.palavras.length === 0 ? (
        <Processamento projeto={projeto} aoMudar={(p) => setDados({ ...dados, projeto: p })} />
      ) : (
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

        <div className="grid min-h-0 min-w-0 grid-cols-1 overflow-hidden" style={{ gridTemplateRows: `minmax(0,1fr) ${etapa === 'cortes' ? 300 : 266}px` }}>
          <div className="grid min-h-0 grid-cols-[minmax(220px,1fr)_minmax(140px,0.75fr)] gap-6 px-6 pt-6 pb-4">
            {etapa === 'cortes' ? (
              <PainelCortes
                dados={dados}
                cortes={cortes}
                selecao={selecao}
                selecionar={setSelecao}
                bruto={player.bruto}
                buscarBruto={player.buscarBruto}
                ouvirPalavra={ouvirPalavra}
                ouvirEmenda={ouvirEmenda}
                loop={repetir}
                setLoop={setRepetir}
              />
            ) : (
              <Painel etapa={etapa} dados={dados} seq={seq} tempo={player.tempo} buscar={player.buscar} />
            )}
            <Preview
              videoRef={player.ref}
              src={urlArquivo(projeto.id, bruto.proxy ?? bruto.arquivo)}
              enquadramentoX={projeto.enquadramento.x}
              tempo={player.tempo}
              duracao={seq.duracao}
              tocando={player.tocando}
              alternar={player.alternar}
              buscar={player.buscar}
              bruto={etapa === 'cortes' ? player.bruto : undefined}
              insert={etapa === 'cortes' ? undefined : sob(timeline.V2)}
              motion={etapa === 'cortes' ? undefined : sob(timeline.V3)}
              legenda={etapa === 'cortes' ? undefined : sob(timeline.LEG)?.texto}
            />
          </div>
          {etapa === 'cortes' ? (
            <LinhaBruto
              duracao={bruto.duracao}
              clipes={timeline.V1}
              palavras={dados.palavras}
              cortes={cortes}
              picos={picos?.picos ?? null}
              picosPorSegundo={picos?.por_segundo ?? 200}
              bruto={player.bruto}
              tocando={player.tocando}
              pular={player.pular}
              setPular={player.setPular}
              selecao={selecao}
              selecionar={setSelecao}
              buscarBruto={player.buscarBruto}
              refazendo={rodando}
              aoRefazer={() => refazerCortes(projeto.id).then((p) => setDados({ ...dados, projeto: p }))}
            />
          ) : (
            <Timeline
              seq={seq}
              duracaoBruto={bruto.duracao}
              timeline={timeline}
              palavras={dados.palavras}
              tempo={player.tempo}
              tocando={player.tocando}
              ativa={ETAPAS.find((e) => e.id === etapa)!.trilha}
              buscar={player.buscar}
              refazendo={rodando}
              aoRefazer={() => refazerCortes(projeto.id).then((p) => setDados({ ...dados, projeto: p }))}
            />
          )}
        </div>

        <div className="min-h-0 border-l border-line-dark">
          <Chat projetoId={projeto.id} etapa={etapa} mensagens={projeto.chats[etapa]} aoReceber={receber} />
        </div>
      </div>
      )}
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
