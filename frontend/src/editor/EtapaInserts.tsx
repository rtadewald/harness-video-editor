import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  
  ArrowDownToLine,
  
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Ban,
  Blend,
  Box,
  Clapperboard,
  Copy,
  Crosshair,
  EyeOff,
  Expand,
  Focus,
  Globe,
  Image as 
  Images,
  Library,
  Maximize2,
  MoveRight,
  MoveUp,
  PanelTop,
  Pause,
  Plane,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Settings2,
  Sparkles,
  Square,
  Upload,
  
  Wand2,
  
  ZoomIn,
} from 'lucide-react'
import { s1, definirMidias, configurarComentario, definirFundo, enriquecerInsert, enriquecerTipo, lerInserts, listarBanco, mapaBanco, subirNoBanco, tempoBR, urlBancoMiniatura, type DadosEditor, type InsertsProjeto, type ItemBanco, type ItemRef, type MidiaLigada } from '@/api'
import { urlPaginaMotionPlano } from '@/motions/api'
import { cn } from '@/lib/utils'
import { useLembrado } from '@/lib/useLembrado'
import { paraTempo, palavrasNaSaida } from './direcaoProjeto'
import { CATEGORIAS } from './EtapaDirecao'
import { CardComentario, PainelComentario, comentarioDe, type Comentario } from './ComentarioIG'
import BuscarReferencias from './BuscarReferencias'
import CapturaDeSite from './CapturaDeSite'
import ConfigTransicao from './ConfigTransicao'
import MidiaCard from './MidiaCard'
import SeletorBanco from './SeletorBanco'
import EditorPreset from './EditorPreset'
import MiniPreset from './MiniPreset'
import { presetsPara, usePresets } from './presets'
import ModalMotions from '@/motions/ModalMotions'
import MotionNoLugar from '@/motions/MotionNoLugar'
import PainelMotion from '@/motions/PainelMotion'
import { useMotionsDoProjeto } from '@/motions/useMotionsDoProjeto'
import EditorVideo from './EditorVideo'
import { FUNDOS } from './Fundo'
import InsertNoLugar, { pedidosNoTempo, presetDe, type PedidoNoTempo } from './InsertNoLugar'
import LinhaInserts from './LinhaInserts'
import { ESTILO, NOMES, OPCOES, campo, corteDe, enriquecimentoDe, entradaDe, saidaDe, type Categoria, type Qual } from './enriquecimento'
import { duracaoEntrada, duracaoSaida, useTransicoes, type Lado, type Transicoes } from './transicoes'
import Preview from './Preview'
import type { Sequencia } from './sequencia'
import type { usePlayer } from './usePlayer'

type Props = {
  dados: DadosEditor
  seq: Sequencia
  player: ReturnType<typeof usePlayer>
  src: string
  enquadramentoX: number
}
type Pedido = PedidoNoTempo
type NovaMidia = Omit<MidiaLigada, 'id'> & { id?: string }

const NOME_TIPO: Record<string, string> = {
  insert_tela_cheia: 'Tela cheia',
  tela_dividida_insert: 'Tela dividida',
  comentario_insert_ator: 'Comentário + insert',
}
const TEM_MOTION = ['motion_tela_cheia', 'tela_dividida_motion']
const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'
const BOTAO = 'flex items-center gap-1 rounded-full border border-line-dark px-3 py-1 font-semibold text-fog hover:text-cream'

/** Etapa 03 (SPEC §8.3): a pós-produção dos planos da direção, em três trabalhos — as MÍDIAS de cada insert (subir,
 *  escolher do banco, capturar site), os MOTIONS (em construção) e o ENRIQUECIMENTO (como cada insert aparece, mock).
 *  A timeline é a da Direção, só de leitura, com uma coluna de mídias. */
