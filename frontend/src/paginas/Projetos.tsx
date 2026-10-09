import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { formatarDuracao, listarProjetos, urlMiniatura, type ResumoProjeto } from '@/api'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { ETAPAS } from '@/editor/etapas'
import { cn } from '@/lib/utils'
import Configuracoes from './Configuracoes'
import NovoProjeto from './NovoProjeto'

/** Início do app: grade de projetos no mesmo chrome escuro do editor. */
export default function Projetos() {
  const [projetos, setProjetos] = useState<ResumoProjeto[] | null>(null)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)
  const [config, setConfig] = useState(false)

  useEffect(() => {
    listarProjetos().then(setProjetos).catch((e) => setErro(e.message))
  }, [])

  return (
    <div className="grid h-svh grid-rows-[56px_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />

        <button onClick={() => setConfig(true)} aria-label="Configurações" title="Configurações" className="ml-auto grid size-9 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
          <Settings className="size-4" />
        </button>
        <Button variant="coral" size="sm" className="h-9 gap-6 px-4" onClick={() => setCriando(true)}>
          Novo projeto <span className="seta">↗</span>
        </Button>
      </header>

      <main className="overflow-y-auto px-8 py-8">
        <div className="mb-6 flex items-baseline justify-between border-b border-line-dark pb-4">
          <p className="eyebrow text-sage">
            Recentes{projetos && ` · ${String(projetos.length).padStart(2, '0')}`}
          </p>
          <p className="text-[11px] text-fog">Do mais novo para o mais antigo</p>
        </div>

        {erro && <p className="text-coral">{erro}</p>}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-8">
          <li>
            <button
              onClick={() => setCriando(true)}
              className="group flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 rounded-[6px] border border-dashed border-line-dark text-fog transition-colors hover:border-coral hover:text-cream"
            >
              <span className="grid size-12 place-items-center rounded-full bg-coral text-cream transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-90">
                <Plus className="size-5" />
              </span>
              <span className="text-center">
                <span className="block text-[14px] font-semibold text-cream">Novo projeto</span>
                <span className="text-[11px]">Nome, formato e o vídeo bruto</span>
              </span>
            </button>
          </li>

          {projetos?.map((p) => (
            <li key={p.id}>
              <Link to={`/p/${p.id}`} className="group block">
                <div className="relative aspect-[9/16] overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-coral">
                  <img
                    src={urlMiniatura(p.id)}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b1714e6] via-transparent to-transparent" />
                  {/* o tamanho do vídeo editado; antes dos cortes, o do bruto (dito na dica) */}
                  <span
                    className="absolute top-2.5 right-2.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    title={p.duracao_final != null ? `Vídeo editado ${formatarDuracao(p.duracao_final)} · bruto ${formatarDuracao(p.duracao)}` : `Bruto ${formatarDuracao(p.duracao)} (ainda sem cortes)`}
                  >
                    {formatarDuracao(p.duracao_final ?? p.duracao)}
                  </span>
                  <Progresso etapas={p.etapas} />
                </div>
                <h3 className="mt-3 truncate text-[15px] font-semibold tracking-[-0.02em]">{p.nome}</h3>
                <p className="mt-0.5 text-[11px] text-fog">
                  {new Date(p.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  {p.apoios > 0 && ` · ${p.apoios} apoio${p.apoios > 1 ? 's' : ''}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        {projetos?.length === 0 && (
          <p className="mt-8 text-[13px] text-fog">Nenhum projeto ainda. Comece subindo um vídeo bruto.</p>
        )}
      </main>

      <NovoProjeto aberto={criando} aoFechar={() => setCriando(false)} />
      <Configuracoes aberto={config} aoFechar={() => setConfig(false)} />
    </div>
  )
}

// as etapas que ainda não marcam quando ficam prontas (sem um critério definido): a barrinha diz isso, em vez de "pendente"
const SEM_CRITERIO = new Set(['transicoes', 'audio', 'legenda'])
const ESTADO: Record<string, string> = { pronta: 'pronta', andamento: 'em andamento', pendente: 'pendente' }

/** Uma barrinha por etapa, na base da miniatura: menta quando pronta, amarela em andamento (os Inserts com mídia em parte). */
function Progresso({ etapas }: { etapas: ResumoProjeto['etapas'] }) {
  return (
    <div className="absolute inset-x-2.5 bottom-2.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(0, 1fr))` }}>
      {ETAPAS.map((e) => {
        const estado = etapas[e.id]
        const semCriterio = SEM_CRITERIO.has(e.id) && estado !== 'pronta'
        return (
          <span
            key={e.id}
            title={`${e.nome}: ${semCriterio ? 'ainda sem marcação de pronta' : (ESTADO[estado] ?? estado)}`}
            className={cn('h-1 rounded-full', estado === 'pronta' ? 'bg-mint' : estado === 'andamento' ? 'bg-yellow/80' : 'bg-cream/25')}
          />
        )
      })}
    </div>
  )
}
