import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Minus, Plus, RotateCcw, Scissors, Undo2, X } from 'lucide-react'
import {
  abrirProjeto,
  abrirVersaoDirecao,
  comentarDirecao,
  corrigirDirecao,
  editarComentarioDirecao,
  excluirComentarioDirecao,
  gerarDirecao,
  lerRegistroDirecao,
  salvarDirecaoProjeto,
  type Categorias,
  type DadosEditor,
  type DirecaoProjeto,
  type ItemRef,
  type Projeto,
  type RegistroDirecao,
} from '@/api'
import { cn } from '@/lib/utils'
import { Ajuda, Botao, Detalhe } from '@/referencias/Detalhe'
import { dividirPlano, editar, excluir, moverBorda, moverElemento, novoElemento, planosDe } from '@/referencias/edicao'
import LinhaDirecao, { X_COMENTARIOS, type Arrasto } from '@/referencias/LinhaDirecao'
import { paraAncora, paraTempo, palavrasNaSaida, type PalavraSaida } from './direcaoProjeto'
import Modal from '@/components/Modal'
import { emCampoDeTexto, modalAberto, useFecharComEsc } from '@/lib/atalhos'
import Preview from './Preview'
import type { Sequencia } from './sequencia'
import type { usePlayer } from './usePlayer'
import { useAtalhoZoom } from './useAtalhoZoom'

type Salvamento = 'salvo' | 'salvando' | 'pendente' | { erro: string }

export const CATEGORIAS: Categorias = {
  planos: {
    full_ator: 'Full ator',
    full_ator_lettering: 'Full ator com lettering',
    insert_tela_cheia: 'Insert tela cheia',
    motion_tela_cheia: 'Motion tela cheia',
    tela_dividida_insert: 'Tela dividida · insert',
    tela_dividida_motion: 'Tela dividida · motion',
    comentario_insert_ator: 'Comentário + insert + ator',
  },
  elementos: { lettering: 'Lettering', palavra_manychat: 'Palavra ManyChat', caixinha_perguntas: 'Caixinha de perguntas', print_sobreposto: 'Print/imagem sobreposta' },
}

type Props = {
  dados: DadosEditor
  seq: Sequencia
  player: ReturnType<typeof usePlayer>
  src: string
  enquadramentoX: number
  aoMudarProjeto: (p: Projeto) => void
}

/** Etapa 02 do projeto (SPEC §8.2.2): a direção visual proposta pela IA sobre o vídeo cortado, editável como na
 *  revisão da Calibragem. A tela edita em tempos do vídeo final; ao salvar, cada item volta a ficar preso às palavras. */
export default function EtapaDirecao(p: Props) {
  const dir = p.dados.projeto.direcao
  const rodando = dir?.status === 'rodando'

  // enquanto a IA trabalha, acompanha o projeto
  useEffect(() => {
    if (!rodando) return
    const t = setInterval(async () => {
      const novo = await abrirProjeto(p.dados.projeto.id).catch(() => null)
      if (novo && novo.direcao?.status !== 'rodando') p.aoMudarProjeto(novo)
    }, 1500)
    return () => clearInterval(t)
  }, [rodando, p])

  // gerando do zero: tela de espera; gerando a próxima versão: a atual continua na tela
  if (!dir?.itens || (rodando && dir.pedido?.tipo !== 'corrigir')) return <Vazio {...p} />
  // outra versão (ou uma geração nova) recomeça a edição
  return <Edicao key={`${dir.ativa}-${dir.gerado_em}`} {...p} />
}