export default function EtapaInserts(p: Props) {
  const { dados, seq, player } = p
  const projeto = dados.projeto
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  const [selPlano, setSelPlano] = useState<string | null>(null)
  const [subindo, setSubindo] = useState(false)
  const [buscandoRefs, setBuscandoRefs] = useState(false)
  // motions (SPEC §8.5): o de cada plano (cópia no projeto), o modal e o seletor do banco que o modal pede
  const { motions, recarregar: recarregarMotions } = useMotionsDoProjeto(projeto.id)
  const [modalMotion, setModalMotion] = useState(false)
  const [escolhaBanco, setEscolhaBanco] = useState<((i: ItemBanco) => void) | null>(null)
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
  const palavrasTimeline = useMemo(() => saida.map((w) => ({ ...w, inicio: w.saida_ini, fim: w.saida_fim })), [saida])
  const pedidos: Pedido[] = useMemo(() => pedidosNoTempo(ins?.pedidos ?? [], planos), [ins, planos])
  const tempo = player.tempo
  const noCursor = pedidos.find((x) => tempo >= x.t.inicio && tempo < x.t.fim) ?? null
  const planoNoCursor = planos.find((pl) => tempo >= pl.inicio && tempo < pl.fim) ?? null

  // a seleção é o plano sob o cursor da linha do tempo (tocando, parado ou arrastando): os cards mostram onde se está
  useEffect(() => {
    if (planoNoCursor) setSelPlano(planoNoCursor.id)
  }, [planoNoCursor?.id])

  // tela dividida com mídia: o ator desce para a metade de baixo (o centro do quadro no meio da metade de baixo)
  const motionNoCursor = planoNoCursor && motions[planoNoCursor.id] ? planoNoCursor : null
  const dividida = (!!noCursor && noCursor.formato === 'dividida' && noCursor.midias.length > 0) || motionNoCursor?.tipo === 'tela_dividida_motion'
  useEffect(() => {
    const v = player.ref.current
    if (!v) return
    v.style.transform = dividida ? 'translateY(25%)' : ''
    return () => {
      v.style.transform = ''
    }
  }, [dividida, player.ref])

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
  const ultimoR = useRef<{ id: string; fim: number } | null>(null)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      const anterior = ultimoR.current && tempo >= ultimoR.current.fim - 0.1 && tempo <= ultimoR.current.fim + 1.5 ? planos.find((x) => x.id === ultimoR.current!.id) : null
      const pl = anterior ?? planos.find((x) => x.id === selPlano) ?? planoNoCursor
      if (!pl) return
      e.preventDefault()
      ultimoR.current = { id: pl.id, fim: pl.fim }
      if (selPlano !== pl.id) setSelPlano(pl.id)
      player.tocarTrecho(seq.saidaParaFonte(pl.inicio), seq.saidaParaFonte(Math.max(pl.fim - 1 / 24, pl.inicio)), { pular: true, loop: false })
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const trans = useTransicoes()
  const [presetAberto, setPresetAberto] = useState<string | null>(null)
  /** Toca a entrada (o começo) ou a saída (o fim) de uma mídia do insert selecionado, com uma folga. */
  const verTransicao = (x: Pedido, lado: Lado, q: Qual) => {
    const e = enriquecimentoDe(x)
    const dur = x.t.fim - x.t.inicio
    const corte = x.midias.length === 2 ? corteDe(e, dur) * dur : 0
    const ini = x.t.inicio + (q === 2 ? corte : 0)
    const fim = q === 1 && x.midias.length === 2 && e.entre === 'sequencia' ? x.t.inicio + corte : x.t.fim
    const d = lado === 'entrada' ? duracaoEntrada(entradaDe(e, q), trans!, fim - ini) : duracaoSaida(saidaDe(e, q), trans!, fim - ini)
    const [a, b] = lado === 'entrada' ? [ini, Math.min(ini + d + 0.6, fim)] : [Math.max(fim - d - 0.6, ini), fim]
    player.tocarTrecho(seq.saidaParaFonte(a), seq.saidaParaFonte(Math.max(b - 0.01, a)), { pular: true, loop: false })
  }
  const pedidosPorPlano = useMemo(() => new Map(pedidos.map((x) => [x.plano, x])), [pedidos])
  const planosLinha = useMemo(() => planos.map((pl, k) => ({ ...pl, n: k + 1 })), [planos])
  const elementos = useMemo(() => itens.filter((i) => i.camada === 'elemento'), [itens])
  const nomes = { ...CATEGORIAS.planos, ...CATEGORIAS.elementos }
  const [tam, arrastarBorda] = useTamanhos()
  const [coluna, setColuna] = useLembrado('inserts.colunaAberta', true)
  // a janela pode não comportar as larguras escolhidas: os cards encolhem juntos, e o vídeo fica com 300 px no mínimo
  const area = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = area.current
    if (!el) return
    const obs = new ResizeObserver(() => setLargura(el.clientWidth))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const cabe = largura ? Math.min(1, Math.max(largura - 300, 0) / (tam.esq + tam.dir)) : 1
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
            {!planoSel ? (
              <p className="text-[12.5px] leading-[1.7] text-fog">
                Escolha um plano na linha do tempo. Num insert, aqui ficam as mídias (subir, escolher do{' '}
                <Link to="/banco" className="text-yellow hover:underline">
                  banco
                </Link>
                , capturar site); num motion, a criação do motion. À direita, o enriquecimento: como aparece, entra, combina e sai.
              </p>
            ) : sel ? (
              <Detalhe
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
                ver={() => player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.max(sel.t.fim - 0.01, sel.t.inicio)), { pular: true, loop: false })}
              />
            ) : ehMotion ? (
              <div className="grid gap-4">
                <span className="w-fit rounded-full bg-yellow px-2.5 py-1 text-[11px] font-semibold text-ink">{CATEGORIAS.planos[planoSel.tipo]}</span>
                <p className="border-l-2 border-line-dark pl-3 text-[12.5px] leading-[1.6] text-cream/90">“{planoSel.fala}”</p>
                {planoSel.descricao && <Campo rotulo="O que a direção pede">{planoSel.descricao}</Campo>}
                <PainelMotion projetoId={projeto.id} plano={planoSel.id} motion={motions[planoSel.id]} abrir={() => setModalMotion(true)} mudou={recarregarMotions} />
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
              motionNoCursor ? (
                <MotionNoLugar
                  src={urlPaginaMotionPlano(projeto.id, motionNoCursor.id, motions[motionNoCursor.id], motionNoCursor.fim - motionNoCursor.inicio)}
                  formato={motions[motionNoCursor.id].formato}
                  rel={tempo - motionNoCursor.inicio}
                />
              ) : noCursor && (
                <>
                  <InsertNoLugar pedido={noCursor} banco={banco} tempo={tempo} tocando={player.tocando} fundo={ins?.fundo ?? 'gradiente'} trans={trans} />
                  {noCursor.tipo === 'comentario_insert_ator' && (
                    <CardComentario
                      c={comentarioDe(noCursor)}
                      texto={comentarioDe(noCursor).texto ?? noCursor.texto ?? ''}
                      mudar={(campos) => mudarComentario(noCursor.id, campos)}
                    />
                  )}
                </>
              )
            }
          />
          </div>
          {/* o espaço livre ao lado do vídeo: o fundo (do vídeo todo) e, nos comentários, o card do Instagram; a coluna
              inteira recolhe para o lado, numa faixa encostada no Enriquecimento */}
          {coluna ? (
            <div className="-mx-1 flex min-h-0 w-[268px] shrink-0 flex-col gap-3 overflow-y-auto px-1 py-0.5">
              <button
                onClick={() => setColuna(false)}
                className="flex items-center gap-1.5 self-end rounded-full px-2 py-1 text-[11px] text-fog hover:text-cream"
                title="Recolher para o lado"
              >
                Recolher <PanelRightClose className="size-3.5" />
              </button>
              {presetAberto && (
                <EditorPresetAberto
                  id={presetAberto}
                  ver={sel ? () => player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.max(sel.t.fim - 0.01, sel.t.inicio)), { pular: true, loop: false }) : undefined}
                />
              )}
              <Recolhivel chave="fundo" titulo="Fundo" resumo={<ResumoFundo id={ins?.fundo ?? 'gradiente'} />}>
                <EscolhaFundo atual={ins?.fundo ?? 'gradiente'} escolher={(f) => void definirFundo(projeto.id, f).then(setIns).catch(falhar)} />
              </Recolhivel>
              {sel?.tipo === 'comentario_insert_ator' && (
                <Recolhivel chave="comentario" titulo="Comentário" resumo={<span className="truncate text-[11.5px] text-fog">{comentarioDe(sel).texto ?? sel.texto}</span>}>
                  <PainelComentario c={comentarioDe(sel)} textoDirecao={sel.texto ?? ''} mudar={(campos) => mudarComentario(sel.id, campos)} />
                </Recolhivel>
              )}
            </div>
          ) : (
            <div className="-mr-6 -mt-5 -mb-3 flex w-9 shrink-0 flex-col items-center gap-1.5 border-l border-line-dark py-3">
              <button onClick={() => setColuna(true)} className="mb-1 grid size-7 place-items-center rounded-full text-fog hover:bg-cream/8 hover:text-cream" title="Abrir">
                <PanelRightOpen className="size-4" />
              </button>
              {/* recolhidos, os cards viram abas em pé (como os painéis recolhidos do Photoshop) */}
              {[...(presetAberto ? ['Preset'] : []), 'Fundo', ...(sel?.tipo === 'comentario_insert_ator' ? ['Comentário'] : [])].map((nome) => (
                <button
                  key={nome}
                  onClick={() => setColuna(true)}
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
                verEntrada={() =>
                  player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.min(sel.t.inicio + 1.6, sel.t.fim - 0.01)), { pular: true, loop: false })
                }
                ver={(lado, q) => trans && verTransicao(sel, lado, q)}
                trans={trans}
                presetAberto={presetAberto}
                abrirPreset={(id) => {
                  setPresetAberto(id)
                  if (id) setColuna(true)
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
                verEntrada={() => player.tocarTrecho(seq.saidaParaFonte(planoSel.inicio), seq.saidaParaFonte(Math.min(planoSel.inicio + 1.6, planoSel.fim - 0.01)), { pular: true, loop: false })}
                ver={() => {}}
                trans={trans}
              />
            ) : (
              <p className="text-[12.5px] leading-[1.7] text-fog">{planoSel ? 'Este plano não tem insert nem motion.' : 'Escolha um insert ou um motion na linha do tempo.'}</p>
            )}
          </div>
        </aside>
      </div>

      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        {buscandoRefs && <BuscarReferencias tipo={planoSel?.tipo ?? null} fechar={() => setBuscandoRefs(false)} />}
        {modalMotion && planoSel && ehMotion && (
          <ModalMotions
            projetoId={projeto.id}
            plano={planoSel}
            atual={motions[planoSel.id] ?? null}
            banco={banco}
            escolherDoBanco={(f) => setEscolhaBanco(() => f)}
            fechar={() => setModalMotion(false)}
            mudou={recarregarMotions}
          />
        )}
        {escolhaBanco && (
          <SeletorBanco
            fechar={() => setEscolhaBanco(null)}
            escolher={(i) => {
              escolhaBanco(i)
              setEscolhaBanco(null)
            }}
            mudou={() => void carregarBanco()}
          />
        )}
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
          motions={motions}
        />
      </div>
    </div>
  )
}

