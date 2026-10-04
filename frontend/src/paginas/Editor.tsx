import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { History, Pencil, Redo2, RotateCcw, Settings, Undo2 } from 'lucide-react'
import { abrirEditor, abrirPicos, abrirProjeto, abrirTranscricao, ajustarClipe, ativarTranscricao, cortarFaixa, emAndamento, formatarDuracao, motoresRodando, recalcularCortes, refazerCortes, renomearProjeto, restaurarClipe, rodarMotor, urlArquivo, type DadosEditor, type Etapa, type Mensagem, type Palavra, type Picos, type TranscricaoCompleta } from '@/api'
import { Logo } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Chat from '@/editor/Chat'
import { ETAPAS } from '@/editor/etapas'
import { calcularCortes, trechoDaEmenda, type Corte, type Selecao } from '@/editor/cortes'
import LinhaVertical from '@/editor/LinhaVertical'
import Painel from '@/editor/Painel'
import { Detalhe } from '@/editor/PainelCortes'
import Preview from '@/editor/Preview'
import Processamento from '@/editor/Processamento'
import Configuracoes from '@/paginas/Configuracoes'
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
  const [comparar, setComparar] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const [comparacao, setComparacao] = useState<TranscricaoCompleta | null>(null)
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
  const recarregar = useCallback(async () => setDados(await abrirEditor(id)), [id])
  const ajustar = useCallback(
    async (cid: string, lado: 'inicio' | 'fim', t: number) => {
      try {
        await ajustarClipe(id, cid, lado, t)
        await recarregar()
      } catch (e) {
        window.alert((e as Error).message)
      }
    },
    [id, recarregar],
  )
  /** Corta um intervalo do bruto (manter=false) ou o devolve ao vídeo (manter=true). */
  const alterarFaixa = useCallback(
    async (ini: number, fim: number, manter: boolean) => {
      try {
        await cortarFaixa(id, ini, fim, manter)
        await recarregar()
      } catch (e) {
        window.alert((e as Error).message)
      }
    },
    [id, recarregar],
  )
  const restaurar = useCallback(
    async (cid: string) => {
      try {
        await restaurarClipe(id, cid)
        await recarregar()
      } catch (e) {
        window.alert((e as Error).message)
      }
    },
    [id, recarregar],
  )
  const ouvirPalavra = useCallback((w: Palavra) => player.tocarTrecho(Math.max(w.inicio - 0.3, 0), w.fim + 0.3, { pular: false }), [player])

  // trocar a transcrição vista; se for de outro texto e ainda sem cortes, a IA os faz (a tela mostra o processamento)
  const aoAtivar = useCallback(
    async (vid: string) => {
      try {
        await ativarTranscricao(id, vid)
        setComparar((c) => (c === vid ? null : c))
        await recarregar()
      } catch (e) {
        window.alert((e as Error).message)
      }
    },
    [id, recarregar],
  )
  const tentarMotor = useCallback(
    async (vid: string) => {
      const p = await rodarMotor(id, vid).catch((e) => void window.alert((e as Error).message))
      if (p) setDados((d) => d && { ...d, projeto: p })
    },
    [id],
  )

  // enquanto o pipeline roda (ou os motores extras trabalham), acompanha o projeto; ao terminar o principal, recarrega o editor
  const rodando = dados ? emAndamento(dados.projeto) : false
  const extras = dados ? motoresRodando(dados.projeto) : false
  useEffect(() => {
    if (!rodando && !extras) return
    const timer = setInterval(async () => {
      const p = await abrirProjeto(id).catch(() => null)
      if (!p) return
      if (rodando && !emAndamento(p)) setDados(await abrirEditor(id))
      else setDados((d) => d && { ...d, projeto: p })
    }, 1000)
    return () => clearInterval(timer)
  }, [id, rodando, extras])

  // a transcrição escolhida para comparar (as barras amarelas)
  useEffect(() => {
    if (!comparar) return void setComparacao(null)
    let vivo = true
    abrirTranscricao(id, comparar)
      .then((c) => vivo && setComparacao(c))
      .catch(() => vivo && setComparar(null))
    return () => {
      vivo = false
    }
  }, [id, comparar])

  // espaço toca/pausa · ←/→ 0,5 s (Shift 5 s, Alt 10 ms) · E ouve a emenda mais próxima · B alterna resultado/bruto
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [data-alca]') || e.metaKey || e.ctrlKey) return
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

  const vertical = etapa === 'cortes'

  if (erro) return <p className="p-12 text-destructive">{erro}</p>
  if (!dados || !seq) return <div className="h-svh bg-deep" />

  const { projeto, timeline } = dados
  if (!bruto) return null
  const sob = <T extends { palavra_ini: string; palavra_fim: string }>(itens: T[]) =>
    itens.find((i) => {
      const r = seq.intervalo(i)
      return r && player.tempo >= r.ini && player.tempo < r.fim
    })
  const refazerComIA = () => {
    const n = timeline.V1.filter((c) => c.auto).length
    if (n && !window.confirm(`Refazer os cortes com a IA descarta ${n} trecho(s) com ajuste manual. Continuar?`)) return
    void refazerCortes(projeto.id).then((p) => setDados({ ...dados, projeto: p })).catch((e) => window.alert((e as Error).message))
  }
  const receber = (novas: Mensagem[]) =>
    setDados({ ...dados, projeto: { ...projeto, chats: { ...projeto.chats, [etapa]: [...projeto.chats[etapa], ...novas] } } })

  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Link to="/" title="Projetos">
          <Logo />
        </Link>
        <span className="h-5 w-px bg-line-dark" />
        <NomeDoProjeto nome={projeto.nome} salvar={(nome) => renomearProjeto(projeto.id, nome).then((p) => setDados({ ...dados, projeto: p }))} />

        <div className="ml-auto flex items-center gap-1 text-fog">
          <BotaoFuturo rotulo="Desfazer (fase 3b)"><Undo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Refazer (fase 3b)"><Redo2 /></BotaoFuturo>
          <BotaoFuturo rotulo="Versões (fase 3b)"><History /></BotaoFuturo>
          <button onClick={() => setConfigAberta(true)} aria-label="Configurações" title="Configurações" className="grid size-8 place-items-center rounded-full hover:bg-cream/10 hover:text-cream [&_svg]:size-4">
            <Settings />
          </button>
          {vertical && (
            <button
              onClick={refazerComIA}
              disabled={rodando}
              title="Pede à IA uma nova seleção do texto final (não retranscreve). Mantém as palavras que você ligou ou desligou à mão."
              className="ml-2 flex h-8 items-center gap-2 rounded-full border border-yellow/70 bg-yellow/10 px-3.5 text-[11px] font-semibold text-yellow transition-colors hover:bg-yellow hover:text-ink disabled:opacity-60"
            >
              <RotateCcw className={cn('size-3.5', rodando && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
              {rodando ? 'Refazendo…' : 'Refazer cortes com IA'}
            </button>
          )}
        </div>
        <span className="rounded-full bg-yellow px-3 py-1 text-[9px] font-semibold tracking-[0.12em] text-ink">DIREÇÃO · INSERTS · MOTION · LEGENDA SIMULADOS</span>
        <Button variant="coral" size="sm" disabled title="Exportação chega na fase 4" className="h-9 gap-6 px-4">
          Exportar <span className="seta">↗</span>
        </Button>
      </header>

      {dados.palavras.length === 0 ? (
        <Processamento projeto={projeto} aoMudar={(p) => setDados({ ...dados, projeto: p })} />
      ) : (
      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: vertical
            ? 'clamp(170px,13vw,200px) clamp(460px,46vw,820px) minmax(0,1fr)'
            : 'clamp(170px,14vw,210px) minmax(0,1fr) clamp(290px,25vw,380px)',
        }}
      >
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

        {vertical && (
          <LinhaVertical
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
            silencios={dados.silencios}
            transcricoes={projeto.transcricoes}
            ativa={projeto.transcricao_ativa}
            aoAtivar={aoAtivar}
            comparar={comparar}
            setComparar={setComparar}
            comparacao={comparacao}
            tentarMotor={tentarMotor}
            ajustar={ajustar}
            editarFaixa={alterarFaixa}
            aoRecalcular={() => {
              const n = timeline.V1.filter((c) => c.auto).length
              if (n && !window.confirm(`Recalcular as margens descarta ${n} trecho(s) com ajuste manual de borda. Continuar?`)) return
              void recalcularCortes(projeto.id).then(recarregar).catch((e) => window.alert((e as Error).message))
            }}
          />
        )}

        {vertical ? (
          <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <div className="min-h-0 px-6 pt-6 pb-3">
              <Preview
                videoRef={player.ref}
                src={urlArquivo(projeto.id, bruto.proxy ?? bruto.arquivo)}
                enquadramentoX={projeto.enquadramento.x}
                tempo={player.tempo}
                duracao={seq.duracao}
                tocando={player.tocando}
                alternar={player.alternar}
                velocidade={player.velocidade}
                setVelocidade={player.setVelocidade}
                buscar={player.buscar}
                bruto={player.bruto}
              />
            </div>
            <div className="max-h-[38vh] overflow-y-auto px-6 pb-4 text-cream">
              <Detalhe dados={dados} cortes={cortes} selecao={selecao} ouvirPalavra={ouvirPalavra} ouvirEmenda={ouvirEmenda} loop={repetir} setLoop={setRepetir} restaurar={restaurar} devolver={(ini, fim) => alterarFaixa(ini, fim, true)} comparacao={comparacao} />
            </div>
          </div>
        ) : (
        <div className="grid min-h-0 min-w-0 grid-cols-1 overflow-hidden" style={{ gridTemplateRows: `minmax(0,1fr) 266px` }}>
          <div className="grid min-h-0 grid-cols-[minmax(220px,1fr)_minmax(140px,0.75fr)] gap-6 px-6 pt-6 pb-4">
            <Painel etapa={etapa} dados={dados} seq={seq} tempo={player.tempo} buscar={player.buscar} />
            <Preview
              videoRef={player.ref}
              src={urlArquivo(projeto.id, bruto.proxy ?? bruto.arquivo)}
              enquadramentoX={projeto.enquadramento.x}
              tempo={player.tempo}
              duracao={seq.duracao}
              tocando={player.tocando}
              alternar={player.alternar}
                velocidade={player.velocidade}
                setVelocidade={player.setVelocidade}
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
            refazendo={rodando}
            aoRefazer={() => refazerCortes(projeto.id).then((p) => setDados({ ...dados, projeto: p }))}
          />
        </div>
        )}

        {!vertical && (
          <div className="min-h-0 border-l border-line-dark">
            <Chat projetoId={projeto.id} etapa={etapa} mensagens={projeto.chats[etapa]} aoReceber={receber} />
          </div>
        )}
      </div>
      )}
      <Configuracoes aberto={configAberta} aoFechar={() => setConfigAberta(false)} />
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

