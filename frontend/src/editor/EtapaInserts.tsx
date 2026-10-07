import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Ban,
  Blend,
  Box,
  Clapperboard,
  Columns2,
  Copy,
  Crosshair,
  EyeOff,
  Focus,
  Globe,
  Grid2x2,
  Image as IconeImagem,
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
  Rows2,
  Scissors,
  Shuffle,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Video,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  NOME_TIPO_MIDIA,
  apagarItemBanco,
  PROPORCOES_CAPTURA,
  capturarSite,
  definirMidias,
  enriquecerInsert,
  enriquecerTipo,
  lerInserts,
  listarBanco,
  previaSite,
  subirNoBanco,
  tempoBR,
  urlBancoArquivo,
  urlBancoMiniatura,
  urlPreviaSite,
  versaoBanco,
  type DadosEditor,
  type InsertsProjeto,
  type ItemBanco,
  type ItemRef,
  type MidiaLigada,
  type PedidoInsert,
  type PreviaSite,
  type ProporcaoCaptura,
  type TipoMidia,
} from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { paraTempo, palavrasNaSaida } from './direcaoProjeto'
import { CATEGORIAS } from './EtapaDirecao'
import EditorVideo from './EditorVideo'
import LinhaInserts from './LinhaInserts'
import { CATEGORIAS_ENRIQUECIMENTO, ESTILO, NOMES, OPCOES, enriquecimentoDe, type Categoria, type Enriquecimento } from './enriquecimento'
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
type Pedido = PedidoInsert & { t: { inicio: number; fim: number } }
type NovaMidia = Omit<MidiaLigada, 'id'> & { id?: string }

const NOME_TIPO: Record<string, string> = {
  insert_tela_cheia: 'Tela cheia',
  tela_dividida_insert: 'Tela dividida',
  comentario_insert_ator: 'Comentário + insert',
}
const TEM_MOTION = ['motion_tela_cheia', 'tela_dividida_motion']
const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'
const s1 = (t: number) => t.toFixed(1).replace('.', ',')
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
  const falhar = (e: unknown) => window.alert((e as Error).message)

  // o mapa tem os originais e os trechos (um trecho toca o arquivo do original, do início ao fim dele)
  const carregarBanco = () => listarBanco().then((l) => setBanco(new Map(l.flatMap((i) => [i, ...(i.trechos ?? [])]).map((i) => [i.id, i]))))
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
  const tempos = useMemo(() => new Map(planos.map((i) => [i.id, { inicio: i.inicio, fim: i.fim }])), [planos])
  const pedidos: Pedido[] = useMemo(
    () =>
      (ins?.pedidos ?? [])
        .map((x) => ({ ...x, t: tempos.get(x.plano) ?? { inicio: x.inicio, fim: x.inicio + x.duracao } }))
        .sort((a, b) => a.t.inicio - b.t.inicio),
    [ins, tempos],
  )
  const tempo = player.tempo
  const noCursor = pedidos.find((x) => tempo >= x.t.inicio && tempo < x.t.fim) ?? null
  const planoNoCursor = planos.find((pl) => tempo >= pl.inicio && tempo < pl.fim) ?? null

  // a seleção é o plano sob o cursor da linha do tempo (tocando, parado ou arrastando): os cards mostram onde se está
  useEffect(() => {
    if (planoNoCursor) setSelPlano(planoNoCursor.id)
  }, [planoNoCursor?.id])

  // tela dividida com mídia: o ator desce para a metade de baixo (o centro do quadro no meio da metade de baixo)
  const dividida = !!noCursor && noCursor.formato === 'dividida' && noCursor.midias.length > 0
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
  const ehMotion = !!planoSel && TEM_MOTION.includes(planoSel.tipo)
  const comMidia = pedidos.filter((x) => x.midias.length).length
  /** Seleciona o plano e leva a prévia até ele, já depois da entrada, para o insert aparecer inteiro. */
  const escolher = (plano: string) => {
    setSelPlano(plano)
    const pl = planos.find((x) => x.id === plano)
    if (pl) player.buscar(Math.min(pl.inicio + 0.6, (pl.inicio + pl.fim) / 2))
  }

  const pedidosPorPlano = useMemo(() => new Map(pedidos.map((x) => [x.plano, x])), [pedidos])
  const planosLinha = useMemo(() => planos.map((pl, k) => ({ ...pl, n: k + 1 })), [planos])
  const elementos = useMemo(() => itens.filter((i) => i.camada === 'elemento'), [itens])
  const nomes = { ...CATEGORIAS.planos, ...CATEGORIAS.elementos }
  const [tam, arrastarBorda] = useTamanhos()
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
                <Link to="/banco" className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-fog hover:text-cream">
                  <Library className="size-3" /> Banco
                </Link>
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
                <div className="grid place-items-center gap-2 rounded-[8px] border border-dashed border-yellow/40 px-4 py-10 text-center text-[12.5px] text-fog">
                  <Clapperboard className="size-6 text-yellow" />
                  Criação de motions em construção.
                </div>
              </div>
            ) : (
              <SemInsert plano={planoSel} />
            )}
          </div>
        </aside>

        {/* vídeo com o insert no lugar (o enriquecimento aproximado) */}
        <section className="flex min-h-0 min-w-0 flex-col px-6 pt-5 pb-3">
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
            sobreposicao={noCursor && <InsertNoLugar pedido={noCursor} banco={banco} tempo={tempo} tocando={player.tocando} />}
          />
        </section>

        {/* à direita: o enriquecimento do plano (inserts e motions) */}
        <aside className="flex min-h-0 min-w-0 flex-col border-l border-line-dark text-cream">
          <Cabecalho icone={Wand2} titulo="Enriquecimento" />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {sel ? (
              <PainelEnriquecimento
                key={sel.id}
                pedido={sel}
                mudar={(campos) => void enriquecerInsert(projeto.id, sel.id, campos).then(setIns).catch(falhar)}
                aplicarAoTipo={() => void enriquecerTipo(projeto.id, sel.id).then(setIns).catch(falhar)}
                verEntrada={() =>
                  player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.min(sel.t.inicio + 1.6, sel.t.fim - 0.01)), { pular: true, loop: false })
                }
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
              />
            ) : (
              <p className="text-[12.5px] leading-[1.7] text-fog">{planoSel ? 'Este plano não tem insert nem motion.' : 'Escolha um insert ou um motion na linha do tempo.'}</p>
            )}
          </div>
        </aside>
      </div>

      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
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
  mola: Activity,
  girar: RotateCw,
  voo_3d: Plane,
  zoom_borrado: ZoomIn,
  sequencia_corte: Scissors,
  sequencia_transicao: Shuffle,
  lado_a_lado: Columns2,
  grade: Grid2x2,
  empilhadas: Rows2,
  parado: Pause,
  zoom_lento: ZoomIn,
  zoom_ponto: Crosshair,
  rolagem: ArrowDownToLine,
  corte: Scissors,
  sumir: EyeOff,
}