function Vazio(p: Props) {
  const dir = p.dados.projeto.direcao
  const [pedindo, setPedindo] = useState(false)
  const gerar = async () => {
    setPedindo(true)
    try {
      p.aoMudarProjeto(await gerarDirecao(p.dados.projeto.id))
    } catch (e) {
      window.alert((e as Error).message)
    } finally {
      setPedindo(false)
    }
  }
  return (
    <div className="col-span-3 grid place-items-center p-10 text-cream">
      <div className="grid max-w-[520px] gap-4 text-center">
        <p className="eyebrow text-sage">Direção visual</p>
        {dir?.status === 'rodando' ? (
          <>
            <h2 className="titulo text-[30px]">Montando a direção…</h2>
            <p className="text-[13px] leading-[1.7] text-fog">A IA está lendo o vídeo cortado e os exemplos da Calibragem. Leva uns 20 segundos.</p>
          </>
        ) : (
          <>
            <h2 className="titulo text-[30px]">O que aparece na tela, momento a momento.</h2>
            <p className="text-[13px] leading-[1.7] text-fog">
              A IA lê a fala do vídeo já cortado e propõe os planos (ator, insert, motion, tela dividida…), os elementos e como gerar cada insert, imitando o jeito dos
              vídeos analisados na <Link to="/calibragem" className="text-yellow hover:underline">Calibragem</Link>. Depois você ajusta tudo na timeline.
            </p>
            {dir?.status === 'erro' && <p className="text-[12px] text-coral">⚠ {dir.erro}</p>}
            <button
              onClick={() => void gerar()}
              disabled={pedindo}
              className="mx-auto mt-2 flex h-11 items-center gap-2 rounded-full bg-coral px-6 text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-60"
            >
              {dir?.status === 'erro' ? 'Tentar de novo' : 'Gerar direção com IA'} <span className="seta">↗</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Edicao(p: Props) {
  const { dados, seq, player } = p
  const projeto = dados.projeto
  const saida = useMemo(() => palavrasNaSaida(dados.palavras, seq), [dados.palavras, seq])
  const inicial = useMemo(() => paraTempo(projeto.direcao!.itens!, dados.palavras, saida, seq.duracao), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [itens, setItens] = useState<ItemRef[]>(inicial.visiveis)
  const orfaos = inicial.orfaos
  const [historico, setHistorico] = useState<ItemRef[][]>([])
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [salvamento, setSalvamento] = useState<Salvamento>('salvo')
  const [px, setPx] = useState(60)
  useAtalhoZoom(() => setPx((v) => Math.min(v * 1.4, 600)), () => setPx((v) => Math.max(v / 1.4, 8)))
  const [registro, setRegistro] = useState<RegistroDirecao | null>(null)
  const itensRef = useRef(itens)
  itensRef.current = itens
  const salvos = useRef<ItemRef[]>(itens)
  const dir = projeto.direcao!
  const [escrevendo, setEscrevendo] = useState<{ id?: string; t: number; texto: string } | null>(null)
  const [pedindoVersao, setPedindoVersao] = useState(false)
  const proxima = Math.max(...(dir.versoes ?? []).map((v) => v.n), 0) + 1
  const corrigindo = dir.status === 'rodando' && dir.pedido?.tipo === 'corrigir'
  const atualizarDirecao = (d: DirecaoProjeto) => p.aoMudarProjeto({ ...projeto, direcao: d })
  const falhar = (e: unknown) => window.alert((e as Error).message)

  // comentários da versão aberta, no tempo do vídeo final
  const comentarios = useMemo(() => {
    const porId = new Map(saida.map((w) => [w.id, w]))
    return (dir.comentarios ?? []).flatMap((c) => {
      const w = porId.get(c.palavra)
      return w ? [{ id: c.id, t: Math.min(Math.max(w.saida_ini + c.off, 0), seq.duracao), texto: c.texto }] : []
    })
  }, [dir.comentarios, saida, seq.duracao])
  const novoComentario = useCallback(
    (t: number) => {
      player.ref.current?.pause()
      setEscrevendo({ t, texto: '' })
    },
    [player.ref],
  )
  const salvarComentario = async (texto: string) => {
    const c = escrevendo!
    try {
      if (c.id) atualizarDirecao(await editarComentarioDirecao(projeto.id, c.id, texto))
      else {
        const { palavra, off } = ancorar(saida, c.t)
        atualizarDirecao(await comentarDirecao(projeto.id, { palavra, off, texto }))
      }
      setEscrevendo(null)
    } catch (e) {
      falhar(e)
    }
  }
  const abrirVersao = (n: number) => {
    if (n === dir.ativa) return
    if (salvamento !== 'salvo') return window.alert('Espere salvar os ajustes antes de trocar de versão.')
    void abrirVersaoDirecao(projeto.id, n).then(atualizarDirecao).catch(falhar)
  }
  const gerarProxima = async (geral: string) => {
    try {
      p.aoMudarProjeto(await corrigirDirecao(projeto.id, geral.trim() || null))
      setPedindoVersao(false)
    } catch (e) {
      falhar(e)
    }
  }

  // na timeline, as palavras e as emendas no tempo do vídeo final
  const palavrasTimeline = useMemo(() => saida.map((w) => ({ ...w, inicio: w.saida_ini, fim: w.saida_fim })), [saida])
  const emendas = useMemo(() => seq.clipes.slice(1).map((c) => c.saida_ini), [seq])
  const nomes = { ...CATEGORIAS.planos, ...CATEGORIAS.elementos }
  const tempo = player.tempo
  const duracao = seq.duracao

  // salva sozinho, um pouco depois da última mudança (de volta para palavras + deslocamento)
  const [reenvio, setReenvio] = useState(0)
  const enviando = useRef(false)
  useEffect(() => {
    if (itens === salvos.current) {
      // voltou ao que já está gravado (mudou e desfez antes de salvar): nada pendente
      if (!enviando.current) setSalvamento('salvo')
      return
    }
    setSalvamento('pendente')
    const t = setTimeout(async () => {
      const enviado = itens
      enviando.current = true
      setSalvamento('salvando')
      try {
        const r = await salvarDirecaoProjeto(projeto.id, [...paraAncora(enviado, saida), ...orfaos])
        salvos.current = enviado
        p.aoMudarProjeto({ ...projeto, direcao: r })
        if (itensRef.current === enviado) setSalvamento('salvo')
        else setReenvio((n) => n + 1) // mudou (ou desfez) enquanto gravava: grava o que está na tela
      } catch (e) {
        setSalvamento({ erro: (e as Error).message })
      } finally {
        enviando.current = false
      }
    }, 700)
    return () => clearTimeout(t)
  }, [itens, reenvio]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const arrastar = useCallback(
    (a: Arrasto, t: number) => mudar((atuais) => (a.tipo === 'borda' ? moverBorda(atuais, a.k, t) : moverElemento(atuais, a.id, a.lado, t, duracao)), false),
    [mudar, duracao],
  )
  const aoIniciarArrasto = useCallback(() => setHistorico((h) => [...h.slice(-99), itensRef.current]), [])

  // o detalhe segue o plano sob o cursor (menos enquanto um campo está em edição)
  const planoNoCursor = useMemo(() => planosDe(itens).find((x) => tempo >= x.inicio && tempo < x.fim) ?? null, [itens, tempo])
  const ultimoPlano = useRef<string | null>(null)
  useEffect(() => {
    const id = planoNoCursor?.id ?? null
    if (id === ultimoPlano.current) return
    ultimoPlano.current = id
    if (document.activeElement?.closest('aside')) return
    setSelecionado(id)
  }, [planoNoCursor])

  // atalhos próprios da etapa (o editor já cuida de espaço e setas); com um modal aberto, as teclas são dele
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (emCampoDeTexto(e.target) || modalAberto()) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        desfazer()
      } else if (e.metaKey || e.ctrlKey) return
      else if (e.key.toLowerCase() === 's') dividir()
      else if (e.key.toLowerCase() === 'e') adicionarElemento()
      else if (e.key.toLowerCase() === 'c') novoComentario(tempo)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selecionado) apagar(selecionado)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [desfazer, dividir, adicionarElemento, apagar, selecionado, novoComentario, tempo])

  const verTrecho = (i: ItemRef) => player.tocarTrecho(seq.saidaParaFonte(i.inicio), seq.saidaParaFonte(Math.max(i.fim - 0.01, i.inicio)), { pular: true, loop: false })

  const sel = itens.find((i) => i.id === selecionado) ?? null
  const elementosNoCursor = itens.filter((i) => i.camada === 'elemento' && tempo >= i.inicio && tempo < i.fim)

  return (
    <>
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
          <Botao
            onClick={() => void lerRegistroDirecao(projeto.id, dir.ativa).then(setRegistro).catch(falhar)}
            titulo="O prompt enviado à IA e a resposta dela, nesta versão"
          >
            <FileText className="size-3" /> Prompt e resposta
          </Botao>
          <span className="ml-1 text-fog">
            {salvamento === 'salvo' ? '✓ Salvo' : salvamento === 'salvando' ? 'Salvando…' : salvamento === 'pendente' ? 'Alterações…' : <b className="text-coral">⚠ {salvamento.erro}</b>}
          </span>
          <span className="ml-auto flex items-center gap-1 text-fog">
            <button onClick={() => setPx((v) => Math.max(v / 1.4, 8))} aria-label="Afastar" className="grid size-7 place-items-center rounded-full hover:bg-cream/10">
              <Minus className="size-3.5" />
            </button>
            <button onClick={() => setPx((v) => Math.min(v * 1.4, 600))} aria-label="Aproximar" className="grid size-7 place-items-center rounded-full hover:bg-cream/10">
              <Plus className="size-3.5" />
            </button>
          </span>
        </div>
        {orfaos.length > 0 && (
          <p className="border-b border-line-dark bg-coral/10 px-3 py-2 text-[11px] text-coral">
            {orfaos.length} item(ns) da direção ficaram órfãos: as palavras deles foram cortadas. Eles continuam guardados, fora da timeline.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1 border-b border-line-dark px-3 py-2 text-[11px]">
          <span className="mr-1 text-[9px] tracking-[0.1em] text-fog uppercase">Versões</span>
          {(dir.versoes ?? []).map((v) => (
            <button
              key={v.n}
              onClick={() => abrirVersao(v.n)}
              title={v.origem == null ? 'Gerada pela diretora' : `Corrigida a partir da v${v.origem}, com os seus comentários`}
              className={cn(
                'rounded-full px-2.5 py-1 font-semibold tabular-nums',
                v.n === dir.ativa ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream',
              )}
            >
              v{v.n}
              {v.origem != null && <span className="font-normal opacity-60"> ← v{v.origem}</span>}
              {(v.comentarios?.length ?? 0) > 0 && <span className="font-normal opacity-70"> · 💬{v.comentarios!.length}</span>}
            </button>
          ))}
          <button
            onClick={() => setPedindoVersao(true)}
            disabled={corrigindo}
            title={`A corretora refaz esta versão (v${dir.ativa}) aplicando os seus comentários`}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-coral px-3 py-1 font-semibold text-cream hover:bg-coral/90 disabled:opacity-60"
          >
            <RotateCcw className={cn('size-3', corrigindo && 'animate-[otto-spin_1s_linear_infinite] [animation-direction:reverse]')} />
            {corrigindo ? `Gerando v${proxima}…` : `Gerar v${proxima}`}
          </button>
        </div>
        {dir.status === 'erro' && dir.erro && <p className="border-b border-line-dark bg-coral/10 px-3 py-2 text-[11px] text-coral">⚠ {dir.erro}</p>}
        <div className="relative h-6 shrink-0 overflow-hidden border-b border-line-dark text-[9px] tracking-[0.1em] text-fog uppercase">
          {(
            [
              [54, 'Fala'],
              [208, 'Planos-base'],
              [356, 'Elementos'],
              [X_COMENTARIOS, '💬'],
            ] as const
          ).map(([x, n]) => (
            <span key={n} className="absolute top-1.5" style={{ left: x }}>
              {n}
            </span>
          ))}
        </div>
        <LinhaDirecao
          refId=""
          duracao={duracao}
          palavras={palavrasTimeline}
          cortes={emendas}
          itens={itens}
          nomes={nomes}
          tempo={tempo}
          tocando={player.tocando}
          selecionado={selecionado}
          px={px}
          setPx={setPx}
          buscar={player.buscar}
          selecionar={setSelecionado}
          aoIniciarArrasto={aoIniciarArrasto}
          arrastar={arrastar}
          comentarios={{
            lista: comentarios,
            adicionar: novoComentario,
            editar: (id) => {
              const c = comentarios.find((x) => x.id === id)
              if (c) setEscrevendo({ id, t: c.t, texto: c.texto })
            },
            excluir: (id) => void excluirComentarioDirecao(projeto.id, id).then(atualizarDirecao).catch(falhar),
          }}
        />
      </section>

      {registro && <ModalRegistro r={registro} fechar={() => setRegistro(null)} />}
      {escrevendo && (
        <ModalComentario
          titulo={`${escrevendo.id ? 'Editar comentário' : 'Comentar'} · ${escrevendo.t.toFixed(1).replace('.', ',')} s`}
          fala={saida.filter((w) => Math.abs(w.saida_ini - escrevendo.t) < 2.5).map((w) => w.texto).join(' ')}
          inicial={escrevendo.texto}
          salvar={salvarComentario}
          fechar={() => setEscrevendo(null)}
        />
      )}
      {pedindoVersao && (
        <ModalGerarVersao
          de={dir.ativa ?? 1}
          proxima={proxima}
          comentarios={comentarios}
          geral={dir.geral ?? ''}
          gerar={gerarProxima}
          fechar={() => setPedindoVersao(false)}
        />
      )}

      {/* vídeo cortado com o esboço do layout */}
      <section className="flex min-h-0 min-w-0 flex-col px-6 pt-6 pb-4">
        <Preview
          videoRef={player.ref}
          src={p.src}
          enquadramentoX={p.enquadramentoX}
          tempo={tempo}
          duracao={duracao}
          tocando={player.tocando}
          alternar={player.alternar}
          velocidade={player.velocidade}
          setVelocidade={player.setVelocidade}
          buscar={player.buscar}
          sobreposicao={<Esboco plano={planoNoCursor} elementos={elementosNoCursor} />}
        />
      </section>

      {/* detalhe */}
      <aside className="min-h-0 overflow-y-auto border-l border-line-dark px-5 py-5">
        {sel ? (
          <Detalhe
            key={sel.id}
            item={sel}
            rotuloDescricao="Marcação"
            nomes={sel.camada === 'plano' ? CATEGORIAS.planos : CATEGORIAS.elementos}
            fala={saida.filter((w) => w.saida_fim > sel.inicio && w.saida_ini < sel.fim).map((w) => w.texto).join(' ')}
            editar={(campos) => mudar((atuais) => editar(atuais, sel.id, campos))}
            ver={() => verTrecho(sel)}
            apagar={() => apagar(sel.id)}
            unicoPlano={sel.camada === 'plano' && planosDe(itens).length < 2}
            elementos={sel.camada === 'plano' ? itens.filter((e) => e.camada === 'elemento' && e.fim > sel.inicio && e.inicio < sel.fim) : []}
            nomesElementos={CATEGORIAS.elementos}
            selecionar={setSelecionado}
          />
        ) : (
          <Ajuda
            planos={CATEGORIAS.planos}
            elementos={CATEGORIAS.elementos}
            intro="Esta é a direção proposta pela IA para o vídeo cortado. Clique num bloco para editar tipo, marcação, texto e como gerar. Arraste a linha entre dois planos para mudar o momento da troca e as pontas de um elemento para ajustar a duração. O ímã gruda nas palavras e nas emendas dos cortes (linhas tracejadas); Alt desliga. Para pedir mudanças à IA, comente pontos do vídeo (💬+ na linha vermelha, ou C) e clique em “Gerar” a próxima versão."
            rodape="Tudo é salvo sozinho. A direção fica presa às palavras: se você mexer nos cortes, ela acompanha."
          />
        )}
      </aside>
    </>
  )
}

/** Um instante do vídeo final vira palavra + deslocamento: a última palavra que começa até ali (ou a primeira). */
function ancorar(saida: PalavraSaida[], t: number) {
  const w = [...saida].reverse().find((x) => x.saida_ini <= t + 1e-6) ?? saida[0]
  return { palavra: w.id, off: Math.round((t - w.saida_ini) * 1000) / 1000 }
}

/** Escrever ou editar um comentário sobre a direção, num ponto do vídeo. ⌘/Ctrl + Enter salva. */
function ModalComentario(p: { titulo: string; fala: string; inicial: string; salvar: (texto: string) => Promise<void>; fechar: () => void }) {
  const [texto, setTexto] = useState(p.inicial)
  const [salvando, setSalvando] = useState(false)
  const enviar = async () => {
    if (!texto.trim() || salvando) return
    setSalvando(true)
    await p.salvar(texto.trim())
    setSalvando(false)
  }
  return (
    <Modal titulo={p.titulo} fechar={p.fechar}>
      {p.fala && <p className="text-[11.5px] leading-[1.6] text-fog">… {p.fala} …</p>}
      <textarea
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void enviar()
        }}
        rows={4}
        placeholder="O que mudar aqui? Ex.: este trecho pede um insert do site, não o ator."
        className="rounded-[4px] border border-line-dark bg-deeper px-3 py-2 text-[13px] leading-[1.6] text-cream outline-none focus:border-cream/40"
      />
      <button
        onClick={() => void enviar()}
        disabled={!texto.trim() || salvando}
        className="justify-self-end rounded-full bg-coral px-4 py-1.5 text-[12px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
      >
        {salvando ? 'Salvando…' : 'Salvar comentário'}
      </button>
    </Modal>
  )
}

/** Confirma a próxima versão: os comentários desta e um comentário geral opcional, sobre o vídeo todo. */
function ModalGerarVersao(p: {
  de: number
  proxima: number
  comentarios: { id: string; t: number; texto: string }[]
  geral: string
  gerar: (geral: string) => Promise<void>
  fechar: () => void
}) {
  const [geral, setGeral] = useState(p.geral)
  const [enviando, setEnviando] = useState(false)
  const pode = p.comentarios.length > 0 || geral.trim().length > 0
  return (
    <Modal titulo={`Gerar v${p.proxima} a partir da v${p.de}`} fechar={p.fechar}>
      <p className="text-[12px] leading-[1.6] text-fog">
        A corretora reescreve a v{p.de} (com os seus ajustes) aplicando os comentários abaixo e mantém o resto igual. A v{p.de} continua guardada.
      </p>
      {p.comentarios.length ? (
        <ul className="grid max-h-[220px] gap-1.5 overflow-y-auto text-[12px] leading-snug">
          {[...p.comentarios]
            .sort((a, b) => a.t - b.t)
            .map((c) => (
              <li key={c.id} className="flex gap-2 rounded-[4px] bg-deeper px-2.5 py-1.5">
                <span className="shrink-0 text-fog tabular-nums">{c.t.toFixed(1).replace('.', ',')} s</span>
                <span>{c.texto}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-[12px] text-fog">Nenhum comentário por ponto nesta versão (clique no 💬+ da timeline ou aperte C).</p>
      )}
      <label className="grid gap-1 text-[11px] text-fog">
        Comentário geral (opcional, sobre o vídeo todo)
        <textarea
          value={geral}
          onChange={(e) => setGeral(e.target.value)}
          rows={3}
          placeholder="Ex.: menos tela cheia no geral; mostre mais a ferramenta."
          className="rounded-[4px] border border-line-dark bg-deeper px-3 py-2 text-[13px] leading-[1.6] text-cream outline-none focus:border-cream/40"
        />
      </label>
      <button
        onClick={async () => {
          setEnviando(true)
          await p.gerar(geral)
          setEnviando(false)
        }}
        disabled={!pode || enviando}
        className="justify-self-end rounded-full bg-coral px-4 py-1.5 text-[12px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
      >
        {enviando ? 'Pedindo…' : `Gerar v${p.proxima}`}
      </button>
    </Modal>
  )
}

/** Esboço do layout por cima do vídeo: onde entra o insert, o motion, o lettering ou o comentário (sem mídia real). */
function Esboco({ plano, elementos }: { plano: ItemRef | null; elementos: ItemRef[] }) {
  if (!plano) return null
  const caixa = (rotulo: string, cor: string, classe: string) => (
    <div className={cn('absolute flex flex-col gap-2 p-4', cor, classe)}>
      <span className="eyebrow opacity-80">{rotulo}</span>
      <span className="line-clamp-6 text-[13px] leading-snug font-semibold">{plano.descricao}</span>
    </div>
  )
  const tipo = plano.tipo
  return (
    <div className="pointer-events-none absolute inset-0">
      {tipo === 'insert_tela_cheia' && caixa('Insert · tela cheia', 'bg-blue/92 text-cream', 'inset-0 justify-center')}
      {tipo === 'motion_tela_cheia' && caixa('Motion · tela cheia', 'bg-yellow/95 text-ink', 'inset-0 justify-center')}
      {tipo === 'tela_dividida_insert' && caixa('Insert', 'bg-blue/92 text-cream', 'inset-x-0 top-0 h-1/2 justify-end')}
      {tipo === 'tela_dividida_motion' && caixa('Motion', 'bg-yellow/95 text-ink', 'inset-x-0 top-0 h-1/2 justify-end')}
      {tipo === 'comentario_insert_ator' && (
        <>
          {caixa('Insert + comentário', 'bg-blue/92 text-cream', 'inset-x-0 top-0 h-1/2 justify-start')}
          {plano.texto && (
            <div className="absolute inset-x-4 top-[30%] rounded-[10px] bg-[#2a2d33]/95 px-3 py-2 text-[12px] leading-snug text-cream shadow-lg">💬 {plano.texto}</div>
          )}
        </>
      )}
      {tipo === 'full_ator_lettering' && plano.texto && (
        <p className="absolute inset-x-4 top-[38%] text-center text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] text-cream [text-shadow:0_3px_18px_#000c]">
          {plano.texto}
        </p>
      )}
      {elementos.map((e) => (
        <span
          key={e.id}
          className={cn(
            'absolute inset-x-6 bottom-[26%] rounded-[6px] px-3 py-1.5 text-center text-[14px] font-extrabold',
            e.tipo === 'lettering' ? 'bg-coral text-cream' : e.tipo === 'palavra_manychat' ? 'bg-cream text-ink' : 'bg-sage text-ink',
          )}
        >
          {e.tipo === 'palavra_manychat' ? `Comente “${e.texto ?? ''}”` : (e.texto ?? e.descricao)}
        </span>
      ))}
    </div>
  )
}

/** O que foi enviado ao diretor e o que ele devolveu (a última geração), para conferir e depurar. */
function ModalRegistro({ r, fechar }: { r: RegistroDirecao; fechar: () => void }) {
  const [aba, setAba] = useState<'sistema' | 'usuario' | 'roteiro' | 'resposta'>(r.roteiro ? 'roteiro' : 'sistema')
  const texto = aba === 'sistema' ? r.sistema : aba === 'usuario' ? r.usuario : aba === 'roteiro' ? (r.roteiro ?? '') : JSON.stringify(r.resposta, null, 1)
  const ref = useFecharComEsc(fechar)
  return (
    <div ref={ref} data-modal className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>
      <div className="flex h-[88vh] w-full max-w-[1100px] flex-col gap-3 rounded-[8px] bg-deep p-5 ring-1 ring-line-dark" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[16px] font-semibold">
            {r.etapa === 'corretora' ? `Prompt e resposta da corretora (v${r.versao} ← v${r.de})` : 'Prompt e resposta da diretora (v1)'}
          </p>
          <span className="text-[11px] text-fog">
            {new Date(r.gerado_em).toLocaleString('pt-BR')} · {r.etapa === 'corretora' ? 'corretora' : 'diretora'}: <b className="text-cream">{r.modelo}</b>
            {r.raciocinio && ` (raciocínio ${{ low: 'baixo', medium: 'médio', high: 'alto' }[r.raciocinio] ?? r.raciocinio})`}
            {r.modelo_formatadora && <> · formatadora: {r.modelo_formatadora}</>} · {r.tokens ?? '?'} tokens · arquivo: projetos/…/{r.arquivo} ({r.total} geração(ões) guardada(s))
          </span>
          <button onClick={fechar} aria-label="Fechar" className="ml-auto text-fog hover:text-cream">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex gap-1 text-[11px] font-semibold">
          {(
            [
              ['sistema', 'Prompt de sistema'],
              ['usuario', r.etapa === 'corretora' ? 'Mensagem (roteiro + comentários)' : 'Mensagem (vídeo novo)'],
              ['roteiro', r.etapa === 'corretora' ? 'Roteiro corrigido' : 'Roteiro da diretora'],
              ['resposta', 'Resposta formatada'],
            ] as const
          )
            .filter(([k]) => k !== 'roteiro' || r.roteiro)
            .map(([k, n]) => (
            <button key={k} onClick={() => setAba(k)} className={cn('rounded-full px-3 py-1.5', aba === k ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}>
              {n}
            </button>
          ))}
          <button onClick={() => void navigator.clipboard.writeText(texto)} className="ml-auto rounded-full border border-line-dark px-3 py-1.5 text-fog hover:text-cream">
            Copiar
          </button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-[6px] bg-deeper p-4 font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap text-cream/90">{texto}</pre>
      </div>
    </div>
  )
}

