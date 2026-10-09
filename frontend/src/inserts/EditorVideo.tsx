import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pause, Play, Scissors, Trash2 } from 'lucide-react'
import { apagarItemBanco, cortarOriginal, criarTrecho, editarItemBanco, lerItemBanco, urlBancoArquivo, urlBancoTira, versaoBanco, type ItemBanco } from '@/api'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUADRO = 1 / 30
const MIN = 0.2
const q = (t: number) => Math.round(t / QUADRO) * QUADRO
const tc = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`.replace('.', ',')
}

/** Um trecho na tela: um que já existe no banco (`id`) ou um novo. */
type Faixa = { chave: string; id?: string; nome: string; inicio: number; fim: number; usar: boolean; mudou: boolean; usos: number }

type Props = {
  /** O vídeo original (ou um trecho dele: o editor abre o original com esse trecho em destaque). */
  bid: string
  fechar: () => void
  /** Dentro de um insert: devolve os itens a ligar, em ordem (trechos marcados, ou o original inteiro), o original e os
   *  trechos apagados aqui. */
  aplicar?: (original: string, ids: string[], apagados: string[]) => void
  /** Itens do banco já ligados ao insert (vêm marcados). */
  ligados?: string[]
  /** O banco mudou (trechos criados, editados, apagados, corte pedido). */
  mudou?: () => void
  /** Aberto a partir do "Escolher do banco": volta para a escolha. */
  voltar?: () => void
}

/** Editor de vídeo do banco (SPEC §8.3): marca trechos (arrastando na timeline ou com I e O) que viram itens do banco
 *  ligados ao original, e corta as pontas do próprio original. */
export default function EditorVideo(p: Props) {
  const [original, setOriginal] = useState<ItemBanco | null>(null)
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [modo, setModo] = useState<'trechos' | 'cortar'>('trechos')
  const [corte, setCorte] = useState<{ inicio: number; fim: number }>({ inicio: 0, fim: 0 })
  const [tempo, setTempo] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [entrada, setEntrada] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [apagados, setApagados] = useState<string[]>([])
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const parar = useRef<number | null>(null)
  const dur = original?.duracao ?? 0

  useEffect(() => {
    void lerItemBanco(p.bid).then(async (i) => {
      const o = i.pai ? await lerItemBanco(i.pai) : i
      setOriginal(o)
      setCorte({ inicio: 0, fim: o.duracao })
      const ligados = new Set(p.ligados ?? [])
      setFaixas(
        (o.trechos ?? []).map((t) => ({
          chave: t.id,
          id: t.id,
          nome: t.nome,
          inicio: t.inicio ?? 0,
          fim: t.fim ?? 0,
          usar: ligados.has(t.id) || t.id === p.bid,
          mudou: false,
          usos: t.usos?.length ?? 0,
        })),
      )
    })
  }, [p.bid]) // eslint-disable-line react-hooks/exhaustive-deps

  // relógio do player; para no fim do trecho que está tocando
  useEffect(() => {
    const v = video.current
    if (!v) return
    const t = () => {
      setTempo(v.currentTime)
      if (parar.current != null && v.currentTime >= parar.current) {
        v.pause()
        parar.current = null
      }
    }
    const ligar = () => setTocando(true)
    const desligar = () => setTocando(false)
    v.addEventListener('timeupdate', t)
    v.addEventListener('play', ligar)
    v.addEventListener('pause', desligar)
    let raf = 0
    const loop = () => {
      t()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      v.removeEventListener('timeupdate', t)
      v.removeEventListener('play', ligar)
      v.removeEventListener('pause', desligar)
      cancelAnimationFrame(raf)
    }
  }, [original])

  // ao arrastar, as buscas não fazem fila: enquanto uma está em andamento, guarda só o ponto mais recente e vai para ele
  // quando ela termina (o tempo mostrado acompanha o mouse na hora)
  const pendente = useRef<number | null>(null)
  const buscar = (t: number) => {
    const v = video.current
    if (!v) return
    const alvo = Math.max(0, Math.min(t, dur))
    setTempo(alvo)
    if (v.seeking) {
      pendente.current = alvo
      return
    }
    v.currentTime = alvo
  }
  useEffect(() => {
    const v = video.current
    if (!v) return
    const seguinte = () => {
      if (pendente.current == null) return
      v.currentTime = pendente.current
      pendente.current = null
    }
    v.addEventListener('seeked', seguinte)
    return () => v.removeEventListener('seeked', seguinte)
  }, [original])
  const tocarTrecho = (a: number, b: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = a
    parar.current = b
    void v.play()
  }
  const alternar = () => {
    const v = video.current
    if (!v) return
    parar.current = null
    void (v.paused ? v.play() : v.pause())
  }
  const nova = (a: number, b: number) => {
    const [ini, fim] = [q(Math.max(0, Math.min(a, b))), q(Math.min(dur, Math.max(a, b)))]
    if (fim - ini < MIN) return
    const chave = crypto.randomUUID()
    setFaixas((l) => [...l, { chave, nome: `${original?.nome ?? 'vídeo'} · trecho ${l.length + 1}`, inicio: ini, fim, usar: !!p.aplicar, mudou: true, usos: 0 }])
    setSelecionada(chave)
  }
  const mudar = (chave: string, campos: Partial<Faixa>) => setFaixas((l) => l.map((f) => (f.chave === chave ? { ...f, ...campos, mudou: true } : f)))

  // teclas: I marca a entrada, O fecha o trecho, espaço toca/pausa (só o trecho selecionado, se houver), setas andam um
  // quadro. O modal pega as teclas antes de todos (fase de captura) e não as deixa chegar à tela de trás.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape') return p.fechar()
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const t = video.current?.currentTime ?? 0
      const k = e.key.toLowerCase()
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionada && modo === 'trechos') {
        const f = faixas.find((x) => x.chave === selecionada)
        if (f) void apagar(f)
      } else if (k === 'i' && modo === 'trechos') setEntrada(q(t))
      else if (k === 'o' && modo === 'trechos' && entrada != null) {
        nova(entrada, t)
        setEntrada(null)
      } else if (k === ' ') {
        e.preventDefault()
        const f = modo === 'trechos' && faixas.find((x) => x.chave === selecionada)
        if (f && video.current?.paused) tocarTrecho(f.inicio, f.fim)
        else alternar()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        video.current?.pause()
        buscar(q(t) + (e.key === 'ArrowRight' ? 1 : -1) * QUADRO * (e.shiftKey ? 30 : 1))
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  })

  async function salvar() {
    if (!original) return
    setSalvando(true)
    setErro('')
    try {
      const ids: string[] = []
      for (const f of [...faixas].sort((a, b) => a.inicio - b.inicio)) {
        let id = f.id
        if (!id) id = (await criarTrecho(original.id, { inicio: f.inicio, fim: f.fim, nome: f.nome })).id
        else if (f.mudou) {
          const outros = f.usos - ((p.ligados ?? []).includes(f.id!) ? 1 : 0)
          const todos =
            outros <= 0 || window.confirm(`“${f.nome}” está em ${outros} outro(s) insert(s). OK muda em todos; Cancelar salva como trecho novo.`)
          id = todos
            ? (await editarItemBanco(f.id!, { inicio: f.inicio, fim: f.fim, nome: f.nome })).id
            : (await criarTrecho(original.id, { inicio: f.inicio, fim: f.fim, nome: f.nome })).id
        }
        if (f.usar) ids.push(id!)
      }
      p.mudou?.()
      if (p.aplicar) p.aplicar(original.id, ids.length ? ids : [original.id], apagados)
      else p.fechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar(f: Faixa) {
    if (f.id) {
      if (!window.confirm(f.usos ? `“${f.nome}” está em ${f.usos} insert(s). Apagar o trecho e tirar de todos?` : `Apagar “${f.nome}” do banco?`)) return
      await apagarItemBanco(f.id).catch((e) => setErro((e as Error).message))
      setApagados((l) => [...l, f.id!])
      p.mudou?.()
    }
    setFaixas((l) => l.filter((x) => x.chave !== f.chave))
    setSelecionada(null)
  }

  async function cortar() {
    if (!original) return
    const n = faixas.filter((f) => f.id).length
    const aviso = `Cortar o original para ${tc(corte.inicio)} → ${tc(corte.fim)}? O arquivo é regravado (alguns segundos a minutos).${
      n ? ` Os ${n} trecho(s) acompanham; os que ficarem fora somem.` : ''
    }`
    if (!window.confirm(aviso)) return
    try {
      await cortarOriginal(original.id, corte)
      p.mudou?.()
      p.fechar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const marcadas = faixas.filter((f) => f.usar).length
  const ordenadas = [...faixas].sort((a, b) => a.inicio - b.inicio)
  return (
    <Modal
      titulo={
        <span className="flex items-center gap-3">
          {p.voltar && (
            <button
              onClick={p.voltar}
              className="flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 text-[12px] font-semibold text-fog hover:text-cream"
              title="Voltar para a escolha no banco"
            >
              <ArrowLeft className="size-3.5" /> Banco
            </button>
          )}
          {original ? `Editar vídeo · ${original.nome}` : 'Editar vídeo'}
        </span>
      }
      fechar={p.fechar}
      tamanho="largo"
    >
      {!original ? (
        <p className="text-[12.5px] text-fog">Carregando…</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)_auto] gap-x-5 gap-y-4">
          {/* o vídeo ocupa a área e cabe nela (em pé ou deitado), sem empurrar a timeline */}
          <div className="relative min-h-0 overflow-hidden rounded-[6px] bg-black">
            <video
              ref={video}
              src={urlBancoArquivo(original.id) + versaoBanco(original)}
              playsInline
              className="absolute inset-0 size-full object-contain"
              onClick={alternar}
            />
          </div>

          {/* trechos */}
          <div className="row-span-2 flex min-h-0 flex-col gap-3 text-[12px]">
            <div className="flex gap-1 text-[11px] font-semibold">
              {(['trechos', 'cortar'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  className={cn('rounded-full px-3 py-1.5', modo === m ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
                >
                  {m === 'trechos' ? 'Trechos' : 'Cortar o original'}
                </button>
              ))}
            </div>
            {modo === 'trechos' ? (
              <>
                <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
                  {ordenadas.map((f, n) => (
                    <div
                      key={f.chave}
                      onClick={() => {
                        setSelecionada(f.chave)
                        buscar(f.inicio)
                      }}
                      className={cn(
                        'group flex h-9 cursor-pointer items-center gap-2 rounded-[4px] px-2 transition-colors',
                        selecionada === f.chave ? 'bg-cream/12' : 'hover:bg-cream/6',
                      )}
                      title={f.usos ? `Em ${f.usos} insert${f.usos > 1 ? 's' : ''}` : undefined}
                    >
                      {p.aplicar && (
                        <input
                          type="checkbox"
                          checked={f.usar}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setFaixas((l) => l.map((x) => (x.chave === f.chave ? { ...x, usar: e.target.checked } : x)))}
                          className="accent-coral"
                        />
                      )}
                      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold', f.usar || !p.aplicar ? 'bg-coral text-cream' : 'bg-cream/15 text-fog')}>
                        {n + 1}
                      </span>
                      <input
                        value={f.nome}
                        onChange={(e) => mudar(f.chave, { nome: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 min-w-0 flex-1 truncate rounded-[3px] border border-transparent bg-transparent px-1 text-[12px] text-cream outline-none hover:border-line-dark focus:border-cream/40 focus:bg-deeper"
                      />
                      <span className="shrink-0 text-[11px] text-fog tabular-nums">{(f.fim - f.inicio).toFixed(1).replace('.', ',')} s</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          tocarTrecho(f.inicio, f.fim)
                        }}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream"
                        aria-label="Tocar trecho"
                      >
                        <Play className="size-3 fill-current" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void apagar(f)
                        }}
                        className="grid size-6 shrink-0 place-items-center rounded-full text-fog opacity-0 group-hover:opacity-100 hover:text-coral"
                        aria-label="Apagar trecho"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {!faixas.length && (
                    <p className="px-2 py-1 leading-[1.6] text-fog">
                      Arraste na timeline para criar um trecho.{p.aplicar ? ' Sem trechos, entra o vídeo inteiro.' : ''}
                    </p>
                  )}
                </div>
                {erro && <p className="text-coral">{erro}</p>}
                <Button variant="coral" size="sm" className="h-10" onClick={() => void salvar()} disabled={salvando}>
                  {salvando ? 'Salvando…' : p.aplicar ? (marcadas ? `Usar ${marcadas} trecho${marcadas > 1 ? 's' : ''} no insert` : 'Usar o vídeo inteiro') : 'Salvar trechos'}
                </Button>
              </>
            ) : (
              <>
                <p className="leading-[1.6] text-fog">
                  Arraste as pontas na timeline para ficar só com o que importa. O arquivo original é regravado em alta qualidade; os trechos acompanham o novo começo.
                </p>
                <div className="grid grid-cols-2 gap-2 tabular-nums">
                  <Button variant="pill" size="sm" className="text-fog hover:text-cream" onClick={() => setCorte((c) => ({ ...c, inicio: Math.min(q(tempo), c.fim - MIN) }))}>
                    Começo aqui
                  </Button>
                  <Button variant="pill" size="sm" className="text-fog hover:text-cream" onClick={() => setCorte((c) => ({ ...c, fim: Math.max(q(tempo), c.inicio + MIN) }))}>
                    Fim aqui
                  </Button>
                </div>
                <p className="text-[12.5px] tabular-nums">
                  {tc(corte.inicio)} → {tc(corte.fim)} · fica {(corte.fim - corte.inicio).toFixed(1).replace('.', ',')} s de {dur.toFixed(1).replace('.', ',')} s
                </p>
                {erro && <p className="text-coral">{erro}</p>}
                <Button
                  variant="coral"
                  size="sm"
                  className="mt-auto h-10"
                  onClick={() => void cortar()}
                  disabled={corte.inicio < QUADRO && corte.fim > dur - QUADRO}
                >
                  <Scissors className="size-3.5" /> Cortar o original
                </Button>
              </>
            )}
          </div>

          {/* controles + timeline */}
          <div className="grid gap-2">
            <div className="flex items-center gap-3 text-[12px] tabular-nums">
              <button onClick={alternar} className="grid size-9 place-items-center rounded-full bg-cream text-ink" aria-label={tocando ? 'Pausar' : 'Tocar'}>
                {tocando ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
              </button>
              <span>
                {tc(Math.min(tempo, dur))} / {tc(dur)}
              </span>
              {entrada != null && <span className="text-yellow">entrada em {tc(entrada)} · aperte O para fechar</span>}
              <span className="ml-auto text-[11px] text-fog">{modo === 'trechos' ? 'arraste para criar · I / O · ' : ''}← → um quadro · espaço toca</span>
            </div>
            <Timeline
              bid={original.id}
              versao={versaoBanco(original)}
              dur={dur}
              tempo={tempo}
              modo={modo}
              faixas={ordenadas}
              aplicar={!!p.aplicar}
              selecionada={selecionada}
              selecionar={setSelecionada}
              apagar={(f) => void apagar(f)}
              corte={corte}
              buscar={buscar}
              nova={nova}
              mudarFaixa={(chave, a, b) => mudar(chave, { inicio: a, fim: b })}
              mudarCorte={setCorte}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}

/** A timeline: tira de quadros, os trechos (ou a faixa que fica, no corte), a cabeça de reprodução. Clicar busca;
 *  arrastar no vazio cria um trecho; clicar num trecho seleciona (com a lixeira em cima) e arrastar o move; arrastar as
 *  pontas ajusta. */
function Timeline(p: {
  bid: string
  versao: string
  dur: number
  tempo: number
  modo: 'trechos' | 'cortar'
  faixas: Faixa[]
  aplicar: boolean
  selecionada: string | null
  selecionar: (chave: string | null) => void
  apagar: (f: Faixa) => void
  corte: { inicio: number; fim: number }
  buscar: (t: number) => void
  nova: (a: number, b: number) => void
  mudarFaixa: (chave: string, a: number, b: number) => void
  mudarCorte: (c: { inicio: number; fim: number }) => void
}) {
  const area = useRef<HTMLDivElement>(null)
  const [arrasto, setArrasto] = useState<{ a: number; b: number } | null>(null)
  const pct = (t: number) => `${Math.max(0, Math.min(1, t / Math.max(p.dur, 0.001))) * 100}%`
  const emT = (x: number) => {
    const r = area.current!.getBoundingClientRect()
    return q(Math.max(0, Math.min(1, (x - r.left) / r.width)) * p.dur)
  }
  const segue = (mover: (ev: PointerEvent) => void, fim?: () => void) => {
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      fim?.()
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // arrastar no vazio: cria um trecho; um clique (ou um arrasto de menos de 6 px) só busca e tira a seleção
  const comecar = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const a = emT(e.clientX)
    const x0 = e.clientX
    p.buscar(a)
    p.selecionar(null)
    if (p.modo !== 'trechos') return
    let b = a
    let criando = false
    segue(
      (ev) => {
        criando = criando || Math.abs(ev.clientX - x0) >= 6
        b = emT(ev.clientX)
        if (criando) setArrasto({ a, b })
        p.buscar(b)
      },
      () => {
        setArrasto(null)
        if (criando && Math.abs(b - a) >= MIN) p.nova(a, b)
      },
    )
  }
  // a régua: clicar e arrastar só anda pelo vídeo
  const navegar = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    p.buscar(emT(e.clientX))
    segue((ev) => p.buscar(emT(ev.clientX)))
  }
  // marcas da régua: um passo que dê umas 10 marcas
  const passo = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((x) => p.dur / x <= 12) ?? 600
  const marcas = Array.from({ length: Math.floor(p.dur / passo + 1e-6) + 1 }, (_, k) => k * passo)
  const rotulo = (t: number) => {
    const m = Math.floor(t / 60)
    const seg = t - m * 60
    return passo < 1 ? `${m}:${seg.toFixed(1).padStart(4, '0')}`.replace('.', ',') : `${m}:${String(Math.round(seg)).padStart(2, '0')}`
  }
  // arrastar o corpo de um trecho: seleciona e move (a duração fica)
  const mover = (e: React.PointerEvent, f: Faixa) => {
    e.stopPropagation()
    if (e.button !== 0) return
    p.selecionar(f.chave)
    const x0 = emT(e.clientX)
    const d = f.fim - f.inicio
    let andou = false
    segue(
      (ev) => {
        const ini = q(Math.max(0, Math.min(f.inicio + emT(ev.clientX) - x0, p.dur - d)))
        andou = andou || ini !== f.inicio
        p.mudarFaixa(f.chave, ini, ini + d)
        p.buscar(ini)
      },
      () => !andou && p.buscar(f.inicio),
    )
  }
  // arrastar uma ponta
  const ponta = (e: React.PointerEvent, ini: number, fim: number, lado: 'a' | 'b', aplicar: (a: number, b: number) => void) => {
    e.stopPropagation()
    segue((ev) => {
      const t = emT(ev.clientX)
      p.buscar(t)
      if (lado === 'a') aplicar(Math.min(t, fim - MIN), fim)
      else aplicar(ini, Math.max(t, ini + MIN))
    })
  }
  const pontas = (a: number, b: number, aplicar: (a: number, b: number) => void) => (
    <>
      <span onPointerDown={(e) => ponta(e, a, b, 'a', aplicar)} className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-ew-resize" />
      <span onPointerDown={(e) => ponta(e, a, b, 'b', aplicar)} className="absolute inset-y-0 -right-1.5 z-10 w-3 cursor-ew-resize" />
    </>
  )

  return (
    <div className="pt-1">
      <div onPointerDown={navegar} className="relative mb-1 h-6 cursor-pointer touch-none select-none" title="Clique ou arraste para andar pelo vídeo">
        {marcas.map((t) => (
          <span
            key={t}
            className={cn('absolute bottom-0 flex flex-col', t / p.dur > 0.95 ? '-translate-x-full items-end' : '-translate-x-px items-start')}
            style={{ left: pct(t) }}
          >
            <span className="text-[10px] leading-none text-fog tabular-nums">{rotulo(t)}</span>
            <span className="mt-1 h-1.5 w-px bg-fog/60" />
          </span>
        ))}
        <span className="absolute bottom-0 h-3 w-0.5 -translate-x-1/2 bg-coral" style={{ left: pct(p.tempo) }} />
      </div>
      <div
        ref={area}
        onPointerDown={comecar}
        className="relative h-[72px] cursor-crosshair touch-none rounded-[4px] bg-deeper select-none"
        style={{ backgroundImage: `url(${urlBancoTira(p.bid)}${p.versao})`, backgroundSize: '100% 100%' }}
      >
        {p.modo === 'trechos' ? (
          <>
            {p.faixas.map((f, n) => {
              const sel = p.selecionada === f.chave
              const ativo = f.usar || !p.aplicar
              return (
                <div
                  key={f.chave}
                  onPointerDown={(e) => mover(e, f)}
                  className={cn(
                    'absolute inset-y-0 cursor-grab rounded-[3px] border-2 active:cursor-grabbing',
                    ativo ? 'border-coral bg-coral/25' : 'border-cream/60 bg-cream/10',
                    sel && 'z-20 border-yellow bg-yellow/25 shadow-[0_0_0_2px_#0006]',
                  )}
                  style={{ left: pct(f.inicio), width: `calc(${pct(f.fim)} - ${pct(f.inicio)})` }}
                >
                  <span className={cn('absolute top-1 left-1 grid size-4 place-items-center rounded-full text-[9px] font-semibold', sel ? 'bg-yellow text-ink' : ativo ? 'bg-coral text-cream' : 'bg-cream/30 text-ink')}>
                    {n + 1}
                  </span>
                  {sel && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => p.apagar(f)}
                      className="absolute top-1 right-1 z-20 grid size-6 place-items-center rounded-full bg-ink/90 text-fog shadow ring-1 ring-line-dark hover:text-coral"
                      aria-label="Apagar trecho"
                      title="Apagar trecho (Delete)"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  {pontas(f.inicio, f.fim, (a, b) => p.mudarFaixa(f.chave, a, b))}
                </div>
              )
            })}
            {arrasto && (
              <div
                className="pointer-events-none absolute inset-y-0 border-2 border-dashed border-yellow bg-yellow/20"
                style={{ left: pct(Math.min(arrasto.a, arrasto.b)), width: `calc(${pct(Math.max(arrasto.a, arrasto.b))} - ${pct(Math.min(arrasto.a, arrasto.b))})` }}
              />
            )}
          </>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/70" style={{ width: pct(p.corte.inicio) }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/70" style={{ width: `calc(100% - ${pct(p.corte.fim)})` }} />
            <div className="absolute inset-y-0 rounded-[3px] border-2 border-yellow" style={{ left: pct(p.corte.inicio), width: `calc(${pct(p.corte.fim)} - ${pct(p.corte.inicio)})` }}>
              {pontas(p.corte.inicio, p.corte.fim, (a, b) => p.mudarCorte({ inicio: a, fim: b }))}
            </div>
          </>
        )}
        <div className="pointer-events-none absolute -inset-y-1 z-30 w-0.5 bg-coral" style={{ left: pct(p.tempo) }} />
      </div>
    </div>
  )
}
