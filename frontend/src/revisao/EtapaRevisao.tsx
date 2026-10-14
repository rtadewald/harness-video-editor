import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquareText, Paperclip, Pencil, Play, Trash2, X } from 'lucide-react'
import { lerInserts, urlArquivo, urlBancoMiniatura, type InsertsProjeto, type ItemRef, type Projeto } from '@/api'
import { motionsDoProjeto, type MotionPlano } from '@/motions/api'
import type { PalavraSaida } from '@/direcao/direcaoProjeto'
import type { CorteDoVideo } from '@/transicoes/transicoes'
import { CATEGORIAS } from '@/direcao/EtapaDirecao'
import { COR_PLANO } from '@/referencias/LinhaDirecao'
import LinhaBase, { type Trilha } from '@/editor/LinhaBase'
import { Alca, Cabecalho, useTamanhos } from '@/inserts/layout'
import { ChipCodigo } from '@/components/Codigo'
import { emCampoDeTexto, modalAberto } from '@/lib/atalhos'
import { cn } from '@/lib/utils'
import { anexarRevisao, apagarAnexoRevisao, aprovarVersao, enviarRevisao, lerRevisao, salvarRevisao, type Comentario, type Revisao } from './api'
import { agora, falaEm, palavraEm, planoEm, proximoId, quando, temConteudo, tempo } from './comum'

const LINHA: Trilha[] = [
  { id: 'planos', nome: 'Planos', alt: 26 },
  { id: 'fala', nome: 'Fala', alt: 22 },
  { id: 'voce', nome: 'Você', alt: 24 },
]
const NOME_STATUS = { aplicado: 'Aplicado', respondido: 'Respondido', nao_aplicado: 'Não aplicado' } as const
const COR_STATUS = { pendente: 'bg-coral text-cream', aplicado: 'bg-sage text-ink', respondido: 'bg-blue text-cream', nao_aplicado: 'bg-fog text-ink' } as const

/** A caixa do comentário novo: segue o cursor até Rodrigo escrever (aí pausa e prende no instante, ou no trecho I–O);
 *  `geral`: sem tempo, sobre o vídeo todo (C). `id`: reservado quando um anexo chega antes do texto. */
type Nova = { preso: boolean; geral: boolean; t: number; fim: number | null; texto: string; anexos: string[]; id: string | null }
const NOVA_VAZIA: Nova = { preso: false, geral: false, t: 0, fim: null, texto: '', anexos: [], id: null }
/** Editar um comentário (`id`) ou responder a uma dúvida do Claude (`responde`, sem `id` até gravar). */
type Editor = { id: string | null; responde?: string; t: number | null; fim: number | null; texto: string; anexos: string[]; antes: string[]; novoId?: string }

/** A etapa Revisão (docs/editor-claude.md §6, E8; no molde da do 19): Rodrigo assiste a versão que o Claude entregou na
 *  prévia montada (sem MP4) e comenta o que é estrutural — trocar um insert, um motion, um plano. Ao escrever, o vídeo
 *  pausa e o comentário prende no instante (I e O marcam um trecho; C desliga o tempo: um comentário geral); ⌘V cola
 *  print ou vídeo. "Enviar revisão" copia o texto para colar no chat do Claude Code; "Aprovar" aprova a versão. As
 *  respostas do Claude (aplicado, respondido, não aplicado) aparecem embaixo de cada comentário, e as dúvidas dele na
 *  trilha Claude. O ajuste fino é nas etapas, à mão. */
