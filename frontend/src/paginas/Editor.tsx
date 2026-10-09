import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { History, PanelLeftClose, PanelLeftOpen, Redo2, RotateCcw, Settings, Undo2 } from 'lucide-react'
import { abrirEditor, abrirPicos, abrirProjeto, abrirTranscricao, ajustarClipe, json, ativarTranscricao, cortarFaixa, emAndamento, formatarDuracao, gerarDirecao, motoresRodando, recalcularCortes, reenquadrando, refazerCortes, renomearProjeto, restaurarClipe, rodarMotor, urlArquivo, type DadosEditor, type Etapa, type Palavra, type Picos, type TranscricaoCompleta } from '@/api'
import { abrirAba } from '@/components/abasProjetos'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import EtapaDirecao from '@/editor/EtapaDirecao'
import EtapaInserts from '@/editor/EtapaInserts'
import Exportar from '@/editor/Exportar'
import { ETAPAS } from '@/editor/etapas'
import { calcularCortes, trechoDaEmenda, type Corte, type Selecao } from '@/editor/cortes'
import LinhaVertical from '@/editor/LinhaVertical'
import { Detalhe } from '@/editor/DetalheCorte'
import Preview from '@/editor/Preview'
import PainelLook from '@/editor/PainelLook'
import PainelEnquadramento from '@/editor/PainelEnquadramento'
import { LookAtor, useLookDoProjeto } from '@/editor/look'
import Processamento from '@/editor/Processamento'
import Configuracoes from '@/paginas/Configuracoes'
import { montarSequencia } from '@/editor/sequencia'
import { paraTempo, palavrasNaSaida } from '@/editor/direcaoProjeto'
import { TransicoesDoVideo, chavePar, cortesDoVideo, useBiblioteca, useEscolhas } from '@/transicoes/transicoes'
import { FatorSom } from '@/editor/sons'
import { MontagemDoProjeto } from '@/editor/MontagemNoPalco'
import EtapaTransicoes from '@/transicoes/EtapaTransicoes'
import EtapaAudio from '@/audio/EtapaAudio'
import EtapaLegenda from '@/legenda/EtapaLegenda'
import CamadaLegenda from '@/legenda/CamadaLegenda'
import { ajustesNoVideo, blocosDaLegenda, useLegendaDoProjeto, useZonasDaLegenda } from '@/legenda/legenda'
import { falas as falasDoVideo, useAudioDoProjeto, useCadeiaNaPrevia, useCatalogoAudio, useFundoNaPrevia } from '@/audio/audio'
import { sonsDasTransicoes } from '@/transicoes/transicoes'
import { useCatalogoSons } from '@/editor/sons'
import { usePlayer } from '@/editor/usePlayer'

