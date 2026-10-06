import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Globe, Library, Scissors, Upload, X } from 'lucide-react'
import {
  NOME_TIPO_MIDIA,
  PROPORCOES_CAPTURA,
  capturarSite,
  definirMidias,
  lerInserts,
  listarBanco,
  previaSite,
  subirNoBanco,
  tempoBR,
  urlBancoArquivo,
  urlBancoMiniatura,
  urlPreviaSite,
  type DadosEditor,
  type InsertsProjeto,
  type ItemBanco,
  type MidiaLigada,
  type PedidoInsert,
  type PreviaSite,
  type ProporcaoCaptura,
  type TipoMidia,
} from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { COR_PLANO } from '@/referencias/LinhaDirecao'
import { paraTempo, palavrasNaSaida } from './direcaoProjeto'
import { CATEGORIAS } from './EtapaDirecao'
import EditorVideo from './EditorVideo'
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
const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'
const s1 = (t: number) => t.toFixed(1).replace('.', ',')
const BOTAO = 'flex items-center gap-1 rounded-full border border-line-dark px-3 py-1 font-semibold text-fog hover:text-cream'

/** Etapa 03 (SPEC §8.3): para cada plano com insert da direção, o criador liga as mídias (vídeos e imagens) do banco,
 *  subindo os arquivos ou escolhendo os que já estão lá. A marcação da direção diz o que acontece no insert; como as
 *  mídias aparecem (zoom, lado a lado, uma depois da outra) é do Enriquecimento. */
