import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { apagarReferencia, formatarDuracao, listarReferencias, subirReferencias, urlArquivoReferencia, type Referencia, type StatusReferencia } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATUS: Record<StatusReferencia, { nome: string; cor: string }> = {
  na_fila: { nome: 'Na fila', cor: 'bg-cream/15 text-cream' },
  analisando: { nome: 'Analisando', cor: 'bg-yellow text-ink' },
  a_revisar: { nome: 'A revisar', cor: 'bg-coral text-cream' },
  revisado: { nome: 'Revisado', cor: 'bg-mint text-ink' },
  erro: { nome: 'Erro', cor: 'bg-destructive text-cream' },
}

/** Vídeos já editados que ensinam a Direção visual (SPEC §8.2.1). Sobem vários de uma vez e entram numa fila. */
export default function Referencias() {
  const [refs, setRefs] = useState<Referencia[] | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(0)
  const [recusadas, setRecusadas] = useState<{ nome: string; motivo: string }[]>([])
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const carregar = () => listarReferencias().then(setRefs).catch((e) => setErro(e.message))
  useEffect(() => {
    void carregar()
  }, [])
  // enquanto houver algo na fila ou analisando, acompanha o status (a análise chega na D2)
  const andando = refs?.some((r) => r.status === 'na_fila' || r.status === 'analisando')
  useEffect(() => {
    if (!andando) return
    const t = setInterval(() => void carregar(), 2000)
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

  const contagem = (s: StatusReferencia) => refs?.filter((r) => r.status === s).length ?? 0

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
          {enviando ? `Enviando ${enviando}…` : 'Adicionar referências'} <span className="seta">↗</span>
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
              Referências{refs && ` · ${String(refs.length).padStart(2, '0')}`}
            </p>
            <p className="text-[11px] text-fog">
              {contagem('revisado')} revisada{contagem('revisado') === 1 ? '' : 's'} · {contagem('a_revisar')} a revisar · {contagem('na_fila') + contagem('analisando')} na fila
            </p>
          </div>
          <p className="max-w-[720px] text-[12px] leading-[1.7] text-fog">
            Vídeos seus já editados, verticais. A IA vai analisar o que aparece na tela em cada trecho (planos e elementos) e você revisa. Só as referências
            revisadas ensinam a Direção visual. Arraste vários MP4 para esta tela ou use “Adicionar referências”.
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

          {refs?.map((r) => (
            <li key={r.id} className="group">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark">
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
                <button
                  onClick={() => void apagar(r)}
                  aria-label={`Apagar ${r.nome}`}
                  title="Apagar referência"
                  className="absolute top-2.5 left-2.5 grid size-7 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <h3 className="mt-3 truncate text-[14px] font-semibold tracking-[-0.02em]" title={r.nome}>
                {r.nome}
              </h3>
              <p className="mt-0.5 text-[11px] text-fog">
                {new Date(r.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {r.video.largura}×{r.video.altura}
              </p>
              {r.erro && <p className="mt-1 text-[11px] text-coral">{r.erro}</p>}
            </li>
          ))}
        </ul>

        {refs?.length === 0 && <p className="mt-8 text-[13px] text-fog">Nenhuma referência ainda. Comece com 5 a 10 Reels editados que você considera bons.</p>}
      </main>
    </div>
  )
}