export default function Editor() {
  const { id = '' } = useParams()
  const [dados, setDados] = useState<DadosEditor | null>(null)
  const [erro, setErro] = useState('')
  // a última etapa aberta em cada projeto (lembrada neste navegador)
  const [etapa, setEtapaBruta] = useState<Etapa>(() => {
    try {
      const e = localStorage.getItem(`editor.etapa.${id}`) as Etapa | null
      return e && ETAPAS.some((x) => x.id === e) ? e : 'cortes'
    } catch {
      return 'cortes'
    }
  })
  const setEtapa = (e: Etapa) => {
    setEtapaBruta(e)
    try {
      localStorage.setItem(`editor.etapa.${id}`, e)
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
  // barra das etapas recolhida (só os números): lembrada neste navegador
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem('editor.barraRecolhida') === '1'
    } catch {
      return false
    }
  })
  const alternarBarra = () =>
    setRecolhida((r) => {
      try {
        localStorage.setItem('editor.barraRecolhida', r ? '0' : '1')
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
      return !r
    })
  const seq = useMemo(() => (dados ? montarSequencia(dados.timeline, dados.palavras) : null), [dados])
  // as transições entre planos (SPEC §8.8): os planos da direção no tempo do vídeo final e a transição de cada corte
  const biblioteca = useBiblioteca()
  const [escolhasTransicoes, escolherTransicao] = useEscolhas(id)
  const naSaida = useMemo(() => {
    if (!dados || !seq) return null
    const saida = palavrasNaSaida(dados.palavras, seq)
    const planos = paraTempo(dados.projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao)
      .visiveis.filter((i) => i.camada === 'plano')
      .sort((a, b) => a.inicio - b.inicio)
    return { saida, planos }
  }, [dados, seq])
  const planosSaida = naSaida?.planos ?? null
  const cortesTransicao = useMemo(() => (planosSaida ? cortesDoVideo(planosSaida, biblioteca, escolhasTransicoes) : null), [planosSaida, biblioteca, escolhasTransicoes])
  // os sons da prévia na mesma relação com a voz deste vídeo que na exportação (SPEC §8.6): vale para os sons dos
  // presets e para os das transições, em todas as etapas
  const [fatorSom, setFatorSom] = useState(1)
  useEffect(() => {
    void fetch(`/api/projetos/${id}/sons/fator`)
      .then(json<{ fator: number }>)
      .then((r) => setFatorSom(r.fator))
      .catch(() => {})
  }, [id])
  const player = usePlayer(seq)
  // o áudio (SPEC §8.9): a voz limpa no player, a cadeia da voz e os faders em todas as etapas, o fundo nas etapas com o
  // vídeo montado (fora do Pré-processamento)
  const catAudio = useCatalogoAudio()
  // relê o áudio quando o vídeo do player muda (o proxy fica pronto, um Reenquadrar termina)
  const proxyDoBruto = dados?.projeto.fontes.find((f) => f.papel === 'bruto')?.proxy
  const [audio, mudarAudio, vozTocada] = useAudioDoProjeto(id, `${dados?.projeto.enquadramento.versao ?? 0}:${proxyDoBruto ?? ''}`)
  const falas = useMemo(() => (naSaida && catAudio ? falasDoVideo(naSaida.saida, catAudio.junta) : []), [naSaida, catAudio])
  useCadeiaNaPrevia(player.ref, catAudio, audio?.escolhas ?? null, player.tocando)
  useFundoNaPrevia({
    cat: catAudio,
    a: audio,
    lufs: vozTocada?.lufs ?? null,
    trechos: falas,
    tempo: player.tempo,
    duracao: seq?.duracao ?? 0,
    tocando: player.tocando,
    velocidade: player.velocidade,
    ativo: etapa !== 'cortes',
  })
  // a legenda (SPEC §8.10): os blocos da fala cortada, com os ajustes do projeto
  // (a altura desvia do que há na tela: a costura real de cada insert e o card do comentário — as zonas, relidas a cada
  // troca de etapa; na de Inserts, a própria etapa calcula com o que está sendo mexido)
  const [legenda, mudarLegenda] = useLegendaDoProjeto(id)
  const zonasLegenda = useZonasDaLegenda(id, naSaida?.planos ?? null, etapa)
  const blocosLegenda = useMemo(
    () => (naSaida && legenda && dados ? blocosDaLegenda(naSaida.saida, naSaida.planos, legenda, dados.palavras, zonasLegenda) : []),
    [naSaida, legenda, dados, zonasLegenda],
  )
  const orfaosLegenda = useMemo(() => (naSaida && legenda && dados ? ajustesNoVideo(legenda.ajustes, dados.palavras, naSaida.saida).orfaos : []), [naSaida, legenda, dados])
  const catSons = useCatalogoSons()
  const sonsTransicao = useMemo(() => (cortesTransicao ? sonsDasTransicoes(cortesTransicao, catSons) : []), [cortesTransicao, catSons])
  const [picos, setPicos] = useState<Picos | null>(null)
  const [comparar, setComparar] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const [comparacao, setComparacao] = useState<TranscricaoCompleta | null>(null)
  const [selecao, setSelecao] = useState<Selecao>(null)
  const [repetir, setRepetir] = useState(false)
  const bruto = dados?.projeto.fontes.find((f) => f.papel === 'bruto')
  const cortes = useMemo(() => (dados && bruto ? calcularCortes(dados.timeline.V1, dados.palavras, bruto.duracao) : []), [dados, bruto])
  // o Pré-processamento (a timeline vertical do bruto); fora dele, a prévia é o vídeo do ator já cortado
  const vertical = etapa === 'cortes'
  // o look do ator (LUT + vinheta): vale em todas as etapas; "segure para ver sem" desliga só enquanto se segura
  const [look, mudarLook, verLook] = useLookDoProjeto(id)
  const [semLook, setSemLook] = useState(false)
  const direcaoReal = etapa === 'direcao'
  const insertsReal = etapa === 'inserts'

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
  // o projeto aberto vira uma aba na barra de cima (e o nome da aba acompanha o do projeto)
  useEffect(() => {
    if (dados) abrirAba({ id: dados.projeto.id, nome: dados.projeto.nome })
  }, [dados?.projeto.id, dados?.projeto.nome]) // eslint-disable-line react-hooks/exhaustive-deps
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

  // enquanto o pipeline roda (ou os motores extras trabalham, ou o vídeo é reenquadrado), acompanha o projeto; ao terminar
  // o principal ou o Reenquadrar, recarrega o editor (num Reenquadrar, o bruto, o proxy e o recorte do ator mudaram)
  const rodando = dados ? emAndamento(dados.projeto) : false
  const extras = dados ? motoresRodando(dados.projeto) : false
  const enquadrando = dados ? reenquadrando(dados.projeto) : false
  useEffect(() => {
    if (!rodando && !extras && !enquadrando) return
    const timer = setInterval(async () => {
      const p = await abrirProjeto(id).catch(() => null)
      if (!p) return
      if ((rodando && !emAndamento(p)) || (enquadrando && !reenquadrando(p))) setDados(await abrirEditor(id))
      else setDados((d) => d && { ...d, projeto: p })
    }, 1000)
    return () => clearInterval(timer)
  }, [id, rodando, extras, enquadrando])

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
        if (vertical) player.buscarBruto(player.bruto + d)
        else player.buscar(player.tempo + d)
      } else if (vertical && e.key.toLowerCase() === 'e' && cortes.length) {
        const c = cortes.find((x) => x.fim > player.bruto + 0.05) ?? cortes[cortes.length - 1]
        ouvirEmenda(c)
      } else if (vertical && e.key.toLowerCase() === 'b') {
        player.setPular(!player.pular)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [player, vertical, cortes, ouvirEmenda])

  useEffect(() => {
    if (!vertical && !player.pular) player.setPular(true) // fora dos Cortes, a prévia é sempre o vídeo cortado
  }, [vertical, player])

  if (erro) return <p className="p-12 text-destructive">{erro}</p>
  if (!dados || !seq) return <div className="h-svh bg-deep" />

  const { projeto, timeline } = dados
  if (!bruto) return null
  const refazerComIA = () => {
    const n = timeline.V1.filter((c) => c.auto).length
    if (n && !window.confirm(`Refazer os cortes com a IA descarta ${n} trecho(s) com ajuste manual. Continuar?`)) return
    void refazerCortes(projeto.id).then((p) => setDados({ ...dados, projeto: p })).catch((e) => window.alert((e as Error).message))
  }
  const dirStatus = projeto.direcao?.status
  const refazerDirecao = () => {
    const d = projeto.direcao
    const versoes = d?.versoes ?? []
    const comentarios = versoes.reduce((n, v) => n + (v.comentarios?.length ?? 0), 0)
    const aviso =
      `Gerar a direção do zero APAGA todas as versões (${versoes.map((v) => `v${v.n}`).join(', ') || 'v1'})` +
      `${comentarios ? `, os ${comentarios} comentário(s)` : ''} e os seus ajustes, e começa de novo na v1. Continuar?`
    if (!window.confirm(aviso)) return
    void gerarDirecao(projeto.id).then((p) => setDados({ ...dados, projeto: p })).catch((e) => window.alert((e as Error).message))
  }
  // a cada Reenquadrar o proxy é refeito no mesmo caminho: a versão no endereço faz o player carregar o novo
  const versao = projeto.enquadramento.versao
  // com a voz limpa pronta, o proxy com ela (o mesmo vídeo; a voz trocada) — só se for do vídeo de agora: depois de um
  // Reenquadrar, o do bruto até o com a voz ser refeito
  const vozProxy = vozTocada?.proxy && vozTocada.versao === (versao ?? null) ? vozTocada.proxy : null
  const proxy = vozProxy ?? bruto.proxy
  const src = urlArquivo(projeto.id, proxy ?? bruto.arquivo) + (versao ? `?v=${versao}` : '')
  // o quadro inteiro montado (o ator, os inserts e os motions) com a legenda, para as etapas Transições, Áudio e Legenda
  const previaMontada = (
    <Preview
      videoRef={player.ref}
      src={src}
      enquadramentoX={projeto.enquadramento.x}
      tempo={player.tempo}
      duracao={seq.duracao}
      tocando={player.tocando}
      alternar={player.alternar}
      velocidade={player.velocidade}
      setVelocidade={player.setVelocidade}
      buscar={player.buscar}
      transicoes
      legenda={legenda?.ligada && <CamadaLegenda blocos={blocosLegenda} tempo={player.tempo} />}
      sobreposicao={
        naSaida && (
          <MontagemDoProjeto
            projeto={projeto}
            planos={naSaida.planos}
            saida={naSaida.saida}
            tempo={player.tempo}
            tocando={player.tocando}
            videoRef={player.ref}
            src={src}
            enquadramentoX={projeto.enquadramento.x}
          />
        )
      }
    />
  )

  return (
    <LookAtor.Provider value={semLook ? null : look}>
    <FatorSom.Provider value={fatorSom}>
    <TransicoesDoVideo.Provider value={cortesTransicao}>
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Link to="/" title="Projetos" className="shrink-0">
          <Logo />
        </Link>
        <span className="h-5 w-px shrink-0 bg-line-dark" />
        <NavHome renomear={(id, nome) => renomearProjeto(id, nome).then((p) => setDados((d) => d && { ...d, projeto: p }))} />

        <div className="ml-auto flex shrink-0 items-center gap-1 text-fog">
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
              className="ml-2 flex h-8 items-center gap-2 rounded-full border border-yellow/70 bg-yellow/10 px-3.5 text-[11px] font-semibold whitespace-nowrap text-yellow transition-colors hover:bg-yellow hover:text-ink disabled:opacity-60"
            >
              <RotateCcw className={cn('size-3.5', rodando && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
              {rodando ? 'Refazendo…' : 'Refazer cortes'}
            </button>
          )}
          {direcaoReal && projeto.direcao?.itens && (
            <button
              onClick={refazerDirecao}
              disabled={dirStatus === 'rodando'}
              title="Gera a direção do zero (nova v1), a partir dos exemplos da Calibragem. Apaga as versões e os comentários."
              className="ml-2 flex h-8 items-center gap-2 rounded-full border border-yellow/70 bg-yellow/10 px-3.5 text-[11px] font-semibold whitespace-nowrap text-yellow transition-colors hover:bg-yellow hover:text-ink disabled:opacity-60"
            >
              <RotateCcw className={cn('size-3.5', dirStatus === 'rodando' && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
              {dirStatus === 'rodando' ? 'Gerando…' : 'Refazer direção'}
            </button>
          )}
        </div>
        {seq && <Exportar projeto={projeto} duracao={seq.duracao} />}
      </header>

      {dados.palavras.length === 0 ? (
        <Processamento projeto={projeto} aoMudar={(p) => setDados({ ...dados, projeto: p })} />
      ) : (
      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: `${recolhida ? '58px' : '232px'} ${direcaoReal ? 'minmax(440px,560px) minmax(0,1fr) minmax(320px,380px)' : 'minmax(0,1fr)'}`,
        }}
      >
        <nav className={cn('flex min-h-0 flex-col gap-1 border-r border-line-dark py-6', recolhida ? 'items-center px-1.5' : 'px-3')}>
          <div className={cn('mb-3 flex items-center', recolhida ? 'justify-center' : 'ml-3 justify-between')}>
            {!recolhida && <p className="eyebrow text-sage">Etapas</p>}
            <button
              onClick={alternarBarra}
              className="grid size-7 place-items-center rounded-full text-fog hover:bg-cream/8 hover:text-cream"
              aria-label={recolhida ? 'Abrir a barra das etapas' : 'Recolher a barra das etapas'}
              title={recolhida ? 'Abrir a barra' : 'Recolher a barra'}
            >
              {recolhida ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>
          {ETAPAS.map((e, i) => (
            <button
              key={e.id}
              onClick={() => setEtapa(e.id)}
              title={recolhida ? e.nome : undefined}
              className={cn(
                'flex items-baseline rounded-full text-left text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-300',
                recolhida ? 'size-10 items-center justify-center' : 'gap-3 px-3 py-2.5',
                e.id === etapa ? 'bg-cream text-ink' : 'text-[#dfe7dc] hover:bg-cream/8 hover:text-cream',
              )}
            >
              <b className={cn('tabular-nums', recolhida ? 'text-[11px]' : 'text-[9px] tracking-[0.1em]', e.id === etapa ? 'text-[#c4502f]' : 'text-[#9fb3a6]')}>
                {String(i + 1).padStart(2, '0')}
              </b>
              {!recolhida && <span className="whitespace-nowrap">{e.nome}</span>}
              {!recolhida && e.id === etapa && <span className="seta ml-auto text-[16px]">↗</span>}
            </button>
          ))}

          <div className={cn('mt-auto grid gap-3 border-t border-line-dark pt-5 text-[11px] text-fog', recolhida && 'hidden')}>
            <p className="eyebrow text-sage">Projeto</p>
            <p>
              <span className="block text-cream">{bruto.nome_original}</span>
              {formatarDuracao(bruto.duracao)} · {bruto.largura}×{bruto.altura}
            </p>
            {projeto.briefing.texto && <p className="line-clamp-4 leading-[1.6]">“{projeto.briefing.texto}”</p>}
          </div>
        </nav>

        {etapa === 'cortes' ? (
              <div className="grid min-h-0 min-w-0" style={{ gridTemplateColumns: 'clamp(400px,38vw,720px) minmax(0,1fr) clamp(300px,24vw,380px)' }}>
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
                <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
                  <div className="min-h-0 px-6 pt-6 pb-3">
                    <Preview
                      videoRef={player.ref}
                      src={src}
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
                {/* à direita, sempre à vista: o look do ator e o enquadramento (SPEC §8.1) */}
                <aside className="grid min-h-0 min-w-0 content-start gap-4 overflow-y-auto border-l border-line-dark px-4 py-5 text-cream">
                  <PainelLook look={look} mudar={mudarLook} ver={verLook} comparar={setSemLook} />
                  <PainelEnquadramento
                    projetoId={projeto.id}
                    bruto={player.bruto}
                    tocando={player.tocando}
                    aoReenquadrar={() => void abrirProjeto(id).then((p) => setDados((d) => d && { ...d, projeto: p })).catch(() => undefined)}
                  />
                </aside>
              </div>
        ) : insertsReal ? (
          <EtapaInserts
            dados={dados}
            seq={seq}
            player={player}
            src={src}
            enquadramentoX={projeto.enquadramento.x}
            aoMudarProjeto={(p) => setDados((d) => d && { ...d, projeto: p })}
            legenda={legenda}
          />
        ) : direcaoReal ? (
          <EtapaDirecao
            dados={dados}
            seq={seq}
            player={player}
            src={src}
            enquadramentoX={projeto.enquadramento.x}
            aoMudarProjeto={(p) => setDados((d) => d && { ...d, projeto: p })}
          />
        ) : (
          etapa === 'transicoes' ? (
            <EtapaTransicoes
              previa={previaMontada}
              planos={planosSaida ?? []}
              duracao={seq.duracao}
              tempo={player.tempo}
              buscar={player.buscar}
              tocando={player.tocando}
              tocarTrecho={(de, ate) => player.tocarTrecho(seq.saidaParaFonte(de), seq.saidaParaFonte(Math.max(ate - 0.01, de)), { pular: true, loop: false })}
              escolher={(c, tid) => escolherTransicao(c.plano, tid, chavePar(c.de, c.para))}
            />
          ) : etapa === 'audio' ? (
            <EtapaAudio
              previa={previaMontada}
              a={audio}
              cat={catAudio}
              mudar={mudarAudio}
              falas={falas}
              sons={sonsTransicao}
              duracao={seq.duracao}
              tempo={player.tempo}
              tocando={player.tocando}
              buscar={player.buscar}
            />
          ) : etapa === 'legenda' ? (
            <EtapaLegenda
              previa={previaMontada}
              lg={legenda}
              blocos={blocosLegenda}
              orfaos={orfaosLegenda}
              planos={planosSaida ?? []}
              mudar={mudarLegenda}
              duracao={seq.duracao}
              tempo={player.tempo}
              tocando={player.tocando}
              buscar={player.buscar}
            />
          ) : null
        )}
      </div>
      )}
      <Configuracoes aberto={configAberta} aoFechar={() => setConfigAberta(false)} />
    </div>
    </TransicoesDoVideo.Provider>
    </FatorSom.Provider>
    </LookAtor.Provider>
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
