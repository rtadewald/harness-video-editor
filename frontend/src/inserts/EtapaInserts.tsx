import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PanelRightClose, PanelRightOpen, Captions, Clapperboard, Images, Scissors, Search, Wand2 } from 'lucide-react'
import { definirMidias, configurarComentario, definirFundo, definirMovimentoAtor, enriquecerInsert, enriquecerTipo, lerInserts, listarBanco, mapaBanco, subirNoBanco, salvarDirecaoProjeto, type DadosEditor, type Projeto, type InsertsProjeto, type ItemBanco, type ItemRef, type MidiaLigada } from '@/api'
import { useLembrado } from '@/lib/useLembrado'
import { paraAncora, paraTempo, palavrasNaSaida } from '@/direcao/direcaoProjeto'
import { dividirPlano, editar } from '@/referencias/edicao'
import { CATEGORIAS } from '@/direcao/EtapaDirecao'
import { PainelComentario, comentarioDe, type Comentario } from '@/inserts/ComentarioIG'
import BuscarReferencias from '@/inserts/BuscarReferencias'
import { usePresets, vidasDasMidias } from '@/presets/presets'
import CardAjustes from '@/presets/CardAjustes'
import { aspectosDe, telaTodaPermitida } from '@/presets/divisao'
import MontagemNoPalco from '@/player/MontagemNoPalco'
import { useRosto, type AjusteAtor } from '@/ator/ator'
import PainelMotion from '@/motions/PainelMotion'
import { EdicaoPreset } from '@/motions/PresetMotion'
import { usePreCarregarMarcas } from '@/motions/sons'
import { useMotionsDoProjeto } from '@/motions/useMotionsDoProjeto'
import { pedidosNoTempo, presetDe, receitaDoInsert } from '@/inserts/InsertNoLugar'
import LinhaInserts from '@/inserts/LinhaInserts'
import { corteDe, enriquecimentoDe, entradaDe, saidaDe, type Qual } from '@/inserts/enriquecimento'
import { duracaoEntrada, duracaoSaida, useEntradas, type Lado } from '@/inserts/entradas'
import { cn } from '@/lib/utils'
import Preview from '@/player/Preview'
import CamadaLegenda from '@/legenda/CamadaLegenda'
import { blocosDaLegenda, zonasDaLegenda, type Legenda } from '@/legenda/legenda'
import type { Sequencia } from '@/player/sequencia'
import type { usePlayer } from '@/player/usePlayer'
import { TEM_MOTION, type NovaMidia, type Pedido } from '@/inserts/comum'
import DetalheInsert from '@/inserts/DetalheInsert'
import { Alca, Cabecalho, Recolhivel, useTamanhos } from '@/inserts/layout'
import PainelEnriquecimento from '@/inserts/PainelEnriquecimento'
import { Categoria, EditorPresetAberto, EscolhaFundo, PresetsDoAtor, ResumoFundo, SemInsert, SugestaoIA } from '@/inserts/pecas'
import { ehFullAtor, type Movimento } from '@/ator/movimento'
import { emCampoDeTexto, modalAberto } from '@/lib/atalhos'

type Props = {
  dados: DadosEditor
  seq: Sequencia
  player: ReturnType<typeof usePlayer>
  src: string
  enquadramentoX: number
  aoMudarProjeto: (p: Projeto) => void
  /** A legenda do projeto, desenhada na prévia com os inserts como estão sendo mexidos (ela desvia da costura e do card
   *  do comentário); dá para escondê-la aqui. */
  legenda?: Legenda | null
}

/** Etapa 03 (SPEC §8.3): a pós-produção dos planos da direção, em três trabalhos — as MÍDIAS de cada insert (subir,
 *  escolher do banco, capturar site), os MOTIONS (em construção) e o ENRIQUECIMENTO (como cada insert aparece, mock).
 *  A timeline é a da Direção, só de leitura, com uma coluna de mídias. */
/** A largura mínima do vídeo na prévia, com os controles do player embaixo. */
const VIDEO_MIN = 300