export default function EtapaRevisao(p: {
  projeto: Projeto
  previa: ReactNode
  planos: ItemRef[]
  saida: PalavraSaida[]
  cortes: CorteDoVideo[] | null
  duracao: number
  tempo: number
  tocando: boolean
  buscar: (t: number) => void
  pausar: () => void
}) {
  const pid = p.projeto.id
  const versaoProjeto = p.projeto.versao ?? 0
  const [tam, arrastarBorda] = useTamanhos()
  const [carga, setCarga] = useState<{ versao: number; revisao: Revisao } | null>(null)
  const [erroCarga, setErroCarga] = useState('')
  const [coms, setComs] = useState<Comentario[]>([])
  const [salvo, setSalvo] = useState<'' | 'salvando' | 'salvo' | 'erro'>('')
  const [nova, setNova] = useState<Nova>(NOVA_VAZIA)
  const [entrada, setEntrada] = useState<number | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null)
  const [verAnexo, setVerAnexo] = useState<string | null>(null)
  const reservado = useRef(0)
  const sujo = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const comsRef = useRef(coms)
  useEffect(() => {
    comsRef.current = coms
  })
  const n = carga?.versao ?? 0

  const avisar = useCallback((texto: string, erro = false) => {
    setAviso({ texto, erro })
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 3200)
  }, [])

  // a revisão da versão atual do projeto (outra versão restaurada: a revisão dela)
  useEffect(() => {
    let vivo = true
    lerRevisao(pid)
      .then((r) => {
        if (!vivo) return
        setErroCarga('')
        setCarga(r)
        setComs(r.revisao.comentarios)
        setSalvo(r.revisao.comentarios.length ? 'salvo' : '')
        setNova(NOVA_VAZIA)
        setEditor(null)
      })
      .catch((e) => vivo && setErroCarga((e as Error).message))
    return () => {
      vivo = false
    }
  }, [pid, versaoProjeto])

  // gravar: 600 ms depois da última mudança (a fila é a do servidor: cada PUT leva a lista inteira)
  const gravar = useCallback(() => {
    if (!n) return
    sujo.current = false
    void salvarRevisao(pid, n, comsRef.current)
      .then(() => setSalvo(sujo.current ? 'salvando' : 'salvo'))
      .catch(() => setSalvo('erro'))
  }, [pid, n])
  const mudar = (f: (cs: Comentario[]) => Comentario[]) => {
    setComs((cs) => {
      const novo = f(cs)
      comsRef.current = novo
      return novo
    })
    sujo.current = true
    setSalvo('salvando')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(gravar, 600)
  }
  useEffect(() => () => {
    if (timer.current && sujo.current) {
      clearTimeout(timer.current)
      gravar()
    }
  }, [gravar])

  // as respostas do Claude chegam pelo arquivo: relê a cada 4 s (não enquanto há mudança por gravar)
  useEffect(() => {
    if (!n) return
    const t = setInterval(() => {
      if (sujo.current || document.hidden) return
      void lerRevisao(pid, n)
        .then((r) => {
          const doDisco = new Map(r.revisao.comentarios.map((c) => [c.id, c]))
          let respondeu = false
          setComs((cs) => {
            const novo = cs.map((c) => {
              const d = doDisco.get(c.id)
              if (!d || (d.status === c.status && d.resposta === c.resposta)) return c
              respondeu = true
              return { ...c, status: d.status, resposta: d.resposta }
            })
            comsRef.current = novo
            return respondeu ? novo : cs
          })
          setCarga((c) => c && { ...c, revisao: { ...c.revisao, aprovado: r.revisao.aprovado, enviado_em: r.revisao.enviado_em } })
          if (respondeu) avisar('O Claude respondeu a revisão')
        })
        .catch(() => undefined)
    }, 4000)
    return () => clearInterval(t)
  }, [pid, n, avisar])

  // ---------------------------------------------------------------- o comentário novo

  const agoraNoVideo = (): { t: number; fim: number | null } => {
    if (entrada == null) return { t: p.tempo, fim: null }
    const a = Math.min(entrada, p.tempo)
    const b = Math.max(entrada, p.tempo)
    return { t: a, fim: b - a < 0.05 ? null : b }
  }
  const prender = (x: Nova): Nova => {
    if (x.preso || x.geral) return x
    p.pausar()
    const { t, fim } = agoraNoVideo()
    setEntrada(null)
    return { ...x, preso: true, t, fim }
  }
  const alternarTempo = () => {
    setEntrada(null)
    setNova((x) => {
      const geral = !x.geral
      if (!geral && x.texto.trim()) {
        p.pausar()
        return { ...x, geral, preso: true, t: p.tempo, fim: null }
      }
      return { ...x, geral, preso: false, fim: null }
    })
    caixa.current?.focus()
  }
  const montar = (base: { t: number | null; fim: number | null; geral?: boolean; responde?: string }, id: string, texto: string, anexos: string[], fala?: string): Comentario => {
    const w = base.t != null ? palavraEm(p.saida, base.t) : null
    const wf = base.fim != null ? palavraEm(p.saida, base.fim) : null
    return {
      id,
      t: base.geral ? null : base.t,
      fim: base.geral ? null : base.fim,
      palavra: base.geral ? null : (w?.id ?? null),
      palavra_fim: base.geral ? null : (wf?.id ?? w?.id ?? null),
      fala: base.geral ? '' : (fala ?? (base.t != null ? falaEm(p.saida, base.t, base.fim) : '')),
      plano: base.geral || base.t == null ? null : (planoEm(p.planos, base.t)?.id ?? null),
      texto: texto.trim(),
      ...(anexos.length ? { anexos } : {}),
      ...(base.geral ? { geral: true } : {}),
      ...(base.responde ? { responde: base.responde } : {}),
      criado_em: agora(),
      status: 'pendente',
      resposta: null,
    }
  }
  const reservar = () => {
    const r = proximoId(comsRef.current, reservado.current)
    reservado.current = r.n
    return r.id
  }
  const gravarNova = () => {
    const x = nova
    if (!x.texto.trim() && !x.anexos.length) return
    const id = x.id ?? reservar()
    const base = x.geral ? { t: null, fim: null, geral: true } : x.preso ? { t: x.t, fim: x.fim } : agoraNoVideo()
    const c = montar(base, id, x.texto, x.anexos)
    mudar((cs) => [...cs, c])
    setSel(id)
    setNova({ ...NOVA_VAZIA, geral: x.geral })
    setEntrada(null)
    caixa.current?.blur()
  }
  const caixa = useRef<HTMLTextAreaElement>(null)

  // ---------------------------------------------------------------- anexos

  const subir = async (arquivos: File[], destino: 'nova' | 'editor') => {
    const midias = arquivos.filter((f) => /^(image|video)\//.test(f.type))
    if (!midias.length) {
      if (arquivos.length) avisar('Só imagens e vídeos entram como anexo.', true)
      return
    }
    if (!n) return
    let cid: string
    if (destino === 'nova') {
      cid = nova.id ?? reservar()
      setNova((x) => ({ ...prender(x), id: cid }))
    } else {
      if (!editor) return
      cid = editor.id ?? editor.novoId ?? reservar()
      setEditor((e) => e && { ...e, novoId: e.id ? undefined : cid })
    }
    let ok = 0
    for (const f of midias) {
      try {
        const { caminho } = await anexarRevisao(pid, n, cid, f)
        ok++
        if (destino === 'nova') setNova((x) => ({ ...x, anexos: [...x.anexos, caminho] }))
        else setEditor((e) => (e ? { ...e, anexos: [...e.anexos, caminho] } : (apagarAnexoRevisao(pid, n, caminho), null)))
      } catch (e) {
        avisar(`O print não entrou: ${(e as Error).message}`, true)
      }
    }
    if (ok) avisar(ok === 1 ? 'Anexado' : `${ok} anexados`)
  }
  const colar = (destino: 'nova' | 'editor') => (e: React.ClipboardEvent) => {
    const arquivos = [...e.clipboardData.files].filter((f) => /^(image|video)\//.test(f.type))
    if (!arquivos.length) return
    e.preventDefault()
    void subir(arquivos, destino)
  }
  const soltar = (destino: 'nova' | 'editor') => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      void subir([...e.dataTransfer.files], destino)
    },
  })

  // ---------------------------------------------------------------- editar, responder, apagar

  const abrirEditor = (ed: Editor) => {
    p.pausar()
    setEditor(ed)
  }
  const gravarEditor = () => {
    const ed = editor
    if (!ed) return
    if (ed.id) {
      if (!ed.texto.trim() && !ed.anexos.length) return apagar(ed.id)
      for (const a of ed.antes) if (!ed.anexos.includes(a)) apagarAnexoRevisao(pid, n, a)
      mudar((cs) => cs.map((c) => (c.id === ed.id ? { ...c, texto: ed.texto.trim(), ...(ed.anexos.length ? { anexos: ed.anexos } : { anexos: undefined }) } : c)))
    }
    setEditor(null)
  }
  const cancelarEditor = () => {
    if (editor) for (const a of editor.anexos) if (!editor.antes.includes(a)) apagarAnexoRevisao(pid, n, a)
    setEditor(null)
  }
  const apagar = (id: string) => {
    const c = comsRef.current.find((x) => x.id === id)
    if (!c || !window.confirm(`Apagar este comentário?\n\n${c.texto || 'O comentário e os prints dele.'}`)) return
    for (const a of c.anexos ?? []) apagarAnexoRevisao(pid, n, a)
    mudar((cs) => cs.filter((x) => x.id !== id))
    setEditor(null)
  }

  // ---------------------------------------------------------------- enviar e aprovar

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      const t = document.createElement('textarea')
      t.value = texto
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    avisar('Copiado — cole no chat do Claude Code')
  }
  const antesDeEnviar = async () => {
    if (editor) gravarEditor()
    if (nova.texto.trim() || nova.anexos.length) gravarNova()
    if (timer.current) clearTimeout(timer.current)
    sujo.current = false
    await salvarRevisao(pid, n, comsRef.current)
    setSalvo('salvo')
  }
  const enviar = async () => {
    try {
      await antesDeEnviar()
      const r = await enviarRevisao(pid, n)
      setCarga((c) => c && { ...c, revisao: { ...c.revisao, enviado_em: r.revisao.enviado_em } })
      await copiar(r.texto)
    } catch (e) {
      avisar((e as Error).message, true)
    }
  }
  const aprovar = async () => {
    if (!carga?.revisao.aprovado && !window.confirm(`Aprovar a v${n}?\n\nO Claude exporta o vídeo final em 4K a partir desta versão, o projeto vira referência e o banco ganha os selos.`))
      return
    try {
      await antesDeEnviar()
      const r = await aprovarVersao(pid, n)
      setCarga((c) => c && { ...c, revisao: { ...c.revisao, aprovado: true } })
      await copiar(r.texto)
    } catch (e) {
      avisar((e as Error).message, true)
    }
  }

  // ---------------------------------------------------------------- teclado: I e O marcam um trecho, C liga e desliga o tempo

  const pRef = useRef(p)
  useEffect(() => {
    pRef.current = p
  })
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (emCampoDeTexto(e.target, e.key) || modalAberto() || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'i') {
        setNova((x) => ({ ...x, preso: false, geral: false, fim: null }))
        setEntrada(pRef.current.tempo)
        avisar(`Entrada em ${tempo(pRef.current.tempo)}. Agora O marca a saída.`)
      } else if (k === 'o') {
        setEntrada((ent) => {
          if (ent == null) {
            avisar('Marque a entrada com I antes.', true)
            return ent
          }
          const t = pRef.current.tempo
          pRef.current.pausar()
          setNova((x) => ({ ...x, preso: true, geral: false, t: Math.min(ent, t), fim: Math.abs(t - ent) < 0.05 ? null : Math.max(ent, t) }))
          setTimeout(() => caixa.current?.focus(), 0)
          return null
        })
      } else if (k === 'c') {
        e.preventDefault()
        alternarTempo()
      } else if (e.key === 'Escape') {
        if (editor) cancelarEditor()
        else if (nova.preso || entrada != null) {
          setEntrada(null)
          if (!nova.texto.trim() && !nova.anexos.length) setNova((x) => ({ ...x, preso: false, fim: null }))
        } else setSel(null)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  // ---------------------------------------------------------------- o que está na tela

  const topo = coms.filter((c) => !c.responde && temConteudo(c))
  const ordem = (t: number | null | undefined, geral?: boolean) => (geral ? -1 : (t ?? 0))
  const lista = topo.map((c) => ({ c, t: ordem(c.t, c.geral) })).sort((a, b) => a.t - b.t)
  const numero = new Map(topo.sort((a, b) => ordem(a.t, a.geral) - ordem(b.t, b.geral)).map((c, i) => [c.id, i + 1]))
  const contagem = coms.filter(temConteudo)
  const por = (s: string) => contagem.filter((c) => c.status === s).length
  const ao = agoraNoVideo()
  const chipNova = nova.geral ? null : nova.preso ? { t: nova.t, fim: nova.fim } : ao
  const rev = carga?.revisao
  const aprovado = !!rev?.aprovado

  if (versaoProjeto < 1 || erroCarga)
    return (
      <div className="grid min-h-0 place-items-center p-10 text-center text-[13px] text-fog">
        <p className="max-w-[460px] leading-[1.7]">
          {versaoProjeto < 1
            ? 'Ainda não há versão para revisar. Quando o Claude entregar (ou você salvar uma versão no seletor do topo), a revisão abre aqui.'
            : erroCarga}
        </p>
      </div>
    )

  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: `minmax(0,1fr) ${tam.linha}px` }}>
      <div className="relative grid min-h-0 min-w-0" style={{ gridTemplateColumns: '264px minmax(0,1fr) 384px' }}>
        <NoPlano projeto={p.projeto} planos={p.planos} saida={p.saida} cortes={p.cortes} tempo={p.tempo} />
        <section className="flex min-h-0 min-w-0 flex-col px-6 pt-5 pb-3">{p.previa}</section>

        <aside className="flex min-h-0 min-w-0 flex-col border-l border-line-dark text-cream">
          <div className="grid gap-2 border-b border-line-dark px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="eyebrow text-sage">Comentários · v{n}</p>
              <span className={cn('ml-auto text-[11px]', salvo === 'erro' ? 'text-coral' : 'text-fog')}>
                {salvo === 'salvando' ? 'Salvando…' : salvo === 'salvo' ? '✓ Salvo' : salvo === 'erro' ? 'Erro ao salvar' : ''}
              </span>
            </div>
            <p className="text-[12px] text-fog">
              {contagem.length} comentário{contagem.length === 1 ? '' : 's'}
              {por('aplicado') > 0 && <span className="text-sage"> · {por('aplicado')} aplicado{por('aplicado') > 1 ? 's' : ''}</span>}
              {por('respondido') > 0 && <span className="text-blue"> · {por('respondido')} respondido{por('respondido') > 1 ? 's' : ''}</span>}
              {por('nao_aplicado') > 0 && <span className="text-coral"> · {por('nao_aplicado')} não aplicado{por('nao_aplicado') > 1 ? 's' : ''}</span>}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void aprovar()}
                className={cn('rounded-full px-3.5 py-1.5 text-[12px] font-semibold ring-1', aprovado ? 'bg-mint text-ink ring-mint' : 'text-cream ring-line-dark hover:ring-mint')}
                title={aprovado ? 'Copiar de novo o "Aprovado"' : 'Aprovar esta versão (o Claude exporta o 4K e fecha o ciclo)'}
              >
                {aprovado ? '✓ Aprovado' : 'Aprovar'}
              </button>
              <button
                onClick={() => void enviar()}
                className="ml-auto rounded-full bg-coral px-3.5 py-1.5 text-[12px] font-semibold text-cream hover:brightness-110"
                title="Grava, marca como enviada e copia o texto para colar no chat do Claude Code"
              >
                Enviar revisão ↗
              </button>
            </div>
            {(aprovado || rev?.enviado_em) && (
              <p className="text-[11px] text-fog">
                {aprovado
                  ? '✓ Aprovada. Cole o "Aprovado" no chat: o Claude exporta o final em 4K.'
                  : `Revisão enviada em ${new Date(rev!.enviado_em!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Esperando a v${n + 1}.`}
              </p>
            )}
          </div>

          <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 py-3">
            {lista.length === 0 && (
              <p className="text-[12px] leading-[1.7] text-fog">
                Nenhum comentário ainda. Escreva na caixa abaixo: o vídeo pausa e o comentário fica naquele instante (<b>I</b> e <b>O</b> marcam um trecho;{' '}
                <b>C</b> desliga o tempo, para um comentário sobre o vídeo todo).
              </p>
            )}
            {lista.map((item) =>
              editor?.id === item.c.id ? (
                <CaixaEditor key={item.c.id} ed={editor} mudar={setEditor} gravar={gravarEditor} cancelar={cancelarEditor} colar={colar('editor')} soltar={soltar('editor')} anexar={(fs) => void subir(fs, 'editor')} url={(a) => urlArquivo(pid, a)} />
              ) : (
                <CartaoComentario
                  key={item.c.id}
                  c={item.c}
                  num={numero.get(item.c.id) ?? 0}
                  sel={sel === item.c.id}
                  escolher={() => {
                    setSel(item.c.id)
                    if (item.c.t != null) p.buscar(item.c.t + 0.001)
                  }}
                  editar={() => abrirEditor({ id: item.c.id, t: item.c.t, fim: item.c.fim, texto: item.c.texto, anexos: item.c.anexos ?? [], antes: item.c.anexos ?? [] })}
                  apagar={() => apagar(item.c.id)}
                  url={(a) => urlArquivo(pid, a)}
                  ver={setVerAnexo}
                />
              )
            )}
          </div>

          {/* a caixa do comentário novo, sempre embaixo */}
          <div className="grid gap-2 border-t border-line-dark px-4 py-3" onPaste={colar('nova')} {...soltar('nova')}>
            <div className="flex items-center gap-2 text-[11px] text-fog">
              <span>{nova.geral ? 'Comentário geral' : nova.preso ? 'Comentário em' : 'Comentar em'}</span>
              <button
                onClick={alternarTempo}
                title={nova.geral ? 'Religar o tempo: o comentário fica no instante do vídeo (C)' : 'Desligar o tempo: vira um comentário geral (C)'}
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ring-1',
                  nova.geral ? 'border-dashed text-fog/70 ring-line-dark' : nova.preso ? 'bg-coral text-cream ring-coral' : 'text-cream ring-line-dark',
                )}
              >
                {chipNova ? (chipNova.fim != null ? `${tempo(chipNova.t)}–${tempo(chipNova.fim)}` : tempo(chipNova.t)) : <><s>{tempo(p.tempo)}</s> sem tempo</>}
              </button>
              {nova.preso && (
                <button onClick={() => setNova((x) => ({ ...x, preso: false, fim: null }))} title="Soltar: a caixa volta a acompanhar o vídeo" className="text-fog hover:text-cream">
                  <X className="size-3.5" />
                </button>
              )}
              {entrada != null && !nova.preso && <span className="text-yellow">I em {tempo(entrada)} · O marca a saída</span>}
            </div>
            <textarea
              ref={caixa}
              value={nova.texto}
              rows={3}
              placeholder={nova.geral ? 'Sobre o vídeo todo (ex.: a trilha está alta demais).' : 'O que mudar aqui? Ao escrever, o vídeo pausa e o comentário fica neste instante.'}
              onChange={(e) => {
                const texto = e.target.value
                setNova((x) => {
                  const y = { ...x, texto }
                  if (texto.trim()) return prender(y)
                  return !x.anexos.length && x.fim == null ? { ...y, preso: false } : y
                })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  gravarNova()
                } else if (e.key === 'Escape') {
                  e.currentTarget.blur()
                }
              }}
              className={cn(
                'min-h-[96px] resize-y rounded-[6px] border bg-deeper px-3 py-2 text-[12.5px] leading-[1.6] text-cream outline-none',
                nova.preso ? 'border-coral' : 'border-line-dark focus:border-cream/50',
              )}
            />
            {nova.anexos.length > 0 && (
              <Miniaturas anexos={nova.anexos} url={(a) => urlArquivo(pid, a)} ver={setVerAnexo} tirar={(a) => {
                apagarAnexoRevisao(pid, n, a)
                setNova((x) => ({ ...x, anexos: x.anexos.filter((y) => y !== a) }))
              }} />
            )}
            <div className="flex items-center gap-2">
              <BotaoAnexar anexar={(fs) => void subir(fs, 'nova')} />
              <span className="text-[10.5px] text-fog">Enter grava · Shift+Enter quebra a linha · ⌘V cola print ou vídeo</span>
              <button onClick={gravarNova} className="ml-auto rounded-full bg-cream px-3 py-1 text-[11.5px] font-semibold text-ink hover:brightness-95">
                Comentar
              </button>
            </div>
          </div>
        </aside>

        {aviso && (
          <div className={cn('pointer-events-none absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[12px] font-semibold shadow-lg', aviso.erro ? 'bg-coral text-cream' : 'bg-cream text-ink')}>
            {aviso.texto}
          </div>
        )}
      </div>

      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        <LinhaBase
          duracao={p.duracao}
          trilhas={LINHA}
          tempo={p.tempo}
          tocando={p.tocando}
          buscar={p.buscar}
          ferramentas={<span className="text-[11px] text-fog">Espaço toca · ←/→ 0,5 s · I e O marcam um trecho · C comentário geral · ⌘V anexa</span>}
        >
          {({ x, faixa }) => (
            <>
              {p.planos.map((pl) => (
                <div
                  key={pl.id}
                  className={cn('absolute overflow-hidden rounded-[3px] px-1 text-[9.5px] leading-[26px] font-semibold whitespace-nowrap opacity-75', COR_PLANO[pl.tipo])}
                  style={{ left: x(pl.inicio) + 1, width: Math.max(x(pl.fim - pl.inicio) - 2, 2), top: faixa(0), height: LINHA[0].alt }}
                  title={`${pl.id} · ${CATEGORIAS.planos[pl.tipo] ?? pl.tipo}${pl.texto ? ` · “${pl.texto}”` : ''}\n${pl.descricao}`}
                >
                  {pl.id} {CATEGORIAS.planos[pl.tipo] ?? pl.tipo}
                </div>
              ))}
              {p.saida.map((w) => {
                const largura = x(w.saida_fim - w.saida_ini)
                const agora_ = p.tempo >= w.saida_ini && p.tempo < w.saida_fim
                return (
                  <div
                    key={w.id}
                    className={cn('absolute overflow-hidden rounded-[2px] text-center text-[10px] leading-[22px] whitespace-nowrap', agora_ ? 'bg-cream text-ink' : 'bg-cream/6 text-fog')}
                    style={{ left: x(w.saida_ini), width: Math.max(largura - 1, 1), top: faixa(1), height: LINHA[1].alt }}
                  >
                    {largura > w.texto.length * 5.6 + 4 ? w.texto : ''}
                  </div>
                )
              })}
              {topo
                .filter((c) => !c.geral && c.t != null)
                .map((c) => {
                  const larg = c.fim != null ? x(c.fim - c.t!) : 0
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSel(c.id)
                        p.buscar(c.t! + 0.001)
                      }}
                      title={`${quando(c)} · ${c.texto}`}
                      className={cn(
                        'absolute grid h-5 min-w-5 place-items-center rounded-full text-[10px] font-bold',
                        COR_STATUS[c.status],
                        sel === c.id && 'ring-2 ring-yellow',
                      )}
                      style={{ left: larg >= 10 ? x(c.t!) : x(c.t!) - 10, width: larg >= 10 ? larg : 20, top: faixa(2) + 2 }}
                    >
                      {numero.get(c.id)}
                    </button>
                  )
                })}
              {(entrada != null || (nova.preso && !nova.geral)) && (
                <div
                  className="pointer-events-none absolute bg-yellow/25"
                  style={{
                    left: x(entrada ?? nova.t),
                    width: Math.max(x(Math.abs((entrada != null ? p.tempo : (nova.fim ?? nova.t)) - (entrada ?? nova.t))), 2),
                    top: faixa(0),
                    bottom: 0,
                  }}
                />
              )}
            </>
          )}
        </LinhaBase>
      </div>
      {verAnexo && <VerAnexo url={verAnexo} fechar={() => setVerAnexo(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- o plano sob o cursor e o que há nele

function NoPlano(p: { projeto: Projeto; planos: ItemRef[]; saida: PalavraSaida[]; cortes: CorteDoVideo[] | null; tempo: number }) {
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [motions, setMotions] = useState<Record<string, MotionPlano>>({})
  const pid = p.projeto.id
  useEffect(() => {
    void lerInserts(pid).then(setIns).catch(() => undefined)
    void motionsDoProjeto(pid).then(setMotions).catch(() => undefined)
  }, [pid, p.projeto.versao, p.projeto.direcao?.gerado_em])
  const pl = planoEm(p.planos, p.tempo)
  const ws = [...p.saida].sort((a, b) => a.saida_ini - b.saida_ini)
  const w = palavraEm(ws, p.tempo)
  const k = w ? ws.indexOf(w) : -1
  const pedido = pl ? ins?.pedidos.find((x) => x.plano === pl.id) : undefined
  const motion = pl ? motions[pl.id] : undefined
  const corte = pl ? p.cortes?.find((c) => c.plano === pl.id) : undefined
  const movimento = pl ? ins?.ator_planos?.[pl.id] : undefined
  const preset = (pedido?.enriquecimento as { preset?: string | null } | undefined)?.preset
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-line-dark text-cream">
      <Cabecalho icone={MessageSquareText} titulo="Revisão" />
      <div className="grid min-h-0 content-start gap-5 overflow-y-auto px-4 py-4 text-[12px]">
        <div className="grid gap-1.5">
          <p className="eyebrow text-sage">Plano agora</p>
          {pl ? (
            <>
              <span className={cn('w-fit rounded-[4px] px-2 py-0.5 text-[11px] font-semibold', COR_PLANO[pl.tipo])}>
                <b>{pl.id}</b> {CATEGORIAS.planos[pl.tipo] ?? pl.tipo}
              </span>
              {pl.texto && <p className="text-cream/80">“{pl.texto}”</p>}
              {pl.descricao && <p className="leading-[1.6] text-fog">{pl.descricao}</p>}
            </>
          ) : (
            <p className="text-fog">—</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <p className="eyebrow text-sage">Fala</p>
          <p className="leading-[1.7] text-fog">
            {k > 5 && '… '}
            {ws.slice(Math.max(k - 5, 0), k + 6).map((x) => (
              <span key={x.id} className={x.id === w?.id ? 'rounded-[3px] bg-coral/25 px-0.5 font-semibold text-cream' : ''}>
                {x.texto}{' '}
              </span>
            ))}
            {k >= 0 && k + 6 < ws.length && '…'}
          </p>
        </div>
        <div className="grid gap-2">
          <p className="eyebrow text-sage">No plano</p>
          {pedido?.midias.map((m) => (
            <div key={m.id} className="grid gap-1">
              <img src={urlBancoMiniatura(m.banco)} alt="" className="aspect-video w-full rounded-[4px] bg-black object-cover" />
              <ChipCodigo tipo="midia" id={m.banco} className="w-fit" />
            </div>
          ))}
          {pedido && !pedido.midias.length && <p className="text-yellow">Insert sem mídia</p>}
          {preset && (
            <p className="flex items-center gap-2 text-fog">
              Preset <ChipCodigo tipo="preset" id={preset} />
            </p>
          )}
          {motion && (
            <p className="flex items-center gap-2 text-fog">
              Motion · {motion.nome} {motion.tipo === 'preset' ? <ChipCodigo tipo="motion" id={motion.preset} /> : <ChipCodigo tipo="midia" id={motion.banco} />}
            </p>
          )}
          {movimento && <p className="text-fog">Câmera no ator · {movimento.replace('_', ' ')}</p>}
          {corte?.transicao && (
            <p className="flex items-center gap-2 text-fog">
              Transição de entrada · {corte.transicao.nome} <ChipCodigo tipo="transicao" id={corte.transicao.id} />
            </p>
          )}
          {!pedido && !motion && !corte?.transicao && !movimento && <p className="text-fog">—</p>}
        </div>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- os cartões

function Resposta({ c }: { c: Comentario }) {
  if (c.status === 'pendente' && !c.resposta) return null
  return (
    <div className="mt-2 border-l-2 border-line-dark pl-2.5">
      <p className={cn('text-[10px] font-semibold tracking-[0.08em] uppercase', c.status === 'aplicado' ? 'text-sage' : c.status === 'respondido' ? 'text-blue' : 'text-coral')}>
        Claude · {c.status !== 'pendente' ? NOME_STATUS[c.status] : 'respondeu'}
        {c.status === 'aplicado' && ' ✓'}
      </p>
      {c.resposta && <p className="mt-0.5 leading-[1.6] whitespace-pre-wrap text-cream/85">{c.resposta}</p>}
    </div>
  )
}

function CartaoComentario(p: { c: Comentario; num: number; sel: boolean; escolher: () => void; editar: () => void; apagar: () => void; url: (a: string) => string; ver: (u: string) => void }) {
  const { c } = p
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (p.sel) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [p.sel])
  return (
    <div
      ref={ref}
      onClick={() => !window.getSelection()?.toString() && p.escolher()}
      className={cn('group cursor-pointer rounded-[8px] p-3 text-[12.5px] ring-1', p.sel ? 'ring-coral' : 'ring-line-dark hover:ring-cream/30')}
    >
      <div className="flex items-center gap-2">
        <span className={cn('grid size-5 place-items-center rounded-full text-[10px] font-bold', COR_STATUS[c.status])}>{p.num}</span>
        <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10.5px] tabular-nums ring-1 ring-line-dark', c.geral ? 'text-fog' : 'text-cream')}>{quando(c)}</span>
        {c.plano && <span className="text-[10.5px] text-fog">{c.plano}</span>}
        <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={(e) => (e.stopPropagation(), p.editar())} title="Editar" className="text-fog hover:text-cream">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={(e) => (e.stopPropagation(), p.apagar())} title="Apagar" className="text-fog hover:text-coral">
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
      {c.fala && <p className="mt-1.5 text-[11px] text-fog italic">“{c.fala}”</p>}
      {c.texto && <p className="mt-1 leading-[1.6] whitespace-pre-wrap">{c.texto}</p>}
      {c.anexos?.length ? <Miniaturas anexos={c.anexos} url={p.url} ver={p.ver} /> : null}
      <Resposta c={c} />
    </div>
  )
}

function CaixaEditor(p: {
  ed: Editor
  mudar: (f: (e: Editor | null) => Editor | null) => void
  gravar: () => void
  cancelar: () => void
  colar: (e: React.ClipboardEvent) => void
  soltar: { onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void }
  anexar: (fs: File[]) => void
  url: (a: string) => string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = ref.current
    if (!t) return
    t.focus()
    t.setSelectionRange(t.value.length, t.value.length)
    t.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <div className="grid gap-2 rounded-[8px] p-3 ring-1 ring-coral" onPaste={p.colar} {...p.soltar} onClick={(e) => e.stopPropagation()}>
      <p className="eyebrow text-coral">{p.ed.responde ? 'Sua resposta' : 'Editar comentário'}</p>
      <textarea
        ref={ref}
        value={p.ed.texto}
        rows={3}
        placeholder={p.ed.responde ? 'Responda a dúvida (⌘V ou arraste para anexar print ou vídeo)' : 'O que mudar aqui? (⌘V ou arraste para anexar print ou vídeo)'}
        onChange={(e) => {
          const texto = e.target.value
          p.mudar((x) => x && { ...x, texto })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            p.gravar()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            p.cancelar()
          }
        }}
        className="min-h-[80px] resize-y rounded-[6px] border border-line-dark bg-deeper px-3 py-2 text-[12.5px] leading-[1.6] text-cream outline-none focus:border-cream/50"
      />
      {p.ed.anexos.length > 0 && (
        <Miniaturas anexos={p.ed.anexos} url={p.url} ver={() => undefined} tirar={(a) => p.mudar((x) => x && { ...x, anexos: x.anexos.filter((y) => y !== a) })} />
      )}
      <div className="flex items-center gap-2">
        <BotaoAnexar anexar={p.anexar} />
        <span className="text-[10.5px] text-fog">Enter salva · Esc cancela</span>
        <button onClick={p.cancelar} className="ml-auto text-[11.5px] text-fog hover:text-cream">
          Cancelar
        </button>
        <button onClick={p.gravar} className="rounded-full bg-coral px-3 py-1 text-[11.5px] font-semibold text-cream">
          Salvar
        </button>
      </div>
    </div>
  )
}

const ehVideo = (a: string) => /\.(mp4|mov|webm)$/i.test(a)

function Miniaturas(p: { anexos: string[]; url: (a: string) => string; ver: (u: string) => void; tirar?: (a: string) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      {p.anexos.map((a) => (
        <div key={a} className="group/an relative h-14 w-[76px] overflow-hidden rounded-[4px] bg-black ring-1 ring-line-dark">
          <button onClick={() => p.ver(p.url(a))} className="size-full" title="Ver">
            {ehVideo(a) ? (
              <>
                <video src={`${p.url(a)}#t=0.1`} muted preload="metadata" className="size-full object-cover" />
                <Play className="absolute top-1/2 left-1/2 size-4 -translate-1/2 text-cream" />
              </>
            ) : (
              <img src={p.url(a)} alt="" className="size-full object-cover" />
            )}
          </button>
          {p.tirar && (
            <button onClick={() => p.tirar!(a)} title="Tirar o print" className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-ink/85 text-cream opacity-0 group-hover/an:opacity-100">
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function BotaoAnexar({ anexar }: { anexar: (fs: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => ref.current?.click()} title="Anexar imagens ou vídeos (também dá para colar com ⌘V ou arrastar)" className="text-fog hover:text-cream">
        <Paperclip className="size-4" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          anexar([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </>
  )
}

function VerAnexo({ url, fechar }: { url: string; fechar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [fechar])
  return (
    <div data-modal className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-8" onClick={fechar}>
      {ehVideo(url) ? (
        <video src={url} controls autoPlay className="max-h-full max-w-full rounded-[6px]" onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt="" className="max-h-full max-w-full rounded-[6px]" />
      )}
      <button onClick={fechar} title="Fechar (Esc)" className="absolute top-5 right-5 grid size-9 place-items-center rounded-full bg-ink/85 text-cream">
        <X className="size-4" />
      </button>
    </div>
  )
}
