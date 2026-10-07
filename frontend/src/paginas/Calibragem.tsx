import { useEffect, useRef, useState } from 'react'
import { BarChart3, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  apagarReferencia,
  formatarDuracao,
  listarReferencias,
  reanalisarReferencia,
  renomearReferencia,
  subirReferencias,
  urlArquivoReferencia,
  type Referencia,
  type StatusReferencia,
} from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModalVideo } from '@/referencias/PainelCalibragem'

const STATUS: Record<StatusReferencia, { nome: string; cor: string }> = {
  na_fila: { nome: 'Na fila', cor: 'bg-cream/15 text-cream' },
  analisando: { nome: 'Analisando', cor: 'bg-yellow text-ink' },
  a_revisar: { nome: 'A revisar', cor: 'bg-coral text-cream' },
  revisado: { nome: 'Revisado', cor: 'bg-mint text-ink' },
  erro: { nome: 'Erro', cor: 'bg-destructive text-cream' },
}

const NOMES_PASSO = { proxy: 'Preparando o vídeo', transcricao: 'Transcrevendo', cenas: 'Detectando cortes', analise: 'Analisando trechos', montagem: 'Montando a direção', inserts: 'Descrevendo os inserts' }

/** O que a análise está fazendo agora, para o card. */
function andamento(r: Referencia): string | null {
  if (r.status !== 'analisando') return null
  const passos = r.analise?.passos ?? {}
  const atual = (Object.keys(NOMES_PASSO) as (keyof typeof NOMES_PASSO)[]).find((k) => passos[k]?.status === 'rodando')
  if (!atual) return 'Começando…'
  const p = passos[atual]!
  if (atual === 'analise' && p.total) return `${NOMES_PASSO.analise} ${p.feitos ?? 0}/${p.total}`
  if (atual === 'proxy' && p.progresso) return `${NOMES_PASSO.proxy} ${Math.round(p.progresso * 100)}%`
  return NOMES_PASSO[atual]
}

const revisavel = (r: Referencia) => r.status === 'a_revisar' || r.status === 'revisado'