/** Nome do projeto na barra: clique para renomear (Enter ou sair do campo salva, Esc cancela). */
function NomeDoProjeto({ nome, salvar }: { nome: string; salvar: (nome: string) => Promise<unknown> }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome)
  const [erro, setErro] = useState('')

  async function confirmar() {
    const novo = valor.trim()
    setEditando(false)
    if (!novo || novo === nome) return
    try {
      await salvar(novo)
      setErro('')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  if (editando) {
    return (
      <input
        autoFocus
        data-alca
        value={valor}
        maxLength={120}
        onChange={(e) => setValor(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => void confirmar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValor(nome)
            setEditando(false)
          }
        }}
        aria-label="Nome do projeto"
        className="h-8 w-64 rounded-[3px] border border-cream/40 bg-deep px-2.5 text-[13px] font-semibold text-cream outline-none focus-visible:border-yellow"
      />
    )
  }
  return (
    <button
      onClick={() => {
        setValor(nome)
        setEditando(true)
      }}
      title={erro || 'Clique para renomear o projeto'}
      className={cn('flex h-8 max-w-[320px] items-center gap-2 truncate rounded-[3px] px-2 text-[13px] font-semibold hover:bg-cream/10', erro && 'text-coral')}
    >
      <span className="truncate">{nome}</span>
      <Pencil className="size-3 shrink-0 text-fog" />
    </button>
  )
}
