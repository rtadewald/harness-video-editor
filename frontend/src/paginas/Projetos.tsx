import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { apagarProjeto, formatarDuracao, listarProjetos, mudarTipoProjeto, urlMiniatura, type ResumoProjeto } from '@/api'
import { fecharAba } from '@/components/abasProjetos'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { ETAPAS } from '@/editor/etapas'
import { cn } from '@/lib/utils'
import { ChipsTipo, SeletorTipo, useFiltroTipo, useTipos } from '@/components/tipos'
import NovoProjeto from './NovoProjeto'
import { ChipCodigo } from '@/components/Codigo'

/** Início do app: grade de projetos no mesmo chrome escuro do editor. */
export default function Projetos() {
  const [projetos, setProjetos] = useState<ResumoProjeto[] | null>(null)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)
  // o tipo de vídeo (Reels, Ad…): filtra a grade; cada projeto troca o seu no card
  const tipos = useTipos()
  const [tipo, setTipo] = useFiltroTipo('projetos')
  const visiveis = projetos?.filter((p) => !tipo || p.formato === tipo)
  const mudarTipo = (p: ResumoProjeto, t: string) =>
    void mudarTipoProjeto(p.id, t)
      .then(() => setProjetos((l) => l && l.map((x) => (x.id === p.id ? { ...x, formato: t } : x))))
      .catch((e) => window.alert((e as Error).message))

  useEffect(() => {
    listarProjetos().then(setProjetos).catch((e) => setErro(e.message))
  }, [])
  // apagar vai para a lixeira (projetos/_lixeira/), não some do disco
  const apagar = (p: ResumoProjeto) => {
    if (!window.confirm(`Apagar o projeto “${p.nome}”?\n\nEle sai da lista e vai para a lixeira (projetos/_lixeira/), de onde dá para recuperar.`)) return
    apagarProjeto(p.id)
      .then(() => {
        setProjetos((l) => l && l.filter((x) => x.id !== p.id))
        fecharAba(p.id)
      })
      .catch((e) => window.alert((e as Error).message))
  }

  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />

      </header>

      {/* a segunda linha: no canto direito, as ações da página */}
      <nav className="flex items-center gap-2 border-b border-line-dark px-4 py-3 text-[12px] text-fog">
        <ChipsTipo tipos={tipos} atual={tipo} mudar={setTipo} contar={(t) => projetos?.filter((p) => !t || p.formato === t).length ?? 0} />
        <Button variant="coral" size="sm" className="ml-auto h-8 gap-4 px-4" onClick={() => setCriando(true)}>
          Novo projeto <span className="seta">↗</span>
        </Button>
      </nav>

      <main className="overflow-y-auto px-8 py-8">

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

          {visiveis?.map((p) => (
            <li key={p.id} className="group/card relative">
              <button
                onClick={() => apagar(p)}
                aria-label={`Apagar ${p.nome}`}
                title="Apagar o projeto"
                className="absolute top-2.5 left-2.5 z-10 grid size-7 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-coral hover:text-cream focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
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
                <div className="mt-3 flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em]">{p.nome}</h3>
                  <ChipCodigo tipo="projeto" id={p.id} nome={p.nome} />
                </div>
                <p className="mt-0.5 text-[11px] text-fog">
                  {new Date(p.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  {p.apoios > 0 && ` · ${p.apoios} apoio${p.apoios > 1 ? 's' : ''}`}
                </p>
              </Link>
              <SeletorTipo tipos={tipos} valor={p.formato} mudar={(t) => mudarTipo(p, t)} className="absolute right-0 bottom-0" />
            </li>
          ))}
        </ul>

        {projetos?.length === 0 && (
          <p className="mt-8 text-[13px] text-fog">Nenhum projeto ainda. Comece subindo um vídeo bruto.</p>
        )}
      </main>

      <NovoProjeto aberto={criando} aoFechar={() => setCriando(false)} />
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