/** Calibragem da Direção visual (SPEC §8.2.1): vídeos já editados sobem (vários de uma vez), a IA analisa e você revisa. */
export default function Calibragem() {
  const [refs, setRefs] = useState<Referencia[] | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(0)
  const [recusadas, setRecusadas] = useState<{ nome: string; motivo: string }[]>([])
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState<Referencia | null>(null)

  const carregar = () => listarReferencias().then(setRefs).catch((e) => setErro(e.message))
  useEffect(() => {
    void carregar()
  }, [])
  // enquanto houver algo na fila ou analisando, acompanha o andamento
  const andando = refs?.some((r) => r.status === 'na_fila' || r.status === 'analisando')
  useEffect(() => {
    if (!andando) return
    const t = setInterval(() => void carregar(), 1500)
    return () => clearInterval(t)
  }, [andando])

  async function subir(arquivos: File[]) {
    const videos = arquivos.filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name))
    if (!videos.length) return
    setErro('')
    setEnviando(videos.length)
    try {
      const r = await subirReferencias(videos)
      setRecusadas(r.recusadas)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(0)
    }
  }

  async function apagar(r: Referencia) {
    if (!window.confirm(`Apagar a referência “${r.nome}”? O vídeo e a análise saem do app.`)) return
    await apagarReferencia(r.id).catch((e) => setErro(e.message))
    await carregar()
  }

  async function tentarDeNovo(r: Referencia) {
    await reanalisarReferencia(r.id).catch((e) => setErro(e.message))
    await carregar()
  }

  const contagem = (s: StatusReferencia) => refs?.filter((r) => r.status === s).length ?? 0
  const revisadas = contagem('revisado')

  return (
    <div
      className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream"
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
        <Button variant="coral" size="sm" className="ml-auto h-9 gap-6 px-4" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
          {enviando ? `Enviando ${enviando}…` : 'Adicionar vídeos'} <span className="seta">↗</span>
        </Button>
        <input
          ref={entrada}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            void subir([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      <main className={cn('overflow-y-auto px-8 py-8 transition-colors', arrastando && 'bg-coral/10')}>
        <div className="mb-6 grid gap-3 border-b border-line-dark pb-4">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow text-sage">
              Calibragem{refs && ` · ${String(refs.length).padStart(2, '0')} vídeos`}
            </p>
            <p className="text-[11px] text-fog">
              {revisadas} revisada{revisadas === 1 ? '' : 's'} · {contagem('a_revisar')} a revisar · {contagem('na_fila') + contagem('analisando')} na fila
              {contagem('erro') > 0 && ` · ${contagem('erro')} com erro`}
            </p>
          </div>
          <p className="max-w-[720px] text-[12px] leading-[1.7] text-fog">
            Vídeos seus já editados, verticais. A IA analisa o que aparece na tela em cada trecho (planos e elementos) e você revisa. Só as referências
            revisadas ensinam a Direção visual. Arraste vários MP4 para esta tela ou use “Adicionar vídeos”. Os planos identificados aparecem em Referências.
          </p>
        </div>

        {erro && <p className="mb-4 text-coral">{erro}</p>}
        {recusadas.length > 0 && (
          <div className="mb-6 grid gap-1 border-l-2 border-coral pl-3 text-[12px]">
            <p className="font-semibold text-coral">
              {recusadas.length} vídeo{recusadas.length > 1 ? 's' : ''} não entrou:
            </p>
            {recusadas.map((r) => (
              <p key={r.nome} className="text-fog">
                <b className="text-cream">{r.nome}</b>: {r.motivo}
              </p>
            ))}
            <button onClick={() => setRecusadas([])} className="w-fit text-[11px] text-fog underline hover:text-cream">
              ok
            </button>
          </div>
        )}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-8">
          <li>
            <button
              onClick={() => entrada.current?.click()}
              className="group flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 rounded-[6px] border border-dashed border-line-dark text-fog transition-colors hover:border-coral hover:text-cream"
            >
              <span className="grid size-12 place-items-center rounded-full bg-coral text-cream transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-90">
                <Plus className="size-5" />
              </span>
              <span className="text-center">
                <span className="block text-[14px] font-semibold text-cream">Adicionar</span>
                <span className="text-[11px]">Vários MP4 de uma vez</span>
              </span>
            </button>
          </li>

          {refs?.map((r) => {
            const capa = (
              <div
                className={cn(
                  'relative aspect-[9/16] overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark',
                  revisavel(r) && 'transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-coral',
                )}
              >
                <img
                  src={urlArquivoReferencia(r.id, 'miniatura.jpg')}
                  alt=""
                  loading="lazy"
                  onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1714e6] via-transparent to-transparent" />
                <span className="absolute top-2.5 right-2.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                  {formatarDuracao(r.video.duracao)}
                </span>
                <span className={cn('absolute bottom-2.5 left-2.5 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.1em] uppercase', STATUS[r.status].cor)}>
                  {STATUS[r.status].nome}
                </span>
                {r.status === 'analisando' && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-cream/15">
                    <span className="block h-full bg-yellow transition-[width] duration-700" style={{ width: `${Math.round((r.analise?.passos.analise?.progresso ?? 0) * 100)}%` }} />
                  </span>
                )}
              </div>
            )
            return (
              <li key={r.id} className="group relative">
                {revisavel(r) ? (
                  <Link to={`/calibragem/${r.id}`} title="Abrir a revisão deste vídeo" className="block w-full text-left">
                    {capa}
                  </Link>
                ) : (
                  capa
                )}
                {revisavel(r) && (
                  <button
                    onClick={() => setAberto(r)}
                    aria-label={`Números de ${r.nome}`}
                    title="Ver os números deste vídeo"
                    className="absolute top-2.5 left-11 grid size-7 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-cream focus-visible:opacity-100"
                  >
                    <BarChart3 className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => void apagar(r)}
                  aria-label={`Apagar ${r.nome}`}
                  title="Apagar referência"
                  className="absolute top-2.5 left-2.5 grid size-7 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <NomeEditavel
                  nome={r.nome}
                  salvar={(nome) =>
                    renomearReferencia(r.id, nome)
                      .then(() => carregar())
                      .catch((e) => setErro((e as Error).message))
                  }
                />
                <p className="mt-0.5 text-[11px] text-fog">
                  {andamento(r) ?? `${new Date(r.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · ${r.video.largura}×${r.video.altura}`}
                </p>
                {r.erro && (
                  <p className="mt-1 line-clamp-3 text-[11px] text-coral" title={r.erro}>
                    {r.erro}
                  </p>
                )}
                {r.status === 'erro' && (
                  <button onClick={() => void tentarDeNovo(r)} className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-yellow hover:underline">
                    <RotateCcw className="size-3" /> Tentar de novo
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {refs?.length === 0 && <p className="mt-8 text-[13px] text-fog">Nenhuma referência ainda. Comece com 5 a 10 Reels editados que você considera bons.</p>}


      </main>
      {aberto && <ModalVideo r={aberto} fechar={() => setAberto(null)} />}
    </div>
  )
}

/** O nome do vídeo: dois cliques (ou o lápis) para renomear; Enter salva, Esc cancela. */
function NomeEditavel({ nome, salvar }: { nome: string; salvar: (nome: string) => Promise<unknown> }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(nome)
  const confirmar = () => {
    const novo = valor.trim()
    setEditando(false)
    if (novo && novo !== nome) void salvar(novo)
    else setValor(nome)
  }
  if (editando)
    return (
      <input
        autoFocus
        value={valor}
        maxLength={120}
        onChange={(e) => setValor(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValor(nome)
            setEditando(false)
          }
        }}
        aria-label="Nome do vídeo"
        className="mt-2.5 h-7 w-full rounded-[3px] border border-cream/40 bg-deeper px-2 text-[13px] font-semibold text-cream outline-none focus:border-yellow"
      />
    )
  return (
    <div className="mt-3 flex items-center gap-1.5">
      <h3
        onDoubleClick={() => {
          setValor(nome)
          setEditando(true)
        }}
        className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.02em]"
        title={`${nome} · dois cliques para renomear`}
      >
        {nome}
      </h3>
      <button
        onClick={() => {
          setValor(nome)
          setEditando(true)
        }}
        aria-label="Renomear"
        className="shrink-0 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-cream focus-visible:opacity-100"
      >
        <Pencil className="size-3" />
      </button>
    </div>
  )
}