type Tamanhos = { esq: number; dir: number; linha: number }
const TAMANHOS_PADRAO: Tamanhos = { esq: 440, dir: 400, linha: 200 }
const LIMITES: Record<keyof Tamanhos, [number, number]> = { esq: [300, 760], dir: [300, 680], linha: [150, 420] }

/** Larguras dos cards e altura da linha do tempo, arrastáveis e lembradas neste navegador. */
function useTamanhos(): [Tamanhos, (lado: keyof Tamanhos, e: React.PointerEvent) => void] {
  const [tam, setTam] = useState<Tamanhos>(() => {
    try {
      return { ...TAMANHOS_PADRAO, ...JSON.parse(localStorage.getItem('inserts.tamanhos') ?? '{}') }
    } catch {
      return TAMANHOS_PADRAO
    }
  })
  const arrastar = (lado: keyof Tamanhos, e: React.PointerEvent) => {
    e.preventDefault()
    const inicio = lado === 'linha' ? e.clientY : e.clientX
    const base = tam[lado]
    let atual = tam
    const mover = (ev: PointerEvent) => {
      const d = (lado === 'linha' ? ev.clientY : ev.clientX) - inicio
      const v = base + (lado === 'esq' ? d : -d) // o card da direita e a linha do tempo crescem para o outro lado
      const [min, max] = LIMITES[lado]
      atual = { ...atual, [lado]: Math.round(Math.max(min, Math.min(max, v))) }
      setTam(atual)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      document.body.style.cursor = ''
      try {
        localStorage.setItem('inserts.tamanhos', JSON.stringify(atual))
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    }
    document.body.style.cursor = lado === 'linha' ? 'ns-resize' : 'ew-resize'
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  return [tam, arrastar]
}

/** A alça de uma borda arrastável (realça ao passar o mouse). */
function Alca({ lado, pos, arrastar }: { lado: keyof Tamanhos; pos: number | string; arrastar: (lado: keyof Tamanhos, e: React.PointerEvent) => void }) {
  const borda = typeof pos === 'number' ? `${pos}px` : pos
  const estilo: React.CSSProperties =
    lado === 'esq'
      ? { left: `calc(${borda} - 3px)`, top: 0, bottom: 0, width: 6 }
      : lado === 'dir'
        ? { right: `calc(${borda} - 3px)`, top: 0, bottom: 0, width: 6 }
        : { left: 0, right: 0, top: -3, height: 6 }
  return (
    <div
      onPointerDown={(e) => arrastar(lado, e)}
      className={cn('group absolute z-40', lado === 'linha' ? 'cursor-ns-resize' : 'cursor-ew-resize')}
      style={estilo}
      title="Arraste para ajustar"
    >
      <span className={cn('absolute bg-coral opacity-0 transition-opacity group-hover:opacity-100', lado === 'linha' ? 'inset-x-0 top-[2px] h-[2px]' : 'inset-y-0 left-[2px] w-[2px]')} />
    </div>
  )
}

/** O editor do preset com a engrenagem aberta, na coluna ao lado do vídeo. Assina os presets sozinho: mexer num slider
 *  redesenha só ele (e quem mostra o preset), não a etapa inteira. */
function EditorPresetAberto({ id, ver }: { id: string; ver?: () => void }) {
  const preset = usePresets()?.find((x) => x.id === id)
  if (!preset) return null
  return (
    <Recolhivel chave="preset" titulo="Preset">
      <EditorPreset preset={preset} ver={ver} />
    </Recolhivel>
  )
}

/** Um card que abre e fecha (lembrado), com o título e um resumo no cabeçalho. */
function Recolhivel(p: { chave: string; titulo: string; resumo?: ReactNode; children: ReactNode; fechado?: boolean }) {
  const { chave, titulo, resumo, children } = p
  const [aberto, setAberto] = useLembrado(`inserts.aberto.${chave}`, !p.fechado)
  return (
    <div className="shrink-0 rounded-[8px] bg-cream/[0.03] ring-1 ring-line-dark">
      <button onClick={() => setAberto(!aberto)} className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left">
        <span className="eyebrow shrink-0 text-sage">{titulo}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{resumo}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-fog transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function ResumoFundo({ id, so }: { id: string; so?: boolean }) {
  const f = FUNDOS.find((x) => x.id === id) ?? FUNDOS[4]
  return (
    <>
      <span className={cn('shrink-0 rounded-[3px] ring-1 ring-white/15', so ? 'h-4 w-4 rounded-full' : 'h-3.5 w-5')} style={{ background: f.amostra }} />
      {!so && <span className="truncate text-[11.5px] text-fog">{f.nome}</span>}
    </>
  )
}

/** O fundo atrás dos inserts com moldura, para o vídeo todo. */
function EscolhaFundo({ atual, escolher }: { atual: string; escolher: (f: string) => void }) {
  return (
    <div className="grid gap-2">
      <p className="text-[11px] leading-[1.5] text-fog">Vale para o vídeo todo, atrás dos inserts com moldura.</p>
      {[true, false].map((claro) => (
        <div key={String(claro)} className="grid grid-cols-3 gap-1.5">
          {FUNDOS.filter((x) => x.claro === claro).map((x) => (
            <button
              key={x.id}
              onClick={() => escolher(x.id)}
              className={cn('grid gap-1 rounded-[6px] p-1.5 text-[10px] ring-1 transition-colors', atual === x.id ? 'text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream')}
            >
              <span className="h-9 w-full rounded-[4px] ring-1 ring-white/10" style={{ background: x.amostra }} />
              {x.nome}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function Cabecalho({ icone: Icone, titulo, extra }: { icone: typeof Images; titulo: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line-dark px-4 py-2.5 text-[11px]">
      <Icone className="size-3.5 text-sage" />
      <span className="eyebrow text-sage">{titulo}</span>
      {extra}
    </div>
  )
}

function SemInsert({ plano }: { plano: ItemRef & { fala: string } }) {
  return (
    <div className="grid gap-3 text-[12.5px] leading-[1.7] text-fog">
      <span className="w-fit rounded-full bg-cream/10 px-2.5 py-1 text-[11px] font-semibold text-cream">{CATEGORIAS.planos[plano.tipo]}</span>
      <p>Este plano não tem insert{TEM_MOTION.includes(plano.tipo) ? ' (é um motion: veja a aba Motion)' : ''}.</p>
    </div>
  )
}

const ICONE: Record<string, typeof Square> = {
  tela_cheia: Maximize2,
  card: Square,
  janela_3d: Box,
  inclinado: RotateCw,
  destaque: Focus,
  metade: PanelTop,
  card_metade: Square,
  janela_3d_metade: Box,
  mesclada: Blend,
  sem: Ban,
  surgir: Sparkles,
  deslizar: MoveRight,
  subir: MoveUp,
  voo_3d: Plane,
  zoom_borrado: ZoomIn,
  seco_zoom: Expand,
  parado: Pause,
  zoom_lento: ZoomIn,
  zoom_ponto: Crosshair,
  rolagem: ArrowDownToLine,
  corte: Scissors,
  sumir: EyeOff,
}

/** O desenho de como 2 mídias convivem: a 1ª (clara) e a 2ª (coral) num quadro 9:16. */
function IconeDupla({ tipo }: { tipo: string }) {
  const a = 'fill-cream/35'
  const b = 'fill-coral'
  return (
    <svg viewBox="0 0 18 32" className="h-7 w-auto" aria-hidden>
      <rect x="0.5" y="0.5" width="17" height="31" rx="2" className="fill-none stroke-current opacity-40" />
      {tipo === 'sequencia' && (
        <>
          <rect x="3" y="6" width="9" height="16" rx="1.5" className={a} />
          <rect x="6" y="10" width="9" height="16" rx="1.5" className={b} />
        </>
      )}
      {tipo === 'empilhadas' && (
        <>
          <rect x="3" y="3" width="12" height="12" rx="1.5" className={a} />
          <rect x="3" y="17" width="12" height="12" rx="1.5" className={b} />
        </>
      )}
      {tipo === 'lado_a_lado' && (
        <>
          <rect x="2" y="7" width="6.5" height="18" rx="1.5" className={a} />
          <rect x="9.5" y="7" width="6.5" height="18" rx="1.5" className={b} />
        </>
      )}
    </svg>
  )
}

/** Uma grade de opções de uma categoria; ★ marca o estilo do tipo. */
function Grade(p: {
  titulo: ReactNode
  opcoes: string[]
  valor: string
  estilo: string
  escolher: (o: string) => void
  travado?: boolean
  dupla?: boolean
  /** A engrenagem na opção escolhida (as que têm o que configurar): aberta ou não, e alternar. */
  engrenagem?: { tem: (o: string) => boolean; aberta: boolean; alternar: () => void }
}) {
  return (
    <div className="grid gap-2">
      <div className="eyebrow text-sage">{p.titulo}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {p.opcoes.map((o) => {
          const Icone = ICONE[o] ?? Sparkles
          const ativo = p.valor === o
          return (
            <button
              key={o}
              onClick={() => p.escolher(o)}
              disabled={p.travado}
              className={cn(
                'relative grid place-items-center gap-1.5 rounded-[6px] px-1.5 py-2.5 text-center text-[10.5px] leading-tight ring-1 transition-colors',
                ativo ? 'bg-cream/10 text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream hover:ring-cream/40',
              )}
            >
              {o === p.estilo && <span className="absolute top-1 right-1.5 text-[9px] text-yellow">★</span>}
              {ativo && p.engrenagem?.tem(o) && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    p.engrenagem!.alternar()
                  }}
                  className={cn('absolute top-1 left-1 grid size-5 place-items-center rounded-full transition-colors', p.engrenagem.aberta ? 'bg-coral text-cream' : 'text-fog hover:bg-cream/10 hover:text-cream')}
                  title="Configurar esta transição (vale para todos os inserts)"
                  aria-label="Configurar"
                >
                  <Settings2 className="size-3.5" />
                </span>
              )}
              {p.dupla ? <IconeDupla tipo={o} /> : <Icone className="size-4" />}
              {NOMES[o]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A "entrada e saída" de uma mídia: o toggle Entrada | Saída, a grade e a engrenagem da opção escolhida. */
function EntradaESaida(p: {
  pedido: Pedido
  qual: Qual
  dupla: boolean
  banco?: Map<string, ItemBanco>
  trans: Transicoes | null
  escolher: (k: Categoria) => (o: string) => void
  ver: (lado: Lado) => void
  travado: boolean
}) {
  const [lado, setLado] = useState<Lado>('entrada')
  const [aberta, setAberta] = useState(false)
  const e = enriquecimentoDe(p.pedido)
  const k = campo(lado, p.qual)
  const valor = lado === 'entrada' ? entradaDe(e, p.qual) : saidaDe(e, p.qual)
  const m = p.pedido.midias[p.qual - 1]
  const cfg = p.trans?.[lado][valor]
  return (
    <div className="grid gap-2">
      <Grade
        titulo={
          <div className="flex items-center gap-2">
            Entrada e saída{p.dupla && ` · ${p.qual}ª mídia`}
            {p.dupla && m && <img src={urlBancoMiniatura(m.banco)} alt="" title={p.banco?.get(m.banco)?.nome} className="h-5 w-8 rounded-full object-cover" />}
            <div className="ml-auto flex rounded-full p-0.5 tracking-normal normal-case ring-1 ring-line-dark" role="tablist">
              {(['entrada', 'saida'] as Lado[]).map((l) => (
                <button
                  key={l}
                  role="tab"
                  aria-selected={lado === l}
                  onClick={() => {
                    setLado(l)
                    setAberta(false)
                  }}
                  className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', lado === l ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
                >
                  {l === 'entrada' ? 'Entrada' : 'Saída'}
                </button>
              ))}
            </div>
          </div>
        }
        opcoes={OPCOES[k][p.pedido.formato]}
        valor={valor}
        estilo={ESTILO[p.pedido.formato][k]}
        escolher={p.escolher(k)}
        travado={p.travado}
        engrenagem={{ tem: (o) => !!p.trans?.[lado][o], aberta, alternar: () => setAberta((v) => !v) }}
      />
      {aberta && cfg && <ConfigTransicao lado={lado} tipo={valor} cfg={cfg} ver={() => p.ver(lado)} />}
    </div>
  )
}

/** Enriquecimento: com 1 mídia, layout e "entrada e saída"; com 2, como as duas convivem (e a moldura, na sequência) e a
 *  entrada e a saída de cada uma. ★ marca o estilo do tipo; o pedido guarda só o que difere. A engrenagem da transição
 *  escolhida configura aquele tipo para todos os inserts (curva, duração, direção…). */
function PainelEnriquecimento(p: {
  pedido: Pedido
  banco?: Map<string, ItemBanco>
  mudar: (c: Record<string, string | number | number[] | null>) => void
  aplicarAoTipo: () => void
  verEntrada: () => void
  /** Toca a entrada ou a saída de uma mídia (o "▶ Ver" da engrenagem). */
  ver: (lado: Lado, qual: Qual) => void
  trans: Transicoes | null
  /** O preset com a engrenagem aberta (o editor fica na coluna ao lado do vídeo) e como abrir/fechar. */
  presetAberto?: string | null
  abrirPreset?: (id: string | null) => void
  fundo?: string
  /** Só para ver as opções (motions): o aviso aparece em cima e nada é salvo. */
  aviso?: string
}) {
  const x = p.pedido
  const presets = usePresets()
  const [verTodos, setVerTodos] = useState(false)
  const opcoesPreset = presetsPara(presets, x.formato, x.midias.length, !verTodos)
  const idsMidias = useMemo(() => x.midias.map((m) => m.banco), [x.midias])
  const presetAtual = presetDe(x, presets)
  const [sobre, setSobre] = useState<string | null>(null)
  const e = enriquecimentoDe(x)
  const estilo = ESTILO[x.formato]
  const mudado = Object.keys(x.enriquecimento ?? {}).length > 0
  const nomeTipo = NOME_TIPO[x.tipo] ?? CATEGORIAS.planos[x.tipo] ?? x.tipo
  const dupla = x.midias.length === 2
  // escolher uma opção manual tira o preset (ele mandava em tudo)
  const escolher = (k: Categoria) => (o: string) => p.mudar({ [k]: o === estilo[k] ? null : o, ...(presetAtual ? { preset: null } : {}) })
  return (
    <div className="grid gap-5">
      {p.aviso && <p className="rounded-[6px] border border-dashed border-yellow/40 px-3 py-2 text-[11.5px] leading-[1.6] text-yellow/90">{p.aviso}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', x.formato === 'vertical' ? 'bg-blue text-cream' : 'bg-mint text-ink')}>{nomeTipo}</span>
        <span className="text-[12px] text-fog tabular-nums">
          {tempoBR(x.t.inicio)} · {s1(x.t.fim - x.t.inicio)} s
        </span>
        <button onClick={p.verEntrada} className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[11px] text-fog hover:text-cream">
          <Play className="size-3 fill-current" /> Ver a entrada
        </button>
      </div>
      <p className="text-[11.5px] leading-[1.6] text-fog">
        {dupla
          ? 'Com 2 mídias: como as duas convivem e a entrada e a saída de cada uma. Onde a 2ª começa se ajusta arrastando na trilha Mídias, lá embaixo.'
          : `Como este ${p.aviso ? 'motion' : 'insert'} aparece: layout, entrada e saída.`}{' '}
        ★ é o estilo de “{nomeTipo}”. A engrenagem configura a transição escolhida para todos os inserts.
      </p>
      {!p.aviso && x.midias.length > 0 && (
        <div className="grid gap-2">
          <div className="eyebrow flex items-center text-sage">
            Presets {x.midias.length > 1 && `· ${x.midias.length} mídias`}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 tracking-normal normal-case text-fog">
              <input type="checkbox" checked={verTodos} onChange={(ev) => setVerTodos(ev.target.checked)} /> ver os não aprovados
            </label>
          </div>
          {opcoesPreset.length ? (
            <div className="grid grid-cols-3 gap-2">
              {opcoesPreset.map((pr) => {
                const ativo = presetAtual?.id === pr.id
                return (
                  <div key={pr.id} className="relative" onMouseEnter={() => setSobre(pr.id)} onMouseLeave={() => setSobre(null)}>
                    <button
                      onClick={() => p.mudar({ preset: ativo ? null : pr.id })}
                      className={cn('grid w-full gap-1 rounded-[6px] p-1 text-left ring-1 transition-colors', ativo ? 'bg-cream/10 ring-2 ring-coral' : 'ring-line-dark hover:ring-cream/40')}
                      title={pr.nome}
                    >
                      <MiniPreset receita={pr.receita} midias={idsMidias} fundo={p.fundo ?? 'gradiente'} tocar={sobre === pr.id || ativo} className="rounded-[4px]" />
                      <span className="line-clamp-2 px-0.5 text-[10px] leading-tight text-fog">
                        {!pr.aprovado && <span className="text-yellow">● </span>}
                        {pr.nome}
                      </span>
                    </button>
                    <button
                      onClick={() => p.abrirPreset?.(p.presetAberto === pr.id ? null : pr.id)}
                      className={cn('absolute top-2 left-2 grid size-6 place-items-center rounded-full transition-colors', p.presetAberto === pr.id ? 'bg-coral text-cream' : 'bg-ink/70 text-fog hover:text-cream')}
                      title="Configurar este preset (vale para todos os inserts)"
                      aria-label="Configurar"
                    >
                      <Settings2 className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[11.5px] leading-[1.6] text-fog">
              Nenhum preset aprovado para {x.midias.length} mídia{x.midias.length > 1 ? 's' : ''} neste formato. Os presets saem das referências favoritas, na página{' '}
              <Link to="/presets" className="text-yellow hover:underline">
                Presets
              </Link>
              .
            </p>
          )}
        </div>
      )}
      <details open={!presetAtual} className="group grid gap-5">
        <summary className="eyebrow cursor-pointer list-none text-sage">{presetAtual ? '▸ Personalizar (tira o preset)' : 'Personalizar'}</summary>
        <div className="mt-3 grid gap-5">
          {dupla && <Grade titulo="Layout das duas" opcoes={OPCOES.entre[x.formato]} valor={e.entre} estilo={estilo.entre} escolher={escolher('entre')} travado={!!p.aviso} dupla />}
          {(!dupla || e.entre === 'sequencia') && (
            <Grade titulo={dupla ? 'Moldura' : 'Layout'} opcoes={OPCOES.layout[x.formato]} valor={e.layout} estilo={estilo.layout} escolher={escolher('layout')} travado={!!p.aviso} />
          )}
          {(dupla ? ([1, 2] as Qual[]) : ([1] as Qual[])).map((q) => (
            <EntradaESaida
              key={q}
              pedido={x}
              qual={q}
              dupla={dupla}
              banco={p.banco}
              trans={p.trans}
              escolher={escolher}
              ver={(lado) => p.ver(lado, q)}
              travado={!!p.aviso}
            />
          ))}
        </div>
      </details>
      <div className={cn('flex flex-wrap gap-2 border-t border-line-dark pt-4 text-[11px]', p.aviso && 'hidden')}>
        <button onClick={() => p.mudar({ layout: null, entrada: null, entrada_2: null, saida: null, saida_2: null, entre: null, corte: null, preset: null })} disabled={!mudado} className={cn(BOTAO, 'disabled:opacity-40')}>
          <RotateCcw className="size-3" /> Voltar ao estilo
        </button>
        <button onClick={p.aplicarAoTipo} className={BOTAO} title={`Copia este enriquecimento para todos os planos “${nomeTipo}”`}>
          <Copy className="size-3" /> Aplicar a todos “{nomeTipo}”
        </button>
      </div>
    </div>
  )
}

function Detalhe(p: {
  pedido: Pedido
  banco: Map<string, ItemBanco>
  subindo: boolean
  projetoId: string
  capturou: (r: InsertsProjeto) => void
  salvar: (midias: NovaMidia[]) => Promise<unknown>
  subir: (arquivos: File[]) => Promise<ItemBanco[]>
  bancoMudou: () => void
  ver: () => void
}) {
  const x = p.pedido
  const [escolhendo, setEscolhendo] = useState(false)
  // editor de vídeo: o que está aberto e os próximos (vídeos recém-subidos abrem um depois do outro)
  const [editando, setEditando] = useState<string[]>([])
  const [doBanco, setDoBanco] = useState(false) // o editor aberto veio do "Escolher do banco" (dá para voltar)
  const subir = (arquivos: File[]) =>
    void p.subir(arquivos).then((novos) => setEditando((f) => [...f, ...novos.filter((n) => n.tipo === 'video').map((n) => n.id)]))
  /** O editor devolve os itens a ligar (trechos ou o original): eles entram no lugar das mídias do mesmo vídeo. */
  const aplicarEdicao = (original: string, ids: string[], apagados: string[]) => {
    const doVideo = (b: string) => b === original || p.banco.get(b)?.pai === original || apagados.includes(b)
    const pos = x.midias.findIndex((m) => doVideo(m.banco))
    const resto = x.midias.filter((m) => !doVideo(m.banco))
    const novos = ids.map((id) => x.midias.find((m) => m.banco === id) ?? { banco: id })
    const corte = pos < 0 ? resto.length : x.midias.slice(0, pos).filter((m) => !doVideo(m.banco)).length
    void p.salvar([...resto.slice(0, corte), ...novos, ...resto.slice(corte)])
    setEditando((f) => f.slice(1))
    setDoBanco(false)
  }
  const [capturando, setCapturando] = useState(false)
  const capturas = x.capturas ?? []
  const semHttp = (u: string) => u.replace(/^https?:\/\//, '')
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const mover = (k: number, d: number) => {
    const l = [...x.midias]
    const [m] = l.splice(k, 1)
    l.splice(k + d, 0, m)
    void p.salvar(l)
  }
  return (
    <div
      className={cn('grid gap-4 rounded-[6px]', arrastando && 'ring-2 ring-coral ring-offset-4 ring-offset-transparent')}
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        subir([...e.dataTransfer.files])
      }}
    >
      <input
        ref={entrada}
        type="file"
        multiple
        hidden
        accept={ACEITA}
        onChange={(e) => {
          subir([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', x.formato === 'vertical' ? 'bg-blue text-cream' : 'bg-mint text-ink')}>
          {NOME_TIPO[x.tipo] ?? x.tipo}
        </span>
        <span className="text-[12px] text-fog tabular-nums">
          {tempoBR(x.t.inicio)} → {tempoBR(x.t.fim)} · {s1(x.t.fim - x.t.inicio)} s
        </span>
        <button onClick={p.ver} className="ml-auto rounded-full border border-line-dark px-2.5 py-1 text-[11px] text-fog hover:text-cream">
          ▶ Ver trecho
        </button>
      </div>
      <p className="border-l-2 border-line-dark pl-3 text-[12.5px] leading-[1.6] text-cream/90">“{x.fala}”</p>
      {x.descricao ? (
        <Campo rotulo="O que acontece no insert">{x.descricao}</Campo>
      ) : (
        <p className="text-[11.5px] text-fog">A direção não descreveu este insert.</p>
      )}

      <div className="grid gap-2">
        <p className="eyebrow text-fog">
          Mídias deste insert ({x.midias.length}){p.subindo && <span className="text-yellow"> · subindo…</span>}
        </p>
        {x.midias.map((m, k) => (
          <MidiaCard
            key={m.id}
            m={m}
            item={p.banco.get(m.banco)}
            editar={() => setEditando((f) => [m.banco, ...f])}
            subir={k > 0 ? () => mover(k, -1) : undefined}
            descer={k < x.midias.length - 1 ? () => mover(k, 1) : undefined}
            tirar={() => void p.salvar(x.midias.filter((_, j) => j !== k))}
          />
        ))}
        {!x.midias.length && <p className="text-[11.5px] text-fog">Nenhuma ainda. Arraste arquivos para este painel, ou use os botões.</p>}
        <div className="flex gap-2 text-[11px]">
          <button onClick={() => entrada.current?.click()} disabled={p.subindo} className="flex items-center gap-1 rounded-full bg-coral px-3 py-1 font-semibold text-cream hover:bg-coral/90 disabled:opacity-50">
            <Upload className="size-3" /> {x.midias.length ? '+ outra mídia' : 'Subir mídia'}
          </button>
          <button onClick={() => setEscolhendo(true)} className={BOTAO}>
            <Library className="size-3" /> Escolher do banco
          </button>
          <button onClick={() => setCapturando(true)} className={BOTAO}>
            <Globe className="size-3" /> Capturar site
          </button>
        </div>
        {capturas.map((c) => (
          <p key={c.id} className={cn('text-[11.5px]', c.status === 'erro' ? 'text-coral' : c.status === 'pronto' ? 'text-mint' : 'text-yellow')}>
            {c.status === 'fila'
              ? `Na fila: ${semHttp(c.url)}`
              : c.status === 'rodando'
                ? `Capturando ${semHttp(c.url)} · dobra ${Math.min(c.feitas + 1, c.dobras.length)} de ${c.dobras.length}…`
                : c.status === 'pronto'
                  ? `Capturado: ${semHttp(c.url)}`
                  : `A captura de ${semHttp(c.url)} falhou: ${c.erro}`}
          </p>
        ))}
      </div>

      {capturando && (
        <CapturaDeSite
          projetoId={p.projetoId}
          pedido={x}
          fechar={() => setCapturando(false)}
          pronto={(r) => {
            p.capturou(r)
            setCapturando(false)
          }}
        />
      )}

      {escolhendo && (
        <SeletorBanco
          mudou={p.bancoMudou}
          fechar={() => setEscolhendo(false)}
          escolher={(item) => {
            // um vídeo original abre no editor (para escolher os trechos); trecho ou imagem entram direto
            if (item.tipo === 'video' && !item.pai) {
              setEditando((f) => [item.id, ...f])
              setDoBanco(true)
            }
            else void p.salvar([...x.midias, { banco: item.id }])
            setEscolhendo(false)
          }}
        />
      )}

      {editando.length > 0 && (
        <EditorVideo
          key={editando[0]}
          bid={editando[0]}
          ligados={x.midias.map((m) => m.banco)}
          mudou={p.bancoMudou}
          aplicar={aplicarEdicao}
          fechar={() => {
            setEditando((f) => f.slice(1))
            setDoBanco(false)
          }}
          voltar={
            doBanco
              ? () => {
                  setEditando((f) => f.slice(1))
                  setDoBanco(false)
                  setEscolhendo(true)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="eyebrow text-fog">{rotulo}</p>
      <p className="text-[12.5px] leading-[1.6] text-cream/85">{children}</p>
    </div>
  )
}
