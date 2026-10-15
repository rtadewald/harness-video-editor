import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, CircleCheck, Image as ImageIcon, Video, CircleDashed, CircleX, Clapperboard, Images, LayoutGrid, Scissors, Sparkles, Star, Trash2, X, type LucideIcon } from 'lucide-react'
import {
  NOME_TIPO_MIDIA,
  apagarItemBanco,
  descreverItemBanco,
  editarItemBanco,
  lerItemBanco,
  lerRecusados,
  limparRecusados,
  listarBanco,
  marcarSeloBanco,
  subirNoBanco,
  urlBancoArquivo,
  urlBancoMiniatura,
  versaoBanco,
  type ItemBanco,
  type SeloBanco as Selo,
} from '@/api'
import SeloBanco from '@/components/SeloBanco'
import { MiniaturaPreset } from '@/motions/PresetMotion'
import { aprovarPreset, esquecerPresets, listarRecusados as listarMotionsRecusados, presetsEmCache, recusarPreset, type Preset, type PresetRecusado } from '@/motions/api'
import EditorVideo from '@/inserts/EditorVideo'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChipCodigo } from '@/components/Codigo'

const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'
const STATUS_IA: Record<ItemBanco['ia']['status'], string> = {
  fila: 'descrição na fila',
  rodando: 'descrevendo…',
  pronto: '',
  erro: 'a descrição falhou',
  pendente: 'sem descrição',
}
/** O que a grade mostra: as mídias dos inserts e os motions, juntos ou um de cada vez (como no Banco do 19). */
type Tipo = 'tudo' | 'inserts' | 'motions'
const FILTROS: [Tipo, string, LucideIcon][] = [
  ['tudo', 'Tudo', LayoutGrid],
  ['inserts', 'Inserts', Images],
  ['motions', 'Motions', Clapperboard],
]
/** O selo de um motion: aprovado, ou nenhum enquanto o Claude o deixa "a revisar". */
const seloDoMotion = (m: Preset): Selo | null => (m.a_revisar ? null : 'aprovado')
/** O filtro pelo selo da faxina ('nenhum': sem selo, de um projeto ainda em edição). */
const FILTROS_SELO: [Selo | 'nenhum', string, LucideIcon][] = [
  ['usado', 'Usados', Star],
  ['aprovado', 'Aprovados', CircleCheck],
  ['recusado', 'Recusados', CircleX],
  ['nenhum', 'Sem selo', CircleDashed],
]
const seg = (t: number) => `${t.toFixed(1).replace('.', ',')} s`
const CAMPO = 'w-full rounded-[3px] border border-line-dark bg-deeper px-2.5 py-2 text-[12.5px] text-cream outline-none focus:border-cream/60'

/** O banco (SPEC §8.3, §8.15): as mídias dos inserts e os motions numa grade só (Tudo · Inserts · Motions; antes eram
 *  duas páginas). Subir (arrastando vários), filtrar pelo tipo e pelo selo, editar nome/descrição/palavras-chave (a IA
 *  sugere em segundo plano), ver onde é usado; nos motions que o Claude escreveu, aprovar ou recusar com o motivo. */
