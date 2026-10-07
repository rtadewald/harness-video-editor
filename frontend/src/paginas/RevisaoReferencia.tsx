import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Minus, Pause, Play, Plus, Scissors, Undo2 } from 'lucide-react'
import { abrirRevisao, marcarRevisada, reanalisarReferencia, salvarDirecao, urlArquivoReferencia, type ItemRef, type Revisao } from '@/api'
import { Logo } from '@/components/Marca'
import { cn } from '@/lib/utils'
import { dividirPlano, editar, excluir, moverBorda, moverElemento, novoElemento, planosDe } from '@/referencias/edicao'
import LinhaDirecao, { type Arrasto } from '@/referencias/LinhaDirecao'
import { Ajuda, Botao, Detalhe, fmt } from '@/referencias/Detalhe'
import { useAtalhoZoom } from '@/editor/useAtalhoZoom'

type Salvamento = 'salvo' | 'salvando' | 'pendente' | { erro: string }

/** Revisão de uma referência (SPEC §8.2.1): o vídeo no centro, a timeline vertical com planos e elementos à esquerda
 *  e o detalhe editável à direita. Cada mudança é salva sozinha. */
export default function RevisaoReferencia() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const [dados, setDados] = useState<Revisao | null>(null)
  const [erroCarga, setErroCarga] = useState('')
  const [itens, setItens] = useState<ItemRef[]>([])
  const [historico, setHistorico] = useState<ItemRef[][]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [salvamento, setSalvamento] = useState<Salvamento>('salvo')
  const [px, setPx] = useState(60)
  useAtalhoZoom(() => setPx((v) => Math.min(v * 1.4, 600)), () => setPx((v) => Math.max(v / 1.4, 8)))
  const [tempo, setTempo] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const video = useRef<HTMLVideoElement>(null)
  const pararEm = useRef<number | null>(null)
  const itensRef = useRef<ItemRef[]>([])
  itensRef.current = itens
  const salvos = useRef<ItemRef[] | null>(null) // o que o servidor tem: não precisa salvar de novo

  useEffect(() => {
    abrirRevisao(id)
      .then((d) => {
        salvos.current = d.itens
        setDados(d)
        setItens(d.itens)
      })
      .catch((e) => setErroCarga(e.message))
  }, [id])

  const nomes = useMemo(() => ({ ...dados?.categorias.planos, ...dados?.categorias.elementos }), [dados])
  const duracao = dados?.referencia.video.duracao ?? 0

  // salva sozinho, um pouco depois da última mudança
  useEffect(() => {
    if (!dados || itens === salvos.current) return
    setSalvamento('pendente')
    const t = setTimeout(async () => {
      const enviado = itens
      setSalvamento('salvando')
      try {
        const r = await salvarDirecao(id, enviado)
        if (itensRef.current !== enviado) return // mudou enquanto salvava: o próximo save leva a versão nova
        // aplica o que o servidor completou (âncoras nas palavras, miniaturas) sem disparar outro save
        salvos.current = r.itens
        itensRef.current = r.itens
        setItens(r.itens)
        setSalvamento('salvo')
      } catch (e) {
        setSalvamento({ erro: (e as Error).message })
      }
    }, 700)
    return () => clearTimeout(t)
  }, [itens]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Aplica uma operação de edição; `guardar` põe o estado anterior na pilha do desfazer. */
  const mudar = useCallback((f: (i: ItemRef[]) => ItemRef[], guardar = true) => {
    const atuais = itensRef.current
    const novos = f(atuais)
    if (novos === atuais) return
    if (guardar) setHistorico((h) => [...h.slice(-99), atuais])
    itensRef.current = novos
    setItens(novos)
  }, [])
  const desfazer = useCallback(() => {
    if (!historico.length) return
    const anterior = historico[historico.length - 1]
    setHistorico(historico.slice(0, -1))
    itensRef.current = anterior
    setItens(anterior)
  }, [historico])

  // relógio do vídeo
  useEffect(() => {
    const v = video.current
    if (!v) return
    let raf = 0
    const tique = () => {
      setTempo(v.currentTime)
      if (pararEm.current != null && v.currentTime >= pararEm.current) {
        v.pause()
        pararEm.current = null
      }
      raf = requestAnimationFrame(tique)
    }
    raf = requestAnimationFrame(tique)
    const tocar = () => setTocando(true)
    const parar = () => setTocando(false)
    v.addEventListener('play', tocar)
    v.addEventListener('pause', parar)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', tocar)
      v.removeEventListener('pause', parar)
    }
  }, [dados])
  useEffect(() => {
    if (video.current) video.current.playbackRate = velocidade
  }, [velocidade])

  const buscar = useCallback((t: number) => {
    if (video.current) video.current.currentTime = t
    setTempo(t)
  }, [])
  const alternar = useCallback(() => {
    const v = video.current
    if (!v) return
    pararEm.current = null
    if (v.paused) void v.play()
    else v.pause()
  }, [])
  const verTrecho = (i: ItemRef) => {
    const v = video.current
    if (!v) return
    v.currentTime = i.inicio
    pararEm.current = i.fim
    void v.play()
  }

  const dividir = useCallback(() => {
    const r = dividirPlano(itensRef.current, tempo)
    if (!r.novo) return
    mudar(() => r.itens)
    setSelecionado(r.novo)
  }, [mudar, tempo])
  const adicionarElemento = useCallback(() => {
    const r = novoElemento(itensRef.current, tempo, duracao)
    mudar(() => r.itens)
    setSelecionado(r.novo)
  }, [mudar, tempo, duracao])
  const apagar = useCallback(
    (alvo: string) => {
      mudar((atuais) => excluir(atuais, alvo))
      setSelecionado(null)
    },
    [mudar],
  )

  // atalhos (fora de campos de texto)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (alvo.closest('input, textarea, select')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        desfazer()
      } else if (e.key === ' ') {
        e.preventDefault()
        alternar()
      } else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) dividir()
      else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) adicionarElemento()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selecionado) apagar(selecionado)
      else if (e.key === 'ArrowLeft') buscar(Math.max(tempo - (e.shiftKey ? 1 : 0.1), 0))
      else if (e.key === 'ArrowRight') buscar(Math.min(tempo + (e.shiftKey ? 1 : 0.1), duracao))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [desfazer, alternar, dividir, adicionarElemento, apagar, selecionado, buscar, tempo, duracao])

  // o detalhe segue a cabeça de reprodução: ao entrar noutro plano (tocando ou navegando), mostra esse plano.
  // Não troca enquanto um campo do painel está em edição.
  const planoNoCursor = useMemo(() => planosDe(itens).find((p) => tempo >= p.inicio && tempo < p.fim)?.id ?? null, [itens, tempo])
  const ultimoPlano = useRef<string | null>(null)
  useEffect(() => {
    if (planoNoCursor === ultimoPlano.current) return
    ultimoPlano.current = planoNoCursor
    if (document.activeElement?.closest('aside')) return
    setSelecionado(planoNoCursor)
  }, [planoNoCursor])

  const arrastar = useCallback(
    (a: Arrasto, t: number) =>
      mudar((atuais) => (a.tipo === 'borda' ? moverBorda(atuais, a.k, t) : moverElemento(atuais, a.id, a.lado, t, duracao)), false),
    [mudar, duracao],
  )
  const aoIniciarArrasto = useCallback(() => setHistorico((h) => [...h.slice(-99), itensRef.current]), [])

  async function reanalisar() {
    if (!window.confirm('Pedir uma análise nova para a IA? A revisão atual (inclusive suas correções) é substituída; a versão anterior fica guardada.')) return
    await reanalisarReferencia(id, true)
    navegar('/calibragem')
  }

  async function revisar(v: boolean) {
    if (!dados) return
    if (v && salvamento !== 'salvo') return
    const r = await marcarRevisada(id, v)
    setDados({ ...dados, referencia: r })
  }

  if (erroCarga)
    return (
      <div className="grid h-svh place-items-center bg-deep text-cream">
        <p>
          {erroCarga} · <Link to="/calibragem" className="text-yellow underline">voltar</Link>
        </p>
      </div>
    )
  if (!dados) return <div className="h-svh bg-deep" />

  const sel = itens.find((i) => i.id === selecionado) ?? null
  const revisada = dados.referencia.status === 'revisado'
  const noCursor = planosDe(itens).find((p) => tempo >= p.inicio && tempo < p.fim)

  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-deep text-cream">
      <header className="flex items-center gap-4 border-b border-line-dark bg-ink px-4">
        <Link to="/calibragem" title="Calibragem">
          <Logo />
        </Link>
        <span className="h-5 w-px bg-line-dark" />
        <Link to="/calibragem" className="text-[12px] text-fog hover:text-cream">
          Calibragem
        </Link>
        <span className="text-fog/50">/</span>
        <span className="truncate text-[13px] font-semibold">{dados.referencia.nome}</span>
        <span className="ml-auto text-[11px] text-fog">
          {salvamento === 'salvo' ? '✓ Salvo' : salvamento === 'salvando' ? 'Salvando…' : salvamento === 'pendente' ? 'Alterações…' : <b className="text-coral">⚠ {salvamento.erro}</b>}
        </span>
        <button
          onClick={() => void reanalisar()}
          title="Analisa este vídeo de novo com o prompt e as configurações atuais"
          className="flex h-9 items-center gap-2 rounded-full border border-line-dark px-4 text-[12px] font-semibold text-fog hover:border-cream/50 hover:text-cream"
        >
          ↻ Reanalisar
        </button>
        <button
          onClick={() => void revisar(!revisada)}
          disabled={!revisada && salvamento !== 'salvo'}
          className={cn(
            'flex h-9 items-center gap-2 rounded-full px-4 text-[12px] font-semibold transition-colors disabled:opacity-50',
            revisada ? 'border border-mint/60 text-mint hover:bg-mint/10' : 'bg-coral text-cream hover:bg-coral/90',
          )}
          title={revisada ? 'Desmarcar: volta para “a revisar” e sai do dataset' : 'Entra no dataset que ensina a Direção visual'}
        >
          {revisada ? '✓ Revisada · desmarcar' : '✓ Marcar como revisada'}
        </button>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(420px,520px)_minmax(0,1fr)_minmax(320px,380px)]">
        {/* timeline */}
        <section className="flex min-h-0 flex-col border-r border-line-dark">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-3 py-2 text-[11px]">
            <Botao onClick={dividir} titulo="Divide o plano sob o cursor em dois (S)">
              <Scissors className="size-3" /> Dividir plano
            </Botao>
            <Botao onClick={adicionarElemento} titulo="Cria um elemento a partir do cursor (E)">
              <Plus className="size-3" /> Elemento
            </Botao>
            <Botao onClick={desfazer} titulo="Desfazer (⌘Z)" desligado={!historico.length}>
              <Undo2 className="size-3" />
            </Botao>
            <span className="ml-auto flex items-center gap-1 text-fog">
              <button onClick={() => setPx((v) => Math.max(v / 1.4, 8))} aria-label="Afastar" className="grid size-7 place-items-center rounded-full hover:bg-cream/10">
                <Minus className="size-3.5" />
              </button>
              <button onClick={() => setPx((v) => Math.min(v * 1.4, 600))} aria-label="Aproximar" className="grid size-7 place-items-center rounded-full hover:bg-cream/10">
                <Plus className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="flex gap-3 border-b border-line-dark px-3 py-1.5 text-[9px] tracking-[0.1em] text-fog uppercase">
            <span className="w-[150px] pl-[54px]">Fala</span>
            <span className="w-[138px] pl-[10px]">Planos-base</span>
            <span>Elementos</span>
          </div>
          <LinhaDirecao
            refId={id}
            duracao={duracao}
            palavras={dados.palavras}
            cortes={dados.cortes}
            itens={itens}
            nomes={nomes}
            tempo={tempo}
            tocando={tocando}
            selecionado={selecionado}
            px={px}
            setPx={setPx}
            buscar={buscar}
            selecionar={setSelecionado}
            aoIniciarArrasto={aoIniciarArrasto}
            arrastar={arrastar}
          />
        </section>

        {/* vídeo */}
        <section className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-4 px-6 py-5">
          <video
            ref={video}
            src={urlArquivoReferencia(id, 'proxy.mp4')}
            className="min-h-0 w-auto max-w-full flex-1 rounded-[6px] bg-black object-contain"
            playsInline
            onClick={alternar}
          />
          <div className="flex items-center gap-4">
            <button onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'} className="grid size-11 place-items-center rounded-full bg-cream text-ink hover:bg-mint">
              {tocando ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </button>
            <span className="text-[12px] tabular-nums">
              {fmt(tempo)} <span className="text-fog">/ {fmt(duracao)}</span>
            </span>
            <div className="flex rounded-full border border-line-dark p-0.5 text-[10px] font-semibold">
              {[0.5, 1, 2].map((v) => (
                <button key={v} onClick={() => setVelocidade(v)} className={cn('rounded-full px-2 py-1', velocidade === v ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
                  {v}×
                </button>
              ))}
            </div>
          </div>
          {noCursor && (
            <p className="text-[11px] text-fog">
              No cursor: <b className="text-cream">{nomes[noCursor.tipo]}</b>
            </p>
          )}
        </section>

        {/* detalhe */}
        <aside className="min-h-0 overflow-y-auto border-l border-line-dark px-5 py-5">
          {sel ? (
            <Detalhe
              key={sel.id}
              item={sel}
              refId={id}
              nomes={sel.camada === 'plano' ? dados.categorias.planos : dados.categorias.elementos}
              fala={dados.palavras.filter((w) => w.fim > sel.inicio && w.inicio < sel.fim).map((w) => w.texto).join(' ')}
              editar={(campos) => mudar((atuais) => editar(atuais, sel.id, campos))}
              ver={() => verTrecho(sel)}
              elementos={sel.camada === 'plano' ? itens.filter((e) => e.camada === 'elemento' && e.fim > sel.inicio && e.inicio < sel.fim) : []}
              nomesElementos={dados.categorias.elementos}
              selecionar={setSelecionado}
              apagar={() => apagar(sel.id)}
              unicoPlano={sel.camada === 'plano' && planosDe(itens).length < 2}
            />
          ) : (
            <Ajuda planos={dados.categorias.planos} elementos={dados.categorias.elementos} />
          )}
        </aside>
      </div>
    </div>
  )
}