export default function EtapaInserts(p: Props) {
  const { dados, seq, player } = p
  const projeto = dados.projeto
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  const [selPlano, setSelPlano] = useState<string | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [buscandoRefs, setBuscandoRefs] = useState(false)
  // motions (SPEC §8.5): o de cada plano (um preset ou um vídeo do banco)
  const { motions, recarregar: recarregarMotions } = useMotionsDoProjeto(projeto.id)
  const falhar = (e: unknown) => window.alert((e as Error).message)

  // o mapa tem os originais e os trechos (um trecho toca o arquivo do original, do início ao fim dele)
  const carregarBanco = () => listarBanco().then((l) => setBanco(mapaBanco(l)))
  useEffect(() => {
    lerInserts(projeto.id)
      .then((r) => {
        setIns(r)
        setErro(null)
      })
      .catch((e) => setErro((e as Error).message))
    void carregarBanco()
  }, [projeto.id, projeto.direcao?.ativa, projeto.direcao?.gerado_em]) // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto há captura de site em andamento, acompanha (as dobras prontas já entram como mídias)
  const capturando = ins?.pedidos.some((x) => x.capturas?.some((c) => c.status === 'fila' || c.status === 'rodando'))
  useEffect(() => {
    if (!capturando) return
    const t = setInterval(() => {
      void lerInserts(projeto.id).then(setIns)
      void carregarBanco()
    }, 2500)
    return () => clearInterval(t)
  }, [capturando, projeto.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // a timeline: os itens da direção no tempo do vídeo final (só leitura) e as palavras ditas
  const saida = useMemo(() => palavrasNaSaida(dados.palavras, seq), [dados.palavras, seq])
  const itens = useMemo(() => paraTempo(projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao).visiveis, [projeto.direcao?.itens, dados.palavras, saida, seq.duracao])
  const planos = useMemo(
    () =>
      itens
        .filter((i) => i.camada === 'plano')
        .sort((a, b) => a.inicio - b.inicio)
        .map((i) => ({ ...i, fala: saida.filter((w) => w.saida_ini >= i.inicio - 0.01 && w.saida_ini < i.fim).map((w) => w.texto).join(' ') })),
    [itens, saida],
  )
  // mudar a direção daqui (a categoria de um plano, cortar um plano em dois): a versão aberta muda, a sugestão da IA
  // (`itens_ia`) fica; os inserts acompanham (as mídias seguem o plano)
  const editarDirecao = async (f: (itens: ItemRef[]) => ItemRef[]) => {
    const { visiveis, orfaos } = paraTempo(projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao)
    const novos = f(visiveis)
    if (novos === visiveis) return
    try {
      const r = await salvarDirecaoProjeto(projeto.id, [...paraAncora(novos, saida), ...orfaos])
      p.aoMudarProjeto({ ...projeto, direcao: r })
      setIns(await lerInserts(projeto.id))
    } catch (e) {
      falhar(e)
    }
  }
  const sugestaoIA = (id: string) => projeto.direcao?.itens_ia?.find((i) => i.id === id)?.tipo ?? null
  const palavrasTimeline = useMemo(() => saida.map((w) => ({ ...w, inicio: w.saida_ini, fim: w.saida_fim })), [saida])
  const pedidos: Pedido[] = useMemo(() => pedidosNoTempo(ins?.pedidos ?? [], planos), [ins, planos])
  const tempo = player.tempo
  const planoNoCursor = planos.find((pl) => tempo >= pl.inicio && tempo < pl.fim) ?? null

  // a seleção é o plano sob o cursor da linha do tempo (tocando, parado ou arrastando): os cards mostram onde se está
  useEffect(() => {
    if (planoNoCursor) setSelPlano(planoNoCursor.id)
  }, [planoNoCursor?.id])

  // as marcas de som dos motions, lidas de antemão (uma página por vez): o som da digitação começa junto com as letras
  usePreCarregarMarcas(projeto.id, planos, motions, saida)
  const presetsTodos = usePresets()

  // o preset de um plano de Full ator (o movimento de câmera no ator): a prévia muda na hora
  const mudarMovimento = (plano: string, m: Movimento | null) => {
    setIns((i) => {
      if (!i) return i
      const ator_planos = { ...i.ator_planos }
      if (m) ator_planos[plano] = m
      else delete ator_planos[plano]
      return { ...i, ator_planos }
    })
    void definirMovimentoAtor(projeto.id, plano, m).then(setIns).catch(falhar)
  }
  const salvar = (pid: string, midias: NovaMidia[]) => definirMidias(projeto.id, pid, midias as MidiaLigada[]).then(setIns).catch(falhar)
  /** Sobe arquivos para o banco e liga ao insert, no fim da lista. Devolve os itens novos (os vídeos abrem no editor). */
  const subirELigar = async (x: Pedido, arquivos: File[]): Promise<ItemBanco[]> => {
    if (!arquivos.length) return []
    setSubindo(true)
    try {
      const novos = await subirNoBanco(arquivos)
      await carregarBanco()
      await salvar(x.id, [...x.midias, ...novos.map((n) => ({ banco: n.id }))])
      return novos
    } catch (e) {
      falhar(e)
      return []
    } finally {
      setSubindo(false)
    }
  }

  const planoSel = planos.find((pl) => pl.id === selPlano) ?? null
  const sel = pedidos.find((x) => x.plano === selPlano) ?? null
  const presetDoSel = sel ? presetDe(sel, presetsTodos) : null
  // selecionar um insert com preset abre a coluna dos cards (o do preset e o fundo)
  useEffect(() => {
    if (presetDoSel) setColuna(true)
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // os ajustes rápidos do preset mudam na hora (sem esperar o servidor) e são salvos no insert
  const mudarEnriquecimento = (pid: string, campos: Record<string, unknown>) => {
    setIns((i) => i && { ...i, pedidos: i.pedidos.map((x) => (x.id === pid ? { ...x, enriquecimento: { ...x.enriquecimento, ...(campos as object) } } : x)) })
    void enriquecerInsert(projeto.id, pid, campos as Parameters<typeof enriquecerInsert>[2]).then(setIns).catch(falhar)
  }
  /** O ator arrastado no vídeo (P5): muda na tela enquanto arrasta e salva ao soltar (`null`: o automático). */
  const mudarAtor = (pid: string, ator: AjusteAtor | null, salvarAgora: boolean) => {
    setIns((r) => r && { ...r, pedidos: r.pedidos.map((x) => (x.id === pid ? { ...x, enriquecimento: { ...x.enriquecimento, ator: ator ?? undefined } } : x)) })
    if (salvarAgora) void enriquecerInsert(projeto.id, pid, { ator } as Parameters<typeof enriquecerInsert>[2]).then(setIns).catch(falhar)
  }
  const rostoEm = useRosto(projeto, seq)
  /** Onde a 2ª mídia começa (fração do insert): muda na tela na hora (arrastando) e salva ao soltar. */
  const ajustarCorte = (pid: string, v: number | null, salvarAgora: boolean) => {
    setIns((r) =>
      r && {
        ...r,
        pedidos: r.pedidos.map((x) => {
          if (x.id !== pid) return x
          const { corte: _, ...resto } = x.enriquecimento ?? {}
          return { ...x, enriquecimento: v == null ? resto : { ...resto, corte: v } }
        }),
      },
    )
    if (salvarAgora) void enriquecerInsert(projeto.id, pid, { corte: v }).then(setIns).catch(falhar)
  }
  const ehMotion = !!planoSel && TEM_MOTION.includes(planoSel.tipo)
  // o preset do plano de motion selecionado: o card de edição dele vai na coluna ao lado do vídeo
  const motionPreset = ehMotion && motions[planoSel.id]?.tipo === 'preset' ? motions[planoSel.id] : null
  const comMidia = pedidos.filter((x) => x.midias.length).length
  /** Seleciona o plano e leva a prévia até ele, já depois da entrada, para o insert aparecer inteiro. */
  const escolher = (plano: string) => {
    setSelPlano(plano)
    const pl = planos.find((x) => x.id === plano)
    if (pl) player.buscar(Math.min(pl.inicio + 0.6, (pl.inicio + pl.fim) / 2))
  }

  // card de comentário: muda na hora na tela e salva um pouco depois (arrastar e sliders não disparam um pedido por pixel)
  const pendente = useRef<{ pid: string; campos: Record<string, unknown>; t?: number } | null>(null)
  const mudarComentario = (pid: string, campos: Record<string, unknown>) => {
    setIns((r) =>
      r && {
        ...r,
        pedidos: r.pedidos.map((x) => {
          if (x.id !== pid) return x
          const novo: Record<string, unknown> = { ...(x.comentario ?? {}), ...campos }
          for (const k of Object.keys(novo)) if (novo[k] == null) delete novo[k]
          return { ...x, comentario: novo as Partial<Comentario> }
        }),
      },
    )
    const ant = pendente.current?.pid === pid ? pendente.current : null
    if (ant?.t) window.clearTimeout(ant.t)
    const juntos = { ...(ant?.campos ?? {}), ...campos }
    pendente.current = {
      pid,
      campos: juntos,
      t: window.setTimeout(() => {
        pendente.current = null
        void configurarComentario(projeto.id, pid, juntos).then(setIns).catch(falhar)
      }, 350),
    }
  }

  // R: toca de novo o trecho do plano atual, do começo ao fim (fora de campos de texto; o editor de vídeo segura as teclas dele).
  // Para um quadro antes do fim (o cursor fica dentro do plano) e lembra o plano tocado: R de novo logo depois do fim
  // repete o mesmo, mesmo que o cursor tenha passado para o seguinte (pedido de Rodrigo, out/2026)
  const cortarNoCursor = () =>
    void editarDirecao((it) => {
      const r = dividirPlano(it, tempo)
      if (r.novo) setSelPlano(r.novo)
      return r.novo ? r.itens : it
    })
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey) return
      if (emCampoDeTexto(e.target) || modalAberto()) return
      e.preventDefault()
      cortarNoCursor()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })
  const ultimoR = useRef<{ id: string; fim: number } | null>(null)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return
      if (emCampoDeTexto(e.target) || modalAberto()) return
      // o plano sob o cursor (o trecho tocado para um quadro antes do fim, então o cursor fica nele); se o cursor parou
      // exatamente no fim do último tocado, ele de novo
      const naBorda = ultimoR.current && Math.abs(tempo - ultimoR.current.fim) < 0.2 ? planos.find((x) => x.id === ultimoR.current!.id) : null
      const pl = naBorda ?? planoNoCursor ?? planos.find((x) => x.id === selPlano)
      if (!pl) return
      e.preventDefault()
      ultimoR.current = { id: pl.id, fim: pl.fim }
      if (selPlano !== pl.id) setSelPlano(pl.id)
      // para dois quadros antes do fim: o cursor fica dentro do plano (o player às vezes passa um quadro)
      player.tocarTrecho(seq.saidaParaFonte(pl.inicio), seq.saidaParaFonte(Math.max(pl.fim - 2 / 24, pl.inicio)), { pular: true, loop: false })
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const entradas = useEntradas()
  const [presetAberto, setPresetAberto] = useState<string | null>(null)
  /** Toca a entrada (o começo) ou a saída (o fim) de uma mídia do insert selecionado, com uma folga. */
  const verEntrada = (x: Pedido, lado: Lado, q: Qual) => {
    const e = enriquecimentoDe(x)
    const dur = x.t.fim - x.t.inicio
    const corte = x.midias.length === 2 ? corteDe(e, dur) * dur : 0
    const ini = x.t.inicio + (q === 2 ? corte : 0)
    const fim = q === 1 && x.midias.length === 2 && e.entre === 'sequencia' ? x.t.inicio + corte : x.t.fim
    const d = lado === 'entrada' ? duracaoEntrada(entradaDe(e, q), entradas!, fim - ini) : duracaoSaida(saidaDe(e, q), entradas!, fim - ini)
    const [a, b] = lado === 'entrada' ? [ini, Math.min(ini + d + 0.6, fim)] : [Math.max(fim - d - 0.6, ini), fim]
    player.tocarTrecho(seq.saidaParaFonte(a), seq.saidaParaFonte(Math.max(b - 0.01, a)), { pular: true, loop: false })
  }
  const pedidosPorPlano = useMemo(() => new Map(pedidos.map((x) => [x.plano, x])), [pedidos])
  // com preset e várias mídias, o preset manda em quando cada uma está na tela: a trilha Mídias desenha por ele
  const vidasPreset = useMemo(() => {
    const m = new Map<string, ReturnType<typeof vidasDasMidias>>()
    for (const x of pedidos) {
      if (x.midias.length < 2) continue
      const r = receitaDoInsert(x, banco, presetsTodos)
      if (r) m.set(x.plano, vidasDasMidias(r, Math.max(x.t.fim - x.t.inicio, 0.01), x.midias.length))
    }
    return m
  }, [pedidos, banco, presetsTodos])
  const planosLinha = useMemo(() => planos.map((pl, k) => ({ ...pl, n: k + 1 })), [planos])
  const elementos = useMemo(() => itens.filter((i) => i.camada === 'elemento'), [itens])
  const nomes = { ...CATEGORIAS.planos, ...CATEGORIAS.elementos }
  const [tam, arrastarBorda] = useTamanhos()
  const [coluna, setColuna] = useLembrado('inserts.colunaAberta', true)
  // aberta à mão numa janela em que ela não cabe (vale enquanto a tela está aberta; a preferência acima não muda)
  const [colunaForcada, setColunaForcada] = useState(false)
  const abrirColuna = () => {
    setColuna(true)
    setColunaForcada(true)
  }
  const [verLegenda, setVerLegenda] = useLembrado('inserts.verLegenda', true)
  const lg = p.legenda
  const blocosLegenda = useMemo(
    () => (lg?.ligada && verLegenda ? blocosDaLegenda(saida, planos, lg, dados.palavras, zonasDaLegenda(pedidos, banco, presetsTodos)) : []),
    [lg, verLegenda, saida, planos, dados.palavras, pedidos, banco, presetsTodos],
  )
  // a janela pode não comportar as larguras escolhidas: o centro guarda 300 px para o vídeo (com os controles) e, ao lado,
  // a coluna do preset e do fundo (268 px) ou a faixa dela recolhida; os cards encolhem juntos com o que sobra. Se a coluna
  // só coubesse apertando os cards a menos de 80%, ela fica recolhida sozinha (a faixa a abre mesmo assim)
  const area = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = area.current
    if (!el) return
    const obs = new ResizeObserver(() => setLargura(el.clientWidth))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const centroComColuna = VIDEO_MIN + 48 + 20 + 268 // o vídeo, o px-6 da seção, o espaço e a coluna
  const centroSemColuna = VIDEO_MIN + 48 + 20 + 36 - 24 // a faixa recolhida (36 px) encosta na borda (-mr-6)
  const apertado = largura > 0 && largura - centroComColuna < (tam.esq + tam.dir) * 0.8
  const colunaVisivel = coluna && (!apertado || colunaForcada)
  const cabe = largura ? Math.min(1, Math.max(largura - (colunaVisivel ? centroComColuna : centroSemColuna), 0) / (tam.esq + tam.dir)) : 1
  const esq = Math.round(tam.esq * cabe)
  const dir = Math.round(tam.dir * cabe)

  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: `minmax(0,1fr) ${tam.linha}px` }}>
      <div ref={area} className="relative grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${esq}px minmax(0, 1fr) ${dir}px` }}>
        <Alca lado="esq" pos={esq} arrastar={arrastarBorda} />
        <Alca lado="dir" pos={dir} arrastar={arrastarBorda} />
        {/* à esquerda: o trabalho do plano — as mídias (insert) ou a criação do motion */}
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line-dark text-cream">
          <Cabecalho
            icone={ehMotion ? Clapperboard : Images}
            titulo={ehMotion ? 'Motion' : 'Inserts'}
            extra={
              <>
                <span className="text-fog tabular-nums">
                  {comMidia}/{pedidos.length} com mídia
                </span>
                <button
                  onClick={() => setBuscandoRefs(true)}
                  className="ml-auto flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 font-semibold text-ink transition-colors hover:bg-cream"
                  title="Ver os planos dos vídeos de referência, já filtrados pelo tipo deste plano"
                >
                  <Search className="size-3.5" /> Buscar por referências
                </button>
              </>
            }
          />
          {erro && <p className="border-b border-line-dark px-4 py-2 text-[12px] text-coral">{erro}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {planoSel && (
              // a categoria e a sugestão da IA juntas; a linha separa o trabalho do plano (mídias, motion)
              <div className="mb-4 grid gap-3 border-b border-line-dark pb-4">
                <Categoria
                  atual={planoSel.tipo}
                  sugestao={sugestaoIA(planoSel.id)}
                  mudar={(tipo) => {
                    // voltar à categoria que a IA sugeriu traz de volta o que ela tinha preenchido (o comentário da pessoa, o
                    // lettering, a descrição e o conteúdo), que uma categoria sem esses campos apaga
                    const ia = projeto.direcao?.itens_ia?.find((i) => i.id === planoSel.id)
                    const campos = ia && ia.tipo === tipo ? { tipo, texto: ia.texto, descricao: ia.descricao, conteudo: ia.conteudo } : { tipo }
                    void editarDirecao((it) => editar(it, planoSel.id, campos))
                  }}
                />
                <SugestaoIA
                  tipo={planoSel.tipo}
                  fala={planoSel.fala}
                  descricao={planoSel.descricao}
                  rotulo={TEM_MOTION.includes(planoSel.tipo) ? 'O que a direção pede' : 'O que acontece no insert'}
                />
              </div>
            )}
            {!planoSel ? (
              <p className="text-[12.5px] leading-[1.7] text-fog">
                Escolha um plano na linha do tempo. Num insert, aqui ficam as mídias (subir, escolher do{' '}
                <Link to="/banco" className="text-yellow hover:underline">
                  banco
                </Link>
                , capturar site); num motion, a criação do motion. À direita, o enriquecimento: como aparece, entra, combina e sai.
              </p>
            ) : sel ? (
              <DetalheInsert
                key={sel.id}
                pedido={sel}
                banco={banco}
                subindo={subindo}
                projetoId={projeto.id}
                capturou={setIns}
                salvar={(midias) => salvar(sel.id, midias)}
                subir={(arquivos) => subirELigar(sel, arquivos)}
                bancoMudou={() => {
                  void carregarBanco()
                  void lerInserts(projeto.id).then(setIns)
                }}
              />
            ) : ehMotion ? (
              <div className="grid gap-4">
                <PainelMotion key={planoSel.id} projetoId={projeto.id} plano={planoSel} motion={motions[planoSel.id]} mudou={recarregarMotions} bancoMudou={() => void carregarBanco()} />
              </div>
            ) : (
              <SemInsert plano={planoSel} />
            )}
          </div>
        </aside>

        {/* vídeo com o insert no lugar (o enriquecimento aproximado) */}
        <section className="flex min-h-0 min-w-0 gap-5 px-6 pt-5 pb-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Preview
            videoRef={player.ref}
            src={p.src}
            enquadramentoX={p.enquadramentoX}
            tempo={tempo}
            duracao={seq.duracao}
            tocando={player.tocando}
            alternar={player.alternar}
            velocidade={player.velocidade}
            setVelocidade={player.setVelocidade}
            buscar={player.buscar}
            sobreposicao={
              <MontagemNoPalco
                projeto={projeto}
                planos={planos}
                saida={saida}
                pedidos={pedidos}
                banco={banco}
                fundo={ins?.fundo ?? 'gradiente'}
                motions={motions}
                movimentos={ins?.ator_planos}
                tempo={tempo}
                tocando={player.tocando}
                velocidade={player.velocidade}
                avisoSemMidia
                videoRef={player.ref}
                src={p.src}
                enquadramentoX={p.enquadramentoX}
                mudarComentario={mudarComentario}
                rostoEm={rostoEm}
                mudarAtor={mudarAtor}
              />
            }
            transicoes
            legenda={blocosLegenda.length > 0 && <CamadaLegenda blocos={blocosLegenda} tempo={tempo} />}
          />
          </div>
          {/* o espaço livre ao lado do vídeo: o fundo (do vídeo todo) e, nos comentários, o card do Instagram; a coluna
              inteira recolhe para o lado, numa faixa encostada no Enriquecimento */}
          {colunaVisivel ? (
            <div className="-mx-1 flex min-h-0 w-[268px] shrink-0 flex-col gap-3 overflow-y-auto px-1 py-0.5">
              <div className="flex items-center justify-end gap-1">
                {lg?.ligada && (
                  <button
                    onClick={() => setVerLegenda(!verLegenda)}
                    className={cn('flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] hover:text-cream', verLegenda ? 'text-cream' : 'text-fog')}
                    title={verLegenda ? 'Esconder a legenda na prévia (só aqui; ela continua no vídeo)' : 'Mostrar a legenda na prévia'}
                  >
                    <Captions className="size-3.5" /> {verLegenda ? 'Legenda' : 'Legenda escondida'}
                  </button>
                )}
                <button
                  onClick={() => (apertado ? setColunaForcada(false) : setColuna(false))}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-fog hover:text-cream"
                  title="Recolher para o lado"
                >
                  Recolher <PanelRightClose className="size-3.5" />
                </button>
              </div>
              {presetAberto && presetAberto !== presetDoSel?.id && (
                <EditorPresetAberto
                  id={presetAberto}
                  ver={sel ? () => player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.max(sel.t.fim - 0.01, sel.t.inicio)), { pular: true, loop: false }) : undefined}
                />
              )}
              {sel && presetDoSel && (
                <Recolhivel chave="ajustes" titulo="Preset" resumo={<span className="truncate text-[11.5px] text-fog">{presetDoSel.nome}</span>}>
                  <CardAjustes preset={presetDoSel} ajustes={sel.enriquecimento?.ajustes} aspectos={aspectosDe(sel.midias, banco)} telaToda={telaTodaPermitida(sel.formato, sel.enriquecimento?.divisao === 'atras', aspectosDe(sel.midias, banco))} receita={receitaDoInsert(sel, banco, presetsTodos)} mudar={(a) => mudarEnriquecimento(sel.id, { ajustes: a })} />
                </Recolhivel>
              )}
              {motionPreset && planoSel && (
                <Recolhivel chave="motion" titulo="Motion" resumo={<span className="truncate text-[11.5px] text-fog">{motionPreset.nome}</span>}>
                  <EdicaoPreset projetoId={projeto.id} plano={planoSel.id} motion={motionPreset} mudou={recarregarMotions} bancoMudou={() => void carregarBanco()} />
                </Recolhivel>
              )}
              <Recolhivel chave="fundo" titulo="Fundo" resumo={<ResumoFundo id={ins?.fundo ?? 'gradiente'} />}>
                <EscolhaFundo atual={ins?.fundo ?? 'gradiente'} escolher={(f) => void definirFundo(projeto.id, f).then(setIns).catch(falhar)} />
              </Recolhivel>
              {sel?.tipo === 'comentario_insert_ator' && (
                <Recolhivel chave="comentario" fechado titulo="Comentário" resumo={<span className="truncate text-[11.5px] text-fog">{comentarioDe(sel).texto ?? sel.texto}</span>}>
                  <PainelComentario c={comentarioDe(sel)} textoDirecao={sel.texto ?? ''} mudar={(campos) => mudarComentario(sel.id, campos)} />
                </Recolhivel>
              )}
            </div>
          ) : (
            <div className="-mr-6 -mt-5 -mb-3 flex w-9 shrink-0 flex-col items-center gap-1.5 border-l border-line-dark py-3">
              <button onClick={abrirColuna} className="mb-1 grid size-7 place-items-center rounded-full text-fog hover:bg-cream/8 hover:text-cream" title="Abrir">
                <PanelRightOpen className="size-4" />
              </button>
              {/* recolhidos, os cards viram abas em pé (como os painéis recolhidos do Photoshop) */}
              {[...(presetAberto || presetDoSel ? ['Preset'] : []), ...(motionPreset ? ['Motion'] : []), 'Fundo', ...(sel?.tipo === 'comentario_insert_ator' ? ['Comentário'] : [])].map((nome) => (
                <button
                  key={nome}
                  onClick={abrirColuna}
                  className="rounded-[6px] px-1.5 py-3 text-[10px] font-semibold tracking-[0.14em] text-fog uppercase ring-1 ring-line-dark transition-colors hover:text-cream hover:ring-cream/40"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {nome}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* à direita: o enriquecimento do plano (inserts e motions) */}
        <aside className="flex min-h-0 min-w-0 flex-col border-l border-line-dark text-cream">
          <Cabecalho icone={Wand2} titulo="Enriquecimento" />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {sel ? (
              <PainelEnriquecimento
                key={sel.id}
                pedido={sel}
                banco={banco}
                mudar={(campos) => void enriquecerInsert(projeto.id, sel.id, campos).then(setIns).catch(falhar)}
                aplicarAoTipo={() => void enriquecerTipo(projeto.id, sel.id).then(setIns).catch(falhar)}
                ver={(lado, q) => entradas && verEntrada(sel, lado, q)}
                entradas={entradas}
                presetAberto={presetAberto}
                abrirPreset={(id) => {
                  setPresetAberto(id)
                  if (id) abrirColuna()
                }}
                fundo={ins?.fundo ?? 'gradiente'}
              />
            ) : ehMotion && planoSel ? (
              <PainelEnriquecimento
                key={planoSel.id}
                pedido={
                  {
                    id: planoSel.id,
                    tipo: planoSel.tipo,
                    formato: planoSel.tipo === 'motion_tela_cheia' ? 'vertical' : 'dividida',
                    t: { inicio: planoSel.inicio, fim: planoSel.fim },
                    midias: [],
                  } as unknown as Pedido
                }
                aviso="O enriquecimento dos motions passa a valer junto com os motions (em construção). Por ora, só para ver as opções."
                mudar={() => {}}
                aplicarAoTipo={() => {}}
                ver={() => {}}
                entradas={entradas}
              />
            ) : (
              planoSel && ehFullAtor(planoSel.tipo) ? (
                <PresetsDoAtor atual={ins?.ator_planos?.[planoSel.id] ?? null} mudar={(m) => mudarMovimento(planoSel.id, m)} />
              ) : (
                <p className="text-[12.5px] leading-[1.7] text-fog">{planoSel ? 'Este plano não tem insert nem motion.' : 'Escolha um insert ou um motion na linha do tempo.'}</p>
              )
            )}
          </div>
        </aside>
      </div>

      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        {buscandoRefs && <BuscarReferencias tipo={planoSel?.tipo ?? null} fechar={() => setBuscandoRefs(false)} />}
        <LinhaInserts
          duracao={seq.duracao}
          planos={planosLinha}
          elementos={elementos}
          palavras={palavrasTimeline}
          pedidos={pedidosPorPlano}
          nomes={nomes}
          tempo={tempo}
          tocando={player.tocando}
          selecionado={selPlano}
          buscar={player.buscar}
          selecionar={(id) => escolher(id)}
          escolherMidia={(id) => selPlano !== id && escolher(id)}
          ajustarCorte={ajustarCorte}
          vidas={vidasPreset}
          motions={motions}
          ferramentas={
            <button
              onClick={cortarNoCursor}
              className="ml-3 flex items-center gap-1 rounded-full px-2 py-1 font-semibold hover:bg-cream/8 hover:text-cream"
              title="Cortar: divide o plano sob o cursor em dois (D)"
            >
              <Scissors className="size-3.5" /> Cortar <kbd className="rounded-[3px] bg-cream/10 px-1 text-[10px]">D</kbd>
            </button>
          }
        />
      </div>
    </div>
  )
}