export default function Banco() {
  const [itens, setItens] = useState<ItemBanco[] | null>(null)
  const [busca] = useSearchParams()
  const [tipo, setTipo] = useState<Tipo>(() => (busca.get('tipo') === 'motions' ? 'motions' : busca.get('tipo') === 'inserts' ? 'inserts' : 'tudo'))
  const [motions, setMotions] = useState<Preset[]>([])
  const [motionAberto, setMotionAberto] = useState<string | null>(null)
  const [motionsRecusados, setMotionsRecusados] = useState<PresetRecusado[]>([])
  const [selo, setSelo] = useState<Selo | 'nenhum' | null>(null)
  const [recusados, setRecusados] = useState<string[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const [erro, setErro] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  const carregar = () => {
    esquecerPresets()
    return Promise.all([listarBanco(''), lerRecusados(), presetsEmCache(), listarMotionsRecusados()])
      .then(([l, r, ms, mr]) => {
        setItens(l)
        setRecusados(r.ids)
        setMotions(ms)
        setMotionsRecusados(mr)
      })
      .catch((e) => setErro((e as Error).message))
  }
  useEffect(() => {
    void carregar()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto a IA descreve algum item (ou um original está sendo cortado), acompanha
  const descrevendo = itens?.filter((i) => i.ia.status === 'fila' || i.ia.status === 'rodando').length ?? 0
  const cortando = itens?.some((i) => i.edicao?.status === 'rodando')
  useEffect(() => {
    if (!descrevendo && !cortando) return
    const t = setInterval(() => void carregar(), 3000)
    return () => clearInterval(t)
  }, [descrevendo > 0, cortando]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(arquivos: File[]) {
    if (!arquivos.length) return
    setErro('')
    setEnviando(arquivos.length)
    try {
      await subirNoBanco(arquivos)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(0)
    }
  }

  async function apagar(i: ItemBanco) {
    if (!window.confirm(`Apagar “${i.nome}” do banco? Os inserts que a usam ficam sem ela.`)) return
    await apagarItemBanco(i.id).catch((e) => setErro(e.message))
    await carregar()
  }

  const comSelo = (i: ItemBanco, s: Selo | 'nenhum' | null) => !s || (s === 'nenhum' ? !i.estado : i.estado === s)
  const motionComSelo = (m: Preset, s: Selo | 'nenhum' | null) => !s || (s === 'nenhum' ? !seloDoMotion(m) : seloDoMotion(m) === s)
  const midiasDo = (t: Tipo) => (t === 'motions' ? [] : (itens ?? []))
  const motionsDo = (t: Tipo) => (t === 'inserts' ? [] : motions)
  const visiveis = useMemo(() => midiasDo(tipo).filter((i) => comSelo(i, selo)), [itens, tipo, selo]) // eslint-disable-line react-hooks/exhaustive-deps
  const motionsVisiveis = motionsDo(tipo).filter((m) => motionComSelo(m, selo))
  const contagem = (t: Tipo) => midiasDo(t).filter((i) => comSelo(i, selo)).length + motionsDo(t).filter((m) => motionComSelo(m, selo)).length
  const contagemSelo = (s: Selo | 'nenhum') => midiasDo(tipo).filter((i) => comSelo(i, s)).length + motionsDo(tipo).filter((m) => motionComSelo(m, s)).length
  const agirMotion = (f: () => Promise<unknown>) =>
    void f()
      .then(carregar)
      .catch((e) => setErro((e as Error).message))
  const recusarMotion = (m: Preset) => {
    const motivo = window.prompt(`Por que recusar “${m.nome}”? O Claude lê o motivo antes de escrever o próximo motion.`)?.trim()
    if (motivo) agirMotion(() => recusarPreset(m.id, motivo))
  }

  // a faxina: os recusados (o que o Claude trouxe e ficou de fora de um vídeo aprovado) vão para a lixeira do banco
  async function limpar() {
    if (!window.confirm(`Levar ${recusados.length} mídia${recusados.length > 1 ? 's' : ''} recusada${recusados.length > 1 ? 's' : ''} (com os trechos) para a lixeira do banco? Nada que algum projeto use, nem o que você subiu.`)) return
    await limparRecusados().catch((e) => setErro(e.message))
    await carregar()
  }

  return (
    <div
      className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream"
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        void subir([...e.dataTransfer.files])
      }}
    >
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-4 py-3">
        {FILTROS.map(([t, nome, icone]) => (
          <Chip key={nome} ativo={tipo === t} onClick={() => setTipo(t)} n={contagem(t)} icone={icone}>
            {nome}
          </Chip>
        ))}
        <span className="mx-2 h-5 w-px bg-line-dark" />
        {FILTROS_SELO.map(([s, nome, icone]) => (
          <Chip key={s} ativo={selo === s} onClick={() => setSelo(selo === s ? null : s)} n={contagemSelo(s)} icone={icone}>
            {nome}
          </Chip>
        ))}
        <span className="ml-auto" />
        {recusados.length > 0 && (
          <Button variant="pill" size="sm" className="ml-2 text-fog hover:text-coral" onClick={() => void limpar()} title="Leva os recusados para a lixeira do banco (biblioteca/banco/_lixeira; dá para recuperar)">
            <Trash2 className="size-3.5" /> Limpar recusados ({recusados.length})
          </Button>
        )}
        <Button variant="coral" size="sm" className="ml-2 h-8 gap-4 px-4" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
          {enviando ? `Enviando ${enviando}…` : 'Adicionar mídias'} <span className="seta">↗</span>
        </Button>
        <input
          ref={entrada}
          type="file"
          accept={ACEITA}
          multiple
          hidden
          onChange={(e) => {
            void subir([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </nav>

      <main className={cn('overflow-y-auto px-8 py-8 transition-colors', arrastando && 'bg-coral/10')}>
        {erro && <p className="mb-4 text-coral">{erro}</p>}
        {itens && visiveis.length + motionsVisiveis.length === 0 && (
          <p className="mb-6 text-[13px] text-fog">Nada com esses filtros.</p>
        )}

        <ul className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {[
            ...visiveis.map((i) => ({ criado: i.criado_em ?? '', el: <Cartao key={i.id} item={i} abrir={() => setAberto(i.id)} apagar={() => void apagar(i)} /> })),
            ...motionsVisiveis.map((m) => ({
              // os motions "a revisar" primeiro (o que pede ação), os outros depois das mídias novas
              criado: m.a_revisar ? '9' : '',
              el: <CartaoMotion key={`m-${m.id}`} m={m} abrir={() => setMotionAberto(m.id)} aprovar={() => agirMotion(() => aprovarPreset(m.id))} recusar={() => recusarMotion(m)} />,
            })),
          ]
            .sort((a, b) => b.criado.localeCompare(a.criado))
            .map((x) => x.el)}
        </ul>
        {tipo === 'motions' && motionsRecusados.length > 0 && (
          <section className="mt-12 border-t border-line-dark pt-6">
            <p className="eyebrow mb-3 text-sage">Motions recusados · {motionsRecusados.length}</p>
            <ul className="grid gap-2 text-[12px]">
              {motionsRecusados.map((r) => (
                <li key={r.arquivo} className="grid gap-0.5">
                  <span className="font-semibold text-cream/80">{r.nome}</span>
                  <span className="text-fog">{r.motivo || 'sem motivo'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {aberto && <Detalhe bid={aberto} fechar={() => setAberto(null)} mudou={() => void carregar()} />}
      {motionAberto && motions.find((m) => m.id === motionAberto) && (
        <DetalheMotion
          m={motions.find((m) => m.id === motionAberto)!}
          fechar={() => setMotionAberto(null)}
          aprovar={() => agirMotion(() => aprovarPreset(motionAberto))}
          recusar={() => recusarMotion(motions.find((m) => m.id === motionAberto)!)}
        />
      )}
    </div>
  )
}

function Chip({ ativo, onClick, n, icone: Icone, children }: { ativo: boolean; onClick: () => void; n: number; icone: LucideIcon; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
        ativo ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream',
      )}
    >
      <Icone className="size-3.5" />
      {children}
      <span className={cn('tabular-nums', ativo ? 'text-ink/60' : 'text-fog/60')}>{n}</span>
    </button>
  )
}

/** Um motion na grade do banco: a prévia (toca com o mouse em cima), o nome, o código e, se o Claude o escreveu e ainda
 *  está "a revisar", Aprovar e Recusar (com o motivo, que o Claude lê antes de escrever o próximo). */
/** Etiqueta translúcida sobre a miniatura (o tipo, a duração, os trechos). */
function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-cream/90 backdrop-blur-sm', className)}>{children}</span>
}

const COR_SELO: Record<string, string> = { usado: 'bg-yellow', aprovado: 'bg-mint', recusado: 'bg-coral', revisar: 'bg-coral' }
const NOME_SELO: Record<string, string> = { usado: 'Usado', aprovado: 'Aprovado', recusado: 'Recusado', revisar: 'A revisar' }
/** O selo numa linha discreta: um ponto da cor e o nome. */
function SeloLinha({ estado }: { estado?: string | null }) {
  if (!estado) return <span className="text-[11px] text-fog/70">Sem selo</span>
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-fog">
      <i className={cn('size-1.5 rounded-full', COR_SELO[estado])} />
      {NOME_SELO[estado]}
    </span>
  )
}

function CartaoMotion({ m, abrir, aprovar, recusar }: { m: Preset; abrir: () => void; aprovar: () => void; recusar: () => void }) {
  return (
    <li className="group">
      <button onClick={abrir} className="block w-full text-left">
        <div className="relative grid aspect-video place-items-center overflow-hidden rounded-[8px] bg-ink ring-1 ring-line-dark transition-[box-shadow] duration-300 group-hover:ring-cream/40">
          <div className="aspect-[9/8] h-full">
            <MiniaturaPreset preset={m} formato="dividida" />
          </div>
          <Etiqueta className="absolute top-2 left-2">
            <Clapperboard className="size-3" /> Motion
          </Etiqueta>
          <Etiqueta className="absolute right-2 bottom-2 tabular-nums">{seg(m.duracao)}</Etiqueta>
        </div>
      </button>
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={abrir} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold tracking-[-0.01em]" title={m.nome}>
          {m.nome}
        </button>
        <ChipCodigo tipo="motion" id={m.id} nome={m.nome} />
      </div>
      <div className="mt-1 flex h-6 items-center gap-1">
        <SeloLinha estado={m.a_revisar ? 'revisar' : 'aprovado'} />
        {m.a_revisar && (
          <span className="ml-auto flex items-center gap-0.5">
            <button onClick={aprovar} className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-mint hover:bg-mint/10">
              <Check className="size-3.5" /> Aprovar
            </button>
            <button onClick={recusar} className="flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-fog hover:bg-coral/10 hover:text-coral">
              <X className="size-3.5" /> Recusar
            </button>
          </span>
        )}
      </div>
    </li>
  )
}

/** O detalhe de um motion (como o de uma mídia): a prévia grande tocando (tela cheia ou dividida), a descrição, os
 *  campos e os sons do preset e, se o Claude o escreveu e ele está "a revisar", Aprovar e Recusar (com o motivo). */
function DetalheMotion({ m, fechar, aprovar, recusar }: { m: Preset; fechar: () => void; aprovar: () => void; recusar: () => void }) {
  const [formato, setFormato] = useState<'vertical' | 'dividida'>('vertical')
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar])
  const campos = Object.entries(m.campos)
  const sons = Object.values(m.sons ?? {})
  return (
    <div data-modal className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>
      <div className="grid max-h-full w-full max-w-[1100px] grid-cols-[minmax(0,1.1fr)_minmax(340px,1fr)] gap-x-7 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark" onClick={(e) => e.stopPropagation()}>
        <div className="grid min-h-0 place-items-center rounded-[6px] bg-black">
          <div key={formato} className={cn(formato === 'vertical' ? 'h-[min(72vh,760px)] aspect-[9/16]' : 'w-full max-w-[560px] aspect-[9/8]')}>
            <MiniaturaPreset preset={m} formato={formato} auto />
          </div>
        </div>
        <div className="flex max-h-[min(80vh,820px)] min-h-0 flex-col gap-5 overflow-y-auto pr-1 text-[13px] text-cream">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-coral px-2.5 py-1 text-[11px] font-semibold text-cream">Motion</span>
            <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
              {(['vertical', 'dividida'] as const).map((f) => (
                <button key={f} onClick={() => setFormato(f)} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', formato === f ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
                  {f === 'vertical' ? 'Tela cheia' : 'Tela dividida'}
                </button>
              ))}
            </div>
            <button onClick={fechar} aria-label="Fechar" className="ml-auto grid size-8 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[18px] font-semibold tracking-[-0.02em]">{m.nome}</h2>
            <ChipCodigo tipo="motion" id={m.id} nome={m.nome} />
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-3 border-y border-line-dark py-4">
            <Dado rotulo="Fundo sugerido" valor={m.fundo} />
            <Dado rotulo="Campos" valor={String(Object.keys(m.campos).length)} />
            <Dado rotulo="Sons" valor={String(Object.keys(m.sons ?? {}).length)} />
          </div>
          <Bloco titulo="Selo">
            <div className="flex flex-wrap items-center gap-2">
              {m.a_revisar ? <span className="rounded-full bg-coral px-2.5 py-1 text-[11px] font-semibold text-cream uppercase">a revisar</span> : <SeloBanco estado="aprovado" className="px-2.5 py-1 text-[11px]" />}
              {m.a_revisar && (
                <span className="ml-auto flex gap-1.5">
                  <Button variant="pill" size="sm" className="text-fog hover:text-cream" onClick={aprovar}>
                    <Check className="size-3.5" /> Aprovar
                  </Button>
                  <Button variant="pill" size="sm" className="text-fog hover:text-coral" onClick={recusar}>
                    <X className="size-3.5" /> Recusar…
                  </Button>
                </span>
              )}
            </div>
          </Bloco>
          <Bloco titulo="Descrição">
            <p className="leading-[1.7] text-cream/85">{m.descricao || '—'}</p>
          </Bloco>
          {campos.length > 0 && (
            <Bloco titulo={`Campos · ${campos.length}`}>
              <div className="grid gap-1.5">
                {campos.map(([k, c]) => (
                  <p key={k} className="text-fog">
                    <span className="text-cream">{c.rotulo}</span> · {c.padrao || '—'}
                  </p>
                ))}
              </div>
            </Bloco>
          )}
          {sons.length > 0 && (
            <Bloco titulo={`Sons · ${sons.length}`}>
              <div className="grid gap-1.5">
                {sons.map((x) => (
                  <p key={x.rotulo} className="text-fog">
                    <span className="text-cream">{x.rotulo}</span> · {x.som ?? 'sem som'}
                  </p>
                ))}
              </div>
            </Bloco>
          )}
        </div>
      </div>
    </div>
  )
}

/** Miniatura da mídia; um vídeo toca (mudo) com o mouse em cima. */
function Cartao({ item: i, abrir, apagar }: { item: ItemBanco; abrir: () => void; apagar: () => void }) {
  const [tocando, setTocando] = useState(false)
  // "sem descrição" só quando não há nenhuma (as do 19 e as do Claude vêm descritas, sem a IA do app)
  const status = i.ia.status === 'pendente' && i.descricao ? '' : STATUS_IA[i.ia.status]
  const n = i.trechos?.length ?? 0
  return (
    <li className="group relative" onMouseEnter={() => setTocando(i.tipo === 'video')} onMouseLeave={() => setTocando(false)}>
      <button onClick={abrir} className="block w-full text-left">
        <div className="relative aspect-video overflow-hidden rounded-[8px] bg-ink ring-1 ring-line-dark transition-[box-shadow] duration-300 group-hover:ring-cream/40">
          {/* a própria imagem, desfocada, preenche o fundo: sem as faixas pretas de uma mídia em pé */}
          <img src={urlBancoMiniatura(i.id)} alt="" aria-hidden loading="lazy" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl" />
          <img src={urlBancoMiniatura(i.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
          {tocando && <video src={urlBancoArquivo(i.id)} autoPlay muted loop playsInline className="absolute inset-0 size-full object-contain" />}
          <span className="absolute top-2 left-2 flex gap-1">
            <Etiqueta>
              {i.tipo === 'video' ? <Video className="size-3" /> : <ImageIcon className="size-3" />} {i.formato}
            </Etiqueta>
            {n > 0 && <Etiqueta>{n} trecho{n > 1 ? 's' : ''}</Etiqueta>}
          </span>
          {i.tipo === 'video' && <Etiqueta className="absolute right-2 bottom-2 tabular-nums">{seg(i.duracao)}</Etiqueta>}
          {i.edicao?.status === 'rodando' && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-[12px] font-semibold text-yellow">cortando o original…</span>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]" title={i.nome}>
            {i.nome}
          </h3>
          <ChipCodigo tipo="midia" id={i.id} nome={i.nome} />
        </div>
        <div className="mt-1 flex h-6 items-center gap-2">
          <SeloLinha estado={i.estado} />
          {status && <span className={cn('text-[11px]', i.ia.status === 'erro' ? 'text-coral' : 'text-yellow')}>· {status}</span>}
        </div>
      </button>
      <button
        onClick={apagar}
        aria-label={`Apagar ${i.nome}`}
        title="Apagar do banco"
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/55 text-cream/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-coral focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  )
}

function Detalhe({ bid, fechar, mudou }: { bid: string; fechar: () => void; mudou: () => void }) {
  const [item, setItem] = useState<ItemBanco | null>(null)
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [palavras, setPalavras] = useState('')
  const preencher = (i: ItemBanco) => {
    setItem(i)
    setNome(i.nome)
    setDescricao(i.descricao)
    setPalavras(i.palavras.join(', '))
  }
  useEffect(() => {
    void lerItemBanco(bid).then(preencher)
  }, [bid])
  // enquanto a IA descreve, acompanha (e pega a descrição e as palavras quando chegarem)
  const andando = item?.ia.status === 'fila' || item?.ia.status === 'rodando'
  const cortando = item?.edicao?.status === 'rodando'
  useEffect(() => {
    if (!andando && !cortando) return
    const t = setInterval(() => void lerItemBanco(bid).then(preencher), 2500)
    return () => clearInterval(t)
  }, [andando, cortando, bid])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !editando && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar, editando])

  const falhar = (e: unknown) => window.alert((e as Error).message)
  const lista = palavras
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
  const alterado = !!item && (nome !== item.nome || descricao !== item.descricao || lista.join('|') !== item.palavras.join('|'))
  const salvar = () =>
    editarItemBanco(bid, { nome, descricao, palavras: lista })
      .then((i) => {
        preencher({ ...item!, ...i })
        mudou()
      })
      .catch(falhar)
  const apagar = () => {
    const n = item?.usos?.length ?? 0
    if (!window.confirm(n ? `Esta mídia está em ${n} insert(s). Apagar do banco e tirar de todos?` : 'Apagar esta mídia do banco?')) return
    void apagarItemBanco(bid)
      .then(() => {
        mudou()
        fechar()
      })
      .catch(falhar)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>

      <div
        className="grid max-h-full w-full max-w-[1180px] grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)] gap-x-7 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {!item ? (
          <p className="text-[13px] text-fog">Carregando…</p>
        ) : (
          <>
            <div className="grid min-h-0 place-items-center rounded-[6px] bg-black">
              {item.tipo === 'video' ? (
                <video src={urlBancoArquivo(bid) + versaoBanco(item)} controls muted playsInline className="max-h-[min(72vh,760px)] max-w-full rounded-[6px]" />
              ) : (
                <img src={urlBancoArquivo(bid)} alt="" className="max-h-[min(72vh,760px)] max-w-full rounded-[6px] object-contain" />
              )}
            </div>

            <div className="flex max-h-[min(80vh,820px)] min-h-0 flex-col gap-5 overflow-y-auto pr-1 text-[13px]">
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', item.tipo === 'video' ? 'bg-blue text-cream' : 'bg-mint text-ink')}>
                  {NOME_TIPO_MIDIA[item.tipo]} · {item.formato}
                </span>
                <button onClick={fechar} aria-label="Fechar" className="ml-auto grid size-8 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-x-6 gap-y-3 border-y border-line-dark py-4">
                <Dado rotulo="Dimensões" valor={item.largura && item.altura ? `${item.largura}×${item.altura}` : '—'} />
                <Dado
                  rotulo="Origem"
                  valor={
                    (item.origem.tipo === 'captura de site' ? 'Captura de site' : item.origem.tipo === 'captura automática' ? 'Captura automática' : item.origem.tipo === 'web' ? 'Web' : 'Upload') +
                    (item.trazido_por === 'claude' ? ' · pelo Claude' : '')
                  }
                  detalhe={(item.origem.url ?? item.origem.nome_original) ?? undefined}
                />
                <Dado
                  rotulo="Entrou em"
                  valor={item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                />
              </div>

              <Bloco titulo="Selo">
                <div className="flex flex-wrap items-center gap-2">
                  <SeloBanco estado={item.estado} className="px-2.5 py-1 text-[11px]" />
                  {!item.estado && <span className="text-fog">Sem selo (o projeto dela ainda está em edição)</span>}
                  <span className="ml-auto flex gap-1.5">
                    {(['aprovado', 'recusado'] as const).map((e) => (
                      <Button
                        key={e}
                        variant="pill"
                        size="sm"
                        className="text-fog hover:text-cream"
                        disabled={item.estado === e}
                        onClick={() =>
                          void marcarSeloBanco(bid, e)
                            .then((i) => {
                              preencher({ ...item, ...i })
                              mudou()
                            })
                            .catch(falhar)
                        }
                      >
                        {e === 'aprovado' ? 'Aprovar' : 'Recusar'}
                      </Button>
                    ))}
                    <Button
                      variant="pill"
                      size="sm"
                      className="text-fog hover:text-cream"
                      title="Tira o selo à mão: volta ao automático (usado em vídeo aprovado, subido por você, trazido pelo Claude…)"
                      onClick={() =>
                        void marcarSeloBanco(bid, null)
                          .then((i) => {
                            preencher({ ...item, ...i })
                            mudou()
                          })
                          .catch(falhar)
                      }
                    >
                      Automático
                    </Button>
                  </span>
                </div>
              </Bloco>
              <Bloco titulo="Nome">
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
              </Bloco>
              <Bloco titulo="Descrição">
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} className={cn(CAMPO, 'resize-y leading-[1.6]')} />
              </Bloco>
              <Bloco titulo="Palavras-chave · separadas por vírgula">
                <input value={palavras} onChange={(e) => setPalavras(e.target.value)} className={CAMPO} />
              </Bloco>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="coral" size="sm" onClick={() => void salvar()} disabled={!alterado}>
                  Salvar
                </Button>
                <Button
                  variant="pill"
                  size="sm"
                  className="text-fog hover:text-cream"
                  onClick={() => void descreverItemBanco(bid).then((i) => preencher({ ...item, ...i })).catch(falhar)}
                  disabled={andando}
                  title="A IA vê a mídia de novo e sugere descrição e palavras-chave (não apaga o que você escreveu)"
                >
                  <Sparkles className="size-3.5" /> Descrever de novo
                </Button>
                {item.tipo === 'video' && (
                  <Button variant="pill" size="sm" className="text-fog hover:text-cream" onClick={() => setEditando(true)} disabled={cortando}>
                    <Scissors className="size-3.5" /> Editar vídeo
                  </Button>
                )}
                <Button variant="pill" size="sm" className="ml-auto text-fog hover:text-coral" onClick={apagar}>
                  <Trash2 className="size-3.5" /> Apagar
                </Button>
              </div>
              {cortando && <p className="text-yellow">Cortando o original (regravando em alta qualidade)…</p>}
              {item.edicao?.status === 'erro' && <p className="text-coral">O corte falhou: {item.edicao.erro}</p>}

              {item.tipo === 'video' && (
                <Bloco titulo={`Trechos · ${item.trechos?.length ?? 0}`}>
                  {item.trechos?.length ? (
                    <div className="grid gap-1.5">
                      {item.trechos.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setEditando(true)}
                          className="flex items-center gap-3 rounded-[6px] px-2 py-1.5 text-left ring-1 ring-line-dark transition-colors hover:ring-coral"
                        >
                          <img src={urlBancoMiniatura(t.id)} alt="" className="h-9 w-14 shrink-0 rounded-[3px] bg-black object-cover" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{t.nome}</span>
                          <ChipCodigo tipo="midia" id={t.id} nome={t.nome} />
                          <span className="shrink-0 text-[11px] text-fog tabular-nums">
                            {seg(t.duracao)}
                            {t.usos?.length ? ` · em ${t.usos.length}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-fog">Nenhum. Em “Editar vídeo”, marque trechos para usar pedaços deste vídeo.</p>
                  )}
                </Bloco>
              )}

              <Bloco titulo="Descrição da IA">
                {andando ? (
                  <p className="text-yellow">{STATUS_IA[item.ia.status]}</p>
                ) : item.ia.status === 'erro' ? (
                  <p className="text-coral">{item.ia.erro || 'falhou'}</p>
                ) : (
                  <p className="border-l-2 border-line-dark pl-3 leading-[1.7] text-fog">{item.descricao_ia || '—'}</p>
                )}
              </Bloco>

              <Bloco titulo={`Usada em · ${item.usos?.length ?? 0}`}>
                {item.usos?.length ? (
                  <div className="grid gap-1.5">
                    {item.usos.map((u) => (
                      <Link key={u.pedido} to={`/p/${u.projeto}`} className="rounded-[6px] px-3 py-2 ring-1 ring-line-dark transition-colors hover:ring-coral">
                        <span className="font-semibold">{u.nome}</span> <span className="text-fog">· “{u.fala}”</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-fog">Nenhum insert usa esta mídia.</p>
                )}
              </Bloco>
            </div>
          </>
        )}
      </div>
      {editando && item && (
        <div onClick={(e) => e.stopPropagation()}>
          <EditorVideo
            bid={item.id}
            fechar={() => {
              setEditando(false)
              void lerItemBanco(bid).then(preencher)
              mudou()
            }}
            mudou={mudou}
          />
        </div>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 text-sage">{titulo}</p>
      {children}
    </div>
  )
}

function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{rotulo}</p>
      <p className="mt-0.5 font-semibold">{valor}</p>
      {detalhe && <p className="truncate text-[11px] text-fog">{detalhe}</p>}
    </div>
  )
}