export default function EtapaInserts(p: Props) {
  const { dados, seq, player } = p
  const projeto = dados.projeto
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
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
  const capturando = ins?.pedidos.some((x) => x.captura?.status === 'fila' || x.captura?.status === 'rodando')
  useEffect(() => {
    if (!capturando) return
    const t = setInterval(() => {
      void lerInserts(projeto.id).then(setIns)
      void carregarBanco()
    }, 2500)
    return () => clearInterval(t)
  }, [capturando, projeto.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // tempos de cada insert no vídeo final: os do plano na direção (que acompanham os cortes)
  const saida = useMemo(() => palavrasNaSaida(dados.palavras, seq), [dados.palavras, seq])
  const planos = useMemo(() => {
    const { visiveis } = paraTempo(projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao)
    return visiveis
      .filter((i) => i.camada === 'plano')
      .sort((a, b) => a.inicio - b.inicio)
      .map((i) => ({ ...i, fala: saida.filter((w) => w.saida_ini >= i.inicio - 0.01 && w.saida_ini < i.fim).map((w) => w.texto).join(' ') }))
  }, [projeto.direcao?.itens, dados.palavras, saida, seq.duracao])
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

  // a seleção segue o insert sob o cursor enquanto toca
  useEffect(() => {
    if (player.tocando && noCursor) setSelecionado(noCursor.id)
  }, [noCursor?.id, player.tocando]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const sel = pedidos.find((x) => x.id === selecionado) ?? null
  const comMidia = pedidos.filter((x) => x.midias.length).length

  return (
    <>
      {/* inserts */}
      <section className="flex min-h-0 flex-col border-r border-line-dark">
        <div className="flex items-center gap-2 border-b border-line-dark px-3 py-2 text-[11px]">
          <span className="text-fog tabular-nums">
            {comMidia}/{pedidos.length} inserts com mídia
          </span>
          <Link to="/banco" className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-fog hover:text-cream">
            <Library className="size-3" /> Abrir o banco
          </Link>
        </div>
        {erro && <p className="px-4 py-6 text-[12px] text-coral">{erro}</p>}
        {ins && !pedidos.length && <p className="px-4 py-6 text-[12px] leading-relaxed text-fog">A direção ativa não tem planos com insert.</p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {planos.map((pl) => {
            const x = pedidos.find((y) => y.plano === pl.id)
            if (!x) {
              // os planos sem insert ficam numa linha só, apagados: dão o contexto do vídeo
              const aqui = tempo >= pl.inicio && tempo < pl.fim
              return (
                <button
                  key={pl.id}
                  onClick={() => player.buscar(pl.inicio + 0.01)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-line-dark/60 px-4 py-1.5 text-left text-[11px] text-fog/70 transition-colors hover:bg-cream/5 hover:text-fog',
                    aqui && 'text-fog shadow-[inset_3px_0_0_#f26b4f]',
                  )}
                  title={pl.descricao || undefined}
                >
                  <span className="w-[34px] shrink-0 tabular-nums">{tempoBR(pl.inicio)}</span>
                  <span className={cn('size-2 shrink-0 rounded-full', COR_PLANO[pl.tipo])} />
                  <span className="w-[118px] shrink-0 truncate">{CATEGORIAS.planos[pl.tipo] ?? pl.tipo}</span>
                  <span className="min-w-0 flex-1 truncate">{pl.fala}</span>
                </button>
              )
            }
            return (
              <button
                key={x.id}
                onClick={() => {
                  setSelecionado(x.id)
                  player.buscar(x.t.inicio + 0.01)
                }}
                className={cn(
                  'grid w-full gap-1 border-b border-line-dark bg-cream/[0.03] px-4 py-3 text-left transition-colors hover:bg-cream/5',
                  selecionado === x.id && 'bg-cream/10',
                  noCursor?.id === x.id && 'shadow-[inset_3px_0_0_#f26b4f]',
                )}
              >
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="text-fog tabular-nums">
                    {tempoBR(x.t.inicio)} · {s1(x.t.fim - x.t.inicio)} s
                  </span>
                  <span className={cn('rounded-full px-2 py-px text-[10px] font-semibold', COR_PLANO[x.tipo])}>{NOME_TIPO[x.tipo] ?? x.tipo}</span>
                  <span className={cn('ml-auto font-semibold', x.midias.length ? 'text-mint' : 'text-coral')}>
                    {x.midias.length ? `${x.midias.length} mídia${x.midias.length > 1 ? 's' : ''}` : 'sem mídia'}
                  </span>
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-cream">“{x.fala}”</span>
                {x.descricao && <span className="line-clamp-2 text-[11.5px] leading-snug text-fog">{x.descricao}</span>}
                {x.midias.length > 0 && (
                  <span className="flex gap-1">
                    {x.midias.slice(0, 6).map((m) => (
                      <img key={m.id} src={urlBancoMiniatura(m.banco)} alt="" className="h-8 w-12 rounded-[2px] bg-black object-cover" />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* vídeo com o insert no lugar */}
      <section className="flex min-h-0 min-w-0 flex-col px-6 pt-6 pb-4">
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

      {/* detalhe */}
      <aside className="min-h-0 overflow-y-auto border-l border-line-dark px-5 py-5 text-cream">
        {sel ? (
          <Detalhe
            key={sel.id}
            pedido={sel}
            banco={banco}
            subindo={subindo}
            projetoId={projeto.id}
            capturou={setIns}
            salvar={(midias) => salvar(sel.id, midias)}
            subir={(arquivos) => subirELigar(sel, arquivos)}
            bancoMudou={() => void carregarBanco()}
            ver={() => player.tocarTrecho(seq.saidaParaFonte(sel.t.inicio), seq.saidaParaFonte(Math.max(sel.t.fim - 0.01, sel.t.inicio)), { pular: true, loop: false })}
          />
        ) : (
          <div className="grid gap-3 text-[12.5px] leading-[1.7] text-fog">
            <p className="eyebrow text-sage">Inserts</p>
            <p>
              Cada plano com insert da direção aparece à esquerda, com o que acontece nele. Clique num insert para ligar as mídias: suba os
              arquivos (vídeos e imagens) ou escolha do{' '}
              <Link to="/banco" className="text-yellow hover:underline">
                banco
              </Link>
              . Um insert pode ter várias.
            </p>
            <p>Como elas aparecem (zoom, lado a lado, uma depois da outra, destaques) fica para o Enriquecimento. Por enquanto a prévia mostra uma depois da outra, em partes iguais.</p>
          </div>
        )}
      </aside>
    </>
  )
}

/** As mídias do insert do momento, uma depois da outra (o tempo do insert em partes iguais), por cima do vídeo. */
function InsertNoLugar({ pedido, banco, tempo, tocando }: { pedido: Pedido; banco: Map<string, ItemBanco>; tempo: number; tocando: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const n = pedido.midias.length
  const parte = (pedido.t.fim - pedido.t.inicio) / Math.max(n, 1)
  const rel = Math.max(tempo - pedido.t.inicio, 0)
  const k = Math.max(Math.min(Math.floor(rel / parte), n - 1), 0)
  const m = n ? pedido.midias[k] : null
  const item = m ? banco.get(m.banco) : undefined
  // um trecho toca o original do início ao fim dele (e para no último quadro)
  const alvo = Math.min((item?.inicio ?? 0) + (rel - k * parte), item?.fim ?? Infinity)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (Math.abs(v.currentTime - alvo) > (tocando ? 0.3 : 0.03)) v.currentTime = alvo
    if (tocando && v.paused) void v.play().catch(() => {})
    if (!tocando && !v.paused) v.pause()
  })
  const caixa = pedido.formato === 'vertical' ? 'inset-0' : 'inset-x-0 top-0 h-1/2'
  if (!m) return <div className={cn('pointer-events-none absolute grid place-items-center bg-black/55 p-6 text-center text-[12px] text-cream/80', caixa)}>Insert sem mídia</div>
  return (
    <div className={cn('pointer-events-none absolute overflow-hidden bg-black', caixa)}>
      {item?.tipo === 'video' ? (
        <video key={m.id} ref={ref} src={urlBancoArquivo(m.banco)} muted playsInline preload="auto" className="size-full object-cover" />
      ) : (
        <img src={urlBancoArquivo(m.banco)} alt="" className="size-full object-cover" />
      )}
      {pedido.tipo === 'comentario_insert_ator' && pedido.texto && (
        <div className="absolute inset-x-4 bottom-4 rounded-[10px] bg-[#2a2d33]/95 px-3 py-2 text-[12px] leading-snug text-cream shadow-lg">💬 {pedido.texto}</div>
      )}
      {n > 1 && (
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
  }
  const [capturando, setCapturando] = useState(false)
  const cap = x.captura
  const andando = cap?.status === 'fila' || cap?.status === 'rodando'
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
          <button onClick={() => setCapturando(true)} disabled={andando} className={cn(BOTAO, 'disabled:opacity-50')}>
            <Globe className="size-3" /> Capturar site
          </button>
        </div>
        {cap && andando && (
          <p className="text-[11.5px] text-yellow">
            {cap.status === 'fila' ? 'Captura na fila…' : `Capturando ${cap.url.replace(/^https?:\/\//, '')} · dobra ${Math.min(cap.feitas + 1, cap.dobras.length)} de ${cap.dobras.length}…`}
          </p>
        )}
        {cap?.status === 'erro' && <p className="text-[11.5px] text-coral">A captura de {cap.url.replace(/^https?:\/\//, '')} falhou: {cap.erro}</p>}
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
          fechar={() => setEscolhendo(false)}
          escolher={(item) => {
            // um vídeo original abre no editor (para escolher os trechos); trecho ou imagem entram direto
            if (item.tipo === 'video' && !item.pai) setEditando((f) => [item.id, ...f])
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
          fechar={() => setEditando((f) => f.slice(1))}
        />
      )}
    </div>
  )
}

/** Uma mídia ligada: o vídeo (um trecho toca só a parte dele) ou a imagem, ordem, editar (vídeo) e tirar. */
function MidiaCard(p: { m: MidiaLigada; item: ItemBanco | undefined; editar: () => void; subir?: () => void; descer?: () => void; tirar: () => void }) {
  const { m, item } = p
  const trecho = item?.pai ? `#t=${item.inicio},${item.fim}` : ''
  return (
    <div className="grid gap-2 rounded-[6px] p-2.5 ring-1 ring-line-dark">
      {item?.tipo === 'video' ? (
        <video
          key={`${m.banco}${trecho}`}
          src={`${urlBancoArquivo(m.banco)}${trecho}`}
          muted
          controls
          playsInline
          preload="metadata"
          className="max-h-[200px] w-full rounded-[3px] bg-black object-contain"
        />
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

/** Captura de site (SPEC §8.3): URL e proporção → a página inteira numa imagem → o criador clica onde começa cada dobra
 *  (a 1ª é o topo, até 3) → a captura roda em segundo plano e cada dobra vira uma mídia ligada ao insert. */
function CapturaDeSite(p: { projetoId: string; pedido: Pedido; fechar: () => void; pronto: (r: InsertsProjeto) => void }) {
  const [url, setUrl] = useState(p.pedido.captura?.url ?? '')
  const [proporcao, setProporcao] = useState<ProporcaoCaptura>(p.pedido.captura?.proporcao ?? (p.pedido.formato === 'vertical' ? '9:16' : '16:9'))
  const [previa, setPrevia] = useState<PreviaSite | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')
  const [dobras, setDobras] = useState<number[]>([0])
  const imagem = useRef<HTMLImageElement>(null)
  const duracao = p.pedido.t.fim - p.pedido.t.inicio + 2

  const abrir = async () => {
    setAbrindo(true)
    setErro('')
    setPrevia(null)
    setDobras([0])
    try {
      setPrevia(await previaSite(p.projetoId, url, proporcao))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAbrindo(false)
    }
  }
  // clique na imagem: o topo da dobra fica onde clicou (em px de CSS da página), sem passar do fim da página
  const marcar = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!previa || !imagem.current || dobras.length >= 3) return
    const r = imagem.current.getBoundingClientRect()
    const y = Math.round(((e.clientY - r.top) / r.height) * previa.altura_pagina)
    const topo = Math.max(0, Math.min(y, previa.altura_pagina - previa.altura_janela))
    setDobras((d) => [...d, topo].sort((a, b) => a - b))
  }
  const capturar = () =>
    capturarSite(p.projetoId, p.pedido.id, { url: previa!.url, proporcao, dobras, titulo: previa!.titulo })
      .then(p.pronto)
      .catch((e) => setErro((e as Error).message))

  return (
    <Modal titulo="Capturar site" fechar={p.fechar} tamanho="largo">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && void abrir()}
          placeholder="Endereço do site (ex.: linear.app)"
          className="h-9 min-w-[280px] flex-1 rounded-full border border-line-dark bg-deeper px-4 text-[12.5px] text-cream outline-none focus:border-cream/40"
        />
        {PROPORCOES_CAPTURA.map((f) => (
          <button
            key={f}
            onClick={() => {
              setProporcao(f)
              setPrevia(null)
            }}
            className={cn('h-9 rounded-full px-3.5 text-[12px] font-semibold', proporcao === f ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
            title={f === '9:16' ? 'Versão de celular do site' : 'Versão de computador'}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => void abrir()}
          disabled={!url.trim() || abrindo}
          className="h-9 rounded-full bg-coral px-4 text-[12px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {abrindo ? 'Abrindo…' : 'Abrir página'}
        </button>
      </div>
      {erro && <p className="text-[12px] text-coral">{erro}</p>}

      {!previa ? (
        <div className="grid flex-1 place-items-center rounded-[6px] border border-dashed border-line-dark text-center text-[12.5px] leading-[1.7] text-fog">
          {abrindo ? (
            <p>Abrindo a página e rolando até o fim para carregar tudo…</p>
          ) : (
            <p>
              Ponha o endereço, escolha a proporção e abra a página.
              <br />
              Depois clique na página onde começa cada dobra a gravar: a 1ª é o topo, com o carregamento; até 3.
            </p>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_260px] gap-5">
          <div className="min-h-0 overflow-y-auto rounded-[6px] bg-black">
            <div className="relative mx-auto" style={{ maxWidth: proporcao === '9:16' ? 360 : undefined }}>
              <img
                ref={imagem}
                src={urlPreviaSite(p.projetoId, previa.id)}
                alt=""
                onClick={marcar}
                className={cn('block w-full', dobras.length < 3 ? 'cursor-crosshair' : 'cursor-not-allowed')}
              />
              {dobras.map((y, k) => (
                <div
                  key={y}
                  className="pointer-events-none absolute inset-x-0 border-2 border-coral bg-coral/10"
                  style={{ top: `${(y / previa.altura_pagina) * 100}%`, height: `${(previa.altura_janela / previa.altura_pagina) * 100}%` }}
                >
                  <span className="absolute top-1 left-1 rounded-full bg-coral px-2 py-0.5 text-[10px] font-semibold text-cream">Dobra {k + 1}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3 text-[12.5px]">
            <p className="font-semibold">{previa.titulo}</p>
            <p className="text-fog">
              {proporcao} · {proporcao === '9:16' ? 'versão de celular' : 'versão de computador'} · {previa.largura_janela}×{previa.altura_janela} (gravado em 2×)
            </p>
            <p className="eyebrow mt-2 text-sage">Dobras ({dobras.length} de 3)</p>
            {dobras.map((y, k) => (
              <div key={y} className="flex items-center gap-2 rounded-[6px] px-3 py-2 ring-1 ring-line-dark">
                <span className="font-semibold">Dobra {k + 1}</span>
                <span className="text-fog">{y === 0 ? 'topo, com o carregamento' : `${Math.round((y / previa.altura_pagina) * 100)}% da página`}</span>
                {k > 0 && (
                  <button onClick={() => setDobras((d) => d.filter((_, j) => j !== k))} className="ml-auto text-fog hover:text-coral" aria-label="Tirar dobra">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <p className="text-[11.5px] leading-[1.6] text-fog">
              {dobras.length < 3 ? 'Clique na página para marcar outra dobra. ' : ''}Cada dobra grava {s1(duracao)} s parada (o insert tem {s1(duracao - 2)} s, mais 2 s de folga),
              com as animações de entrada. Vira uma mídia no banco, ligada a este insert.
            </p>
            <button onClick={() => void capturar()} className="mt-auto h-10 rounded-full bg-coral px-4 text-[13px] font-semibold text-cream hover:bg-coral/90">
              Capturar {dobras.length} dobra{dobras.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Escolher uma mídia do banco: busca no nome, na descrição e nas palavras-chave, filtro vídeo/imagem. */
function SeletorBanco({ tipo, fechar, escolher }: { tipo?: TipoMidia; fechar: () => void; escolher: (i: ItemBanco) => void }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<TipoMidia | ''>(tipo ?? '')
  const [itens, setItens] = useState<ItemBanco[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => void listarBanco(busca, filtro || undefined).then(setItens), 200)
    return () => clearTimeout(t)
  }, [busca, filtro])
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {itens === null ? (
          <p className="text-[12px] text-fog">Carregando…</p>
        ) : !itens.length ? (
          <p className="text-[12px] text-fog">Nada no banco com essa busca. Suba arquivos no insert ou na página do Banco.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {itens.map((i) => (
              <li key={i.id} className="grid content-start gap-1.5">
                <button onClick={() => escolher(i)} className="grid w-full gap-1.5 rounded-[6px] p-2 text-left ring-1 ring-line-dark hover:ring-coral">
                  <img src={urlBancoMiniatura(i.id)} alt="" className="aspect-video w-full rounded-[3px] bg-black object-cover" />
                  <span className="truncate text-[12px] font-semibold">{i.nome}</span>
                  <span className="text-[10.5px] text-fog">
                    {NOME_TIPO_MIDIA[i.tipo]} · {i.formato}
                    {i.tipo === 'video' && ` · ${s1(i.duracao)} s`}
                    {i.tipo === 'video' && ' · abre no editor'}
                  </span>
                </button>
                {(i.trechos ?? []).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => escolher(t)}
                    className="flex items-center gap-2 rounded-[6px] p-1.5 text-left text-[11px] ring-1 ring-line-dark hover:ring-coral"
                    title="Usar este trecho"
                  >
                    <img src={urlBancoMiniatura(t.id)} alt="" className="h-8 w-12 shrink-0 rounded-[2px] bg-black object-cover" />
                    <span className="min-w-0 flex-1 truncate">{t.nome}</span>
                    <span className="shrink-0 text-fog tabular-nums">{s1(t.duracao)} s</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
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