/** Enriquecimento (mock): grades de opções por categoria; ★ marca o estilo do tipo. O pedido guarda só o que difere. */
function PainelEnriquecimento(p: {
  pedido: Pedido
  mudar: (c: Record<string, string | null>) => void
  aplicarAoTipo: () => void
  verEntrada: () => void
  /** Só para ver as opções (motions): o aviso aparece em cima e nada é salvo. */
  aviso?: string
}) {
  const x = p.pedido
  const e = enriquecimentoDe(x)
  const estilo = ESTILO[x.formato]
  const mudado = Object.keys(x.enriquecimento ?? {}).length > 0
  const nomeTipo = NOME_TIPO[x.tipo] ?? CATEGORIAS.planos[x.tipo] ?? x.tipo
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
        Como este {p.aviso ? 'motion' : 'insert'} aparece. ★ é o estilo de “{nomeTipo}”; mude só o que quiser. Por ora a prévia aproxima layout, entrada, saída e como as mídias se
        combinam.
      </p>
      {CATEGORIAS_ENRIQUECIMENTO.map((c) => (
        <div key={c.id} className="grid gap-2">
          <p className="eyebrow text-sage">
            {c.nome}
            {c.dica && <span className="ml-2 tracking-normal normal-case text-fog/70">{c.dica}</span>}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {OPCOES[c.id as Categoria][x.formato].map((o) => {
              const Icone = ICONE[o] ?? Sparkles
              const ativo = e[c.id as Categoria] === o
              return (
                <button
                  key={o}
                  onClick={() => p.mudar({ [c.id]: o === estilo[c.id as Categoria] ? null : o })}
                  disabled={!!p.aviso}
                  className={cn(
                    'relative grid place-items-center gap-1.5 rounded-[6px] px-1.5 py-2.5 text-center text-[10.5px] leading-tight ring-1 transition-colors',
                    ativo ? 'bg-cream/10 text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream hover:ring-cream/40',
                  )}
                >
                  {o === estilo[c.id as Categoria] && <span className="absolute top-1 right-1.5 text-[9px] text-yellow">★</span>}
                  <Icone className="size-4" />
                  {NOMES[o]}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className={cn('flex flex-wrap gap-2 border-t border-line-dark pt-4 text-[11px]', p.aviso && 'hidden')}>
        <button
          onClick={() => p.mudar(Object.fromEntries(CATEGORIAS_ENRIQUECIMENTO.map((c) => [c.id, null])))}
          disabled={!mudado}
          className={cn(BOTAO, 'disabled:opacity-40')}
        >
          <RotateCcw className="size-3" /> Voltar ao estilo
        </button>
        <button onClick={p.aplicarAoTipo} className={BOTAO} title={`Copia este enriquecimento para todos os planos “${nomeTipo}”`}>
          <Copy className="size-3" /> Aplicar a todos “{nomeTipo}”
        </button>
      </div>
    </div>
  )
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const limite = (v: number) => Math.max(0, Math.min(1, v))

/** Entrada e saída do insert (aproximadas): transform, opacidade e desfoque conforme o tempo dentro do plano. */
function estiloDeEntradaESaida(e: Enriquecimento, rel: number, dur: number): React.CSSProperties {
  const pe = ease(limite(rel / 0.5))
  const ps = e.saida === 'corte' ? 1 : limite((dur - rel) / 0.35)
  const t: string[] = []
  let opacidade = 1
  let filtro = ''
  switch (e.entrada) {
    case 'surgir':
      opacidade = pe
      t.push(`scale(${0.94 + 0.06 * pe})`)
      break
    case 'deslizar':
      opacidade = pe
      t.push(`translateX(${(1 - pe) * 60}%)`)
      break
    case 'subir':
      opacidade = pe
      t.push(`translateY(${(1 - pe) * 40}%)`)
      break
    case 'mola': {
      const v = limite(rel / 0.6) - 1
      const back = 1 + 2.70158 * v ** 3 + 1.70158 * v ** 2
      t.push(`scale(${0.6 + 0.4 * back})`)
      break
    }
    case 'girar':
      opacidade = pe
      t.push(`rotate(${(1 - pe) * -25}deg) scale(${0.8 + 0.2 * pe})`)
      break
    case 'voo_3d':
      opacidade = pe
      t.push(`perspective(800px) rotateX(${(1 - pe) * 55}deg) translateY(${(1 - pe) * 30}%)`)
      break
    case 'zoom_borrado':
      opacidade = pe
      t.push(`scale(${1.25 - 0.25 * pe})`)
      filtro = `blur(${(1 - pe) * 14}px)`
      break
  }
  if (e.saida === 'sumir') opacidade *= ps
  if (e.saida === 'deslizar') t.push(`translateX(${-(1 - ps) * 60}%)`)
  return { transform: t.join(' ') || undefined, opacity: opacidade, filter: filtro || undefined }
}

/** Um vídeo do banco sincronizado com o tempo do plano (um trecho toca o original do início ao fim dele). */
function VideoNoTempo({ item, rel, tocando, estilo }: { item: ItemBanco; rel: number; tocando: boolean; estilo?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null)
  const alvo = Math.min((item.inicio ?? 0) + rel, item.fim ?? Infinity)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (Math.abs(v.currentTime - alvo) > (tocando ? 0.3 : 0.03)) v.currentTime = alvo
    if (tocando && v.paused) void v.play().catch(() => {})
    if (!tocando && !v.paused) v.pause()
  })
  return <video ref={ref} src={urlBancoArquivo(item.id) + versaoBanco(item)} muted playsInline preload="auto" className="size-full object-cover" style={estilo} />
}

/** As mídias do insert do momento por cima do vídeo, com o enriquecimento aproximado: layout, entrada e saída, como as
 *  mídias se combinam e o movimento. */
function InsertNoLugar({ pedido, banco, tempo, tocando }: { pedido: Pedido; banco: Map<string, ItemBanco>; tempo: number; tocando: boolean }) {
  const e = enriquecimentoDe(pedido)
  const n = pedido.midias.length
  const dur = Math.max(pedido.t.fim - pedido.t.inicio, 0.01)
  const rel = Math.max(tempo - pedido.t.inicio, 0)
  const caixa = pedido.formato === 'vertical' ? 'inset-0' : 'inset-x-0 top-0 h-1/2'
  if (!n) return <div className={cn('pointer-events-none absolute grid place-items-center bg-black/55 p-6 text-center text-[12px] text-cream/80', caixa)}>Insert sem mídia</div>

  // movimento da mídia (dentro do layout)
  const movimento = (item?: ItemBanco): React.CSSProperties =>
    e.movimento === 'zoom_lento'
      ? { transform: `scale(${1 + 0.06 * (rel / dur)})` }
      : e.movimento === 'zoom_ponto'
        ? { transform: `scale(${1 + 0.25 * limite((rel / dur) * 2)})`, transformOrigin: '50% 35%' }
        : e.movimento === 'rolagem' && item?.tipo === 'imagem'
          ? { objectPosition: `50% ${(rel / dur) * 100}%` }
          : {}
  const midia = (m: MidiaLigada, relM: number, extra?: React.CSSProperties) => {
    const item = banco.get(m.banco)
    const estilo = { ...movimento(item), ...extra }
    return item?.tipo === 'video' ? (
      <VideoNoTempo key={m.id} item={item} rel={relM} tocando={tocando} estilo={estilo} />
    ) : (
      <img key={m.id} src={urlBancoArquivo(m.banco)} alt="" className="size-full object-cover" style={estilo} />
    )
  }

  // como as mídias se combinam
  const parte = dur / n
  const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0)
  let conteudo: ReactNode
  if (n === 1 || e.entre === 'sequencia_corte') conteudo = midia(pedido.midias[k], rel - k * parte)
  else if (e.entre === 'sequencia_transicao') {
    const prox = Math.min(k + 1, n - 1)
    const mistura = prox !== k ? limite((rel - (k + 1) * parte + 0.25) / 0.25) : 0
    conteudo = (
      <div className="relative size-full">
        <div className="absolute inset-0">{midia(pedido.midias[k], rel - k * parte)}</div>
        {mistura > 0 && <div className="absolute inset-0" style={{ opacity: mistura }}>{midia(pedido.midias[prox], 0)}</div>}
      </div>
    )
  } else
    conteudo = (
      <div className={cn('grid size-full gap-1 bg-black', e.entre === 'lado_a_lado' ? 'grid-flow-col auto-cols-fr' : e.entre === 'grade' ? 'grid-cols-2' : 'grid-flow-row auto-rows-fr')}>
        {pedido.midias.map((m) => (
          <div key={m.id} className="min-h-0 overflow-hidden">
            {midia(m, rel)}
          </div>
        ))}
      </div>
    )

  // layout (moldura) + entrada e saída
  const animacao = estiloDeEntradaESaida(e, rel, dur)
  const fundo = 'bg-gradient-to-b from-[#24423b] via-[#13201d] to-[#0b1412]'
  const emCard = ['card', 'card_metade', 'janela_3d', 'janela_3d_metade', 'inclinado', 'destaque'].includes(e.layout)
  const moldura: React.CSSProperties =
    e.layout === 'janela_3d' || e.layout === 'janela_3d_metade'
      ? { transform: 'perspective(900px) rotateY(-14deg) rotateX(6deg)' }
      : e.layout === 'inclinado'
        ? { transform: 'rotate(-4deg) scale(0.94)' }
        : {}
  return (
    <div
      className={cn('pointer-events-none absolute overflow-hidden', caixa, emCard ? fundo : 'bg-black')}
      style={e.layout === 'mesclada' ? { WebkitMaskImage: 'linear-gradient(to bottom, black 62%, transparent)', maskImage: 'linear-gradient(to bottom, black 62%, transparent)' } : undefined}
    >
      {e.layout === 'destaque' && (
        <div className="absolute inset-0 scale-125 opacity-60 blur-2xl">{midia(pedido.midias[k], rel - k * parte)}</div>
      )}
      <div className={cn('absolute', emCard ? (e.layout === 'destaque' ? 'inset-[12%]' : 'inset-[8%]') : 'inset-0')} style={animacao}>
        <div className={cn('size-full overflow-hidden', emCard && 'rounded-[14px] shadow-[0_18px_40px_#0009] ring-1 ring-white/10')} style={moldura}>
          {conteudo}
        </div>
      </div>
      {pedido.tipo === 'comentario_insert_ator' && pedido.texto && (
        <div className="absolute inset-x-4 bottom-4 rounded-[10px] bg-[#2a2d33]/95 px-3 py-2 text-[12px] leading-snug text-cream shadow-lg">💬 {pedido.texto}</div>
      )}
      {n > 1 && e.entre.startsWith('sequencia') && (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-cream">
          {k + 1}/{n}
        </span>
      )}
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

/** Uma mídia ligada: o vídeo (um trecho toca só a parte dele) ou a imagem, ordem, editar (vídeo) e tirar. */
function MidiaCard(p: { m: MidiaLigada; item: ItemBanco | undefined; editar: () => void; subir?: () => void; descer?: () => void; tirar: () => void }) {
  const { m, item } = p
  return (
    <div className="grid gap-2 rounded-[6px] p-2.5 ring-1 ring-line-dark">
      {item?.tipo === 'video' ? (
        <PlayerTrecho key={`${m.banco}:${item.inicio ?? 0}:${item.fim ?? item.duracao}`} item={item} />
      ) : (
        <img src={urlBancoMiniatura(m.banco)} alt="" className="max-h-[200px] w-full rounded-[3px] bg-black object-contain" />
      )}
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="min-w-0 flex-1 truncate font-semibold" title={item?.descricao}>
          {item?.nome ?? m.banco}
        </span>
        {item && (
          <span className="shrink-0 text-fog">
            {item.pai ? `trecho · ${s1(item.duracao)} s` : `${NOME_TIPO_MIDIA[item.tipo]} · ${item.formato}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fog">
        {item?.tipo === 'video' && (
          <button onClick={p.editar} className="flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-0.5 font-semibold hover:text-cream" title="Escolher trechos ou cortar as pontas">
            <Scissors className="size-3" /> Editar
          </button>
        )}
        <span className="ml-auto flex gap-1">
          <button onClick={p.subir} disabled={!p.subir} aria-label="Subir" className="grid size-6 place-items-center rounded-full hover:bg-cream/10 disabled:opacity-30">
            <ArrowUp className="size-3" />
          </button>
          <button onClick={p.descer} disabled={!p.descer} aria-label="Descer" className="grid size-6 place-items-center rounded-full hover:bg-cream/10 disabled:opacity-30">
            <ArrowDown className="size-3" />
          </button>
          <button onClick={p.tirar} aria-label="Tirar deste insert" className="grid size-6 place-items-center rounded-full hover:bg-coral/20 hover:text-coral">
            <X className="size-3" />
          </button>
        </span>
      </div>
    </div>
  )
}

/** Player pequeno de um vídeo do banco: num trecho, toca só ele e mostra o tempo dele (não o do original). */
function PlayerTrecho({ item }: { item: ItemBanco }) {
  const ref = useRef<HTMLVideoElement>(null)
  const ini = item.inicio ?? 0
  const fim = item.fim ?? item.duracao
  const dur = Math.max(fim - ini, 0.001)
  const [t, setT] = useState(0)
  const [tocando, setTocando] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const ir = () => (v.currentTime = ini)
    const tique = () => {
      if (v.currentTime >= fim - 0.02) {
        v.pause()
        v.currentTime = ini
      }
      setT(Math.max(0, Math.min(v.currentTime - ini, dur)))
    }
    const liga = () => setTocando(true)
    const desliga = () => setTocando(false)
    v.addEventListener('loadedmetadata', ir)
    v.addEventListener('timeupdate', tique)
    v.addEventListener('play', liga)
    v.addEventListener('pause', desliga)
    return () => {
      v.removeEventListener('loadedmetadata', ir)
      v.removeEventListener('timeupdate', tique)
      v.removeEventListener('play', liga)
      v.removeEventListener('pause', desliga)
    }
  }, [ini, fim, dur])
  const alternar = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < ini || v.currentTime >= fim - 0.02) v.currentTime = ini
      void v.play()
    } else v.pause()
  }
  const buscar = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const v = ref.current
    if (v) v.currentTime = ini + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
  }
  return (
    <div className="group/p relative overflow-hidden rounded-[3px] bg-black">
      <video ref={ref} src={urlBancoArquivo(item.id) + versaoBanco(item)} muted playsInline preload="metadata" onClick={alternar} className="max-h-[200px] w-full cursor-pointer object-contain" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5 text-[11px] text-cream tabular-nums">
        <button onClick={alternar} className="grid size-6 shrink-0 place-items-center rounded-full bg-cream/15 hover:bg-cream/25" aria-label={tocando ? 'Pausar' : 'Tocar'}>
          {tocando ? <Pause className="size-3" /> : <Play className="size-3 fill-current" />}
        </button>
        <span className="shrink-0">
          {s1(t)} / {s1(dur)} s
        </span>
        <div onPointerDown={buscar} className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-cream/25">
          <div className="absolute inset-y-0 left-0 rounded-full bg-coral" style={{ width: `${(t / dur) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

/** Captura de site (SPEC §8.3). Rápido por padrão: URL, proporção e "Capturar" grava a 1ª dobra (com o carregamento).
 *  Com "Várias dobras", abre a página inteira numa imagem: clicar no vazio marca uma dobra (até 3), clicar numa dobra a
 *  seleciona e arrastá-la a move; o × (ou Delete) apaga. */
function CapturaDeSite(p: { projetoId: string; pedido: Pedido; fechar: () => void; pronto: (r: InsertsProjeto) => void }) {
  type Dobra = { id: number; y: number }
  const [url, setUrl] = useState('')
  const [proporcao, setProporcao] = useState<ProporcaoCaptura>(p.pedido.capturas?.at(-1)?.proporcao ?? (p.pedido.formato === 'vertical' ? '9:16' : '16:9'))
  const [varias, setVarias] = useState(false)
  const [previa, setPrevia] = useState<PreviaSite | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [dobras, setDobras] = useState<Dobra[]>([{ id: 0, y: 0 }])
  const [sel, setSel] = useState<number | null>(null)
  const imagem = useRef<HTMLDivElement>(null)
  const prox = useRef(1)
  const [duracao, setDuracao] = useState(5) // s por dobra
  const ordenadas = [...dobras].sort((a, b) => a.y - b.y)

  const abrir = async () => {
    setAbrindo(true)
    setErro('')
    setPrevia(null)
    setDobras([{ id: 0, y: 0 }])
    setSel(null)
    try {
      setPrevia(await previaSite(p.projetoId, url, proporcao))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAbrindo(false)
    }
  }
  const capturar = async () => {
    setEnviando(true)
    setErro('')
    try {
      const alvo = previa ? { url: previa.url, titulo: previa.titulo, dobras: ordenadas.map((d) => d.y) } : { url, dobras: [0] }
      p.pronto(await capturarSite(p.projetoId, p.pedido.id, { ...alvo, proporcao, duracao }))
    } catch (e) {
      setErro((e as Error).message)
      setEnviando(false)
    }
  }

  // y (px da página) a partir do mouse, com a dobra inteira dentro da página
  const yDe = (clientY: number, deslocamento = 0) => {
    const r = imagem.current!.getBoundingClientRect()
    const y = ((clientY - r.top) / r.height) * previa!.altura_pagina - deslocamento
    return Math.round(Math.max(0, Math.min(y, previa!.altura_pagina - previa!.altura_janela)))
  }
  const marcar = (e: React.PointerEvent) => {
    if (!previa || dobras.length >= 3) return
    const id = prox.current++
    setDobras((d) => [...d, { id, y: yDe(e.clientY, previa.altura_janela / 2) }])
    setSel(id)
  }
  const arrastar = (e: React.PointerEvent, d: Dobra) => {
    e.stopPropagation()
    setSel(d.id)
    const r = imagem.current!.getBoundingClientRect()
    const pega = ((e.clientY - r.top) / r.height) * previa!.altura_pagina - d.y // onde, dentro da dobra, o mouse pegou
    const mover = (ev: PointerEvent) => setDobras((l) => l.map((x) => (x.id === d.id ? { ...x, y: yDe(ev.clientY, pega) } : x)))
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const tirar = (id: number) => {
    setDobras((l) => (l.length > 1 ? l.filter((x) => x.id !== id) : l))
    setSel(null)
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null && !(e.target as HTMLElement).closest('input')) tirar(sel)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  return (
    <Modal titulo="Capturar site" fechar={p.fechar} tamanho={previa ? 'largo' : 'pequeno'}>
      <input
        autoFocus
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          setPrevia(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && url.trim() && void (varias ? abrir() : capturar())}
        placeholder="Insira o endereço do site"
        className="h-10 w-full rounded-full border border-line-dark bg-deeper px-4 text-[13px] text-cream outline-none focus:border-cream/40"
      />
      <div className="flex flex-wrap items-center gap-2">
        {PROPORCOES_CAPTURA.map((f) => (
          <button
            key={f}
            onClick={() => {
              setProporcao(f)
              setPrevia(null)
            }}
            className={cn('h-8 rounded-full px-3 text-[12px] font-semibold', proporcao === f ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
            title={f === '9:16' ? 'Versão de celular do site' : 'Versão de computador'}
          >
            {f}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-fog" title="Quanto tempo gravar cada dobra (1 a 30 s)">
          Gravar
          <input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={duracao}
            onChange={(e) => setDuracao(Math.max(1, Math.min(30, Number(e.target.value) || 5)))}
            className="h-8 w-14 rounded-full border border-line-dark bg-deeper px-2 text-center text-[12px] text-cream tabular-nums outline-none focus:border-cream/40"
          />
          s
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fog">
          <input
            type="checkbox"
            checked={varias}
            onChange={(e) => {
              setVarias(e.target.checked)
              setPrevia(null)
            }}
            className="accent-coral"
          />
          Várias dobras
        </label>
      </div>
      {erro && <p className="text-[12px] text-coral">{erro}</p>}

      {!varias ? (
        <button
          onClick={() => void capturar()}
          disabled={!url.trim() || enviando}
          className="h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : `Capturar · ${s1(duracao)} s do topo, com o carregamento`}
        </button>
      ) : !previa ? (
        <button
          onClick={() => void abrir()}
          disabled={!url.trim() || abrindo}
          className="h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {abrindo ? 'Lendo a página inteira…' : 'Ler a página para marcar as dobras'}
        </button>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-5">
          <div className="min-h-0 overflow-y-auto rounded-[6px] bg-black">
            <div
              ref={imagem}
              onPointerDown={marcar}
              className={cn('relative mx-auto select-none', dobras.length < 3 ? 'cursor-crosshair' : 'cursor-default')}
              style={{ maxWidth: proporcao === '9:16' ? 360 : undefined }}
            >
              <img src={urlPreviaSite(p.projetoId, previa.id)} alt="" draggable={false} className="pointer-events-none block w-full" />
              {ordenadas.map((d, k) => (
                <div
                  key={d.id}
                  onPointerDown={(e) => arrastar(e, d)}
                  className={cn(
                    'absolute inset-x-0 cursor-grab border-2 active:cursor-grabbing',
                    sel === d.id ? 'z-10 border-yellow bg-yellow/15' : 'border-coral bg-coral/10',
                  )}
                  style={{ top: `${(d.y / previa.altura_pagina) * 100}%`, height: `${(previa.altura_janela / previa.altura_pagina) * 100}%` }}
                >
                  <span className={cn('absolute top-1 left-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', sel === d.id ? 'bg-yellow text-ink' : 'bg-coral text-cream')}>
                    Dobra {k + 1}
                  </span>
                  {dobras.length > 1 && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => tirar(d.id)}
                      className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink/90 text-fog ring-1 ring-line-dark hover:text-coral"
                      aria-label="Tirar dobra"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3 text-[12px]">
            <p className="font-semibold">{previa.titulo}</p>
            <p className="leading-[1.6] text-fog">
              Clique na página para marcar uma dobra (até 3); arraste para mudar de lugar; × apaga. Cada dobra grava {s1(duracao)} s parada, com as animações de entrada.
            </p>
            <div className="grid gap-1">
              {ordenadas.map((d, k) => (
                <button
                  key={d.id}
                  onClick={() => setSel(d.id)}
                  className={cn('flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-left', sel === d.id ? 'bg-cream/12' : 'hover:bg-cream/6')}
                >
                  <span className="font-semibold">Dobra {k + 1}</span>
                  <span className="text-fog">{d.y === 0 ? 'topo, com o carregamento' : `${Math.round((d.y / previa.altura_pagina) * 100)}% da página`}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => void capturar()}
              disabled={enviando}
              className="mt-auto h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : `Capturar ${dobras.length} dobra${dobras.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Escolher uma mídia do banco: busca no nome, na descrição e nas palavras-chave, filtro vídeo/imagem. */
function SeletorBanco(p: { tipo?: TipoMidia; fechar: () => void; escolher: (i: ItemBanco) => void; mudou: () => void }) {
  const { fechar, escolher } = p
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<TipoMidia | ''>(p.tipo ?? '')
  const [itens, setItens] = useState<ItemBanco[] | null>(null)
  const carregar = () => listarBanco(busca, filtro || undefined).then(setItens)
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200)
    return () => clearTimeout(t)
  }, [busca, filtro]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Apaga do banco (com confirmação; avisa quantos trechos vão junto) e tira dos inserts que usavam. */
  const apagar = async (i: ItemBanco) => {
    const n = i.trechos?.length ?? 0
    const aviso = i.pai
      ? `Apagar o trecho “${i.nome}” do banco? Ele sai dos inserts que o usam.`
      : `Apagar “${i.nome}” do banco?${n === 1 ? ' O trecho dele vai junto.' : n ? ` Os ${n} trechos dele vão junto.` : ''} A mídia sai dos inserts que a usam.`
    if (!window.confirm(aviso)) return
    try {
      await apagarItemBanco(i.id)
      await carregar()
      p.mudou()
    } catch (e) {
      window.alert((e as Error).message)
    }
  }
  const lixeira = (i: ItemBanco, classe: string) => (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void apagar(i)
      }}
      aria-label={`Apagar ${i.nome}`}
      title="Apagar do banco"
      className={cn('grid size-6 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral', classe)}
    >
      <Trash2 className="size-3.5" />
    </button>
  )
  return (
    <Modal titulo="Escolher do banco" fechar={fechar} tamanho="largo">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no nome, na descrição e nas palavras-chave"
          className="h-9 min-w-[240px] flex-1 rounded-full border border-line-dark bg-deeper px-4 text-[12.5px] text-cream outline-none focus:border-cream/40"
        />
        {(['', 'video', 'imagem'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', filtro === f ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
          >
            {f === '' ? 'Todos' : NOME_TIPO_MIDIA[f]}
          </button>
        ))}
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-1 pb-2">
        {itens === null ? (
          <p className="text-[12px] text-fog">Carregando…</p>
        ) : !itens.length ? (
          <p className="text-[12px] text-fog">Nada no banco com essa busca. Suba arquivos no insert ou na página do Banco.</p>
        ) : (
          <ul className="grid grid-cols-5 gap-3">
            {itens.map((i) => (
              <li key={i.id} className="grid min-w-0 grid-cols-1 content-start gap-1.5">
                <div className="group relative">
                <button onClick={() => escolher(i)} className="grid w-full gap-1.5 rounded-[6px] p-2 text-left ring-1 ring-line-dark hover:ring-coral">
                  {/* a altura sai da largura (56,25% = 16:9): o cartão mais alto da linha não estica a miniatura */}
                  <div className="relative overflow-hidden rounded-[3px] bg-black pt-[56.25%]">
                    <img src={urlBancoMiniatura(i.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-ink/85 text-cream" title={NOME_TIPO_MIDIA[i.tipo]}>
                      {i.tipo === 'video' ? <Video className="size-3.5" /> : <IconeImagem className="size-3.5" />}
                    </span>
                    {i.tipo === 'video' && (
                      <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold text-cream tabular-nums">{s1(i.duracao)} s</span>
                    )}
                  </div>
                  <span className="truncate text-[12px] font-semibold">{i.nome}</span>
                  <span className="text-[10.5px] text-fog">
                    {entrouEm(i.criado_em)} · {i.formato}
                  </span>
                </button>
                {lixeira(i, 'absolute top-3.5 left-3.5')}
                </div>
                {(i.trechos ?? []).map((t) => (
                  <div key={t.id} className="group relative">
                    <button
                      onClick={() => escolher(t)}
                      className="flex w-full items-center gap-2 rounded-[6px] p-1.5 text-left text-[11px] ring-1 ring-line-dark hover:ring-coral"
                      title="Usar este trecho"
                    >
                      <img src={urlBancoMiniatura(t.id)} alt="" className="h-8 w-12 shrink-0 rounded-[2px] bg-black object-cover" />
                      <span className="min-w-0 flex-1 truncate">{t.nome}</span>
                      <span className="shrink-0 text-fog tabular-nums group-hover:invisible">{s1(t.duracao)} s</span>
                    </button>
                    {lixeira(t, 'absolute top-1/2 right-1.5 -translate-y-1/2')}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** "06 out, 17:27": quando a mídia entrou no banco. */
function entrouEm(quando?: string) {
  if (!quando) return '—'
  const d = new Date(quando)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace(' de ', ' ').replace('.', '')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="eyebrow text-fog">{rotulo}</p>
      <p className="text-[12.5px] leading-[1.6] text-cream/85">{children}</p>
    </div>
  )
}
