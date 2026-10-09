import { useEffect, useState } from 'react'
import { Download, FolderOpen, X } from 'lucide-react'
import {
  cancelarExportacao,
  exportarProjeto,
  lerInserts,
  mostrarExportacao,
  urlExportacao,
  verExportacao,
  type Exportacao,
  type OpcoesExportacao,
  type Projeto,
} from '@/api'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FUNDOS } from '@/inserts/Fundo'

/** Exportação do vídeo final (SPEC §13): o botão do topo abre o modal com resolução, fps, codec e nome; a exportação roda
 *  em segundo plano (o botão mostra o andamento e dá para trocar de etapa ou de projeto) e, ao terminar, um aviso oferece
 *  abrir no Finder ou baixar. A última escolha fica lembrada. */
const RESOLUCOES: { id: OpcoesExportacao['resolucao']; nome: string; px: string }[] = [
  { id: '720p', nome: '720p', px: '720×1280' },
  { id: '1080p', nome: '1080p', px: '1080×1920' },
  { id: '4k', nome: '4K', px: '2160×3840' },
]
const FPS: OpcoesExportacao['fps'][] = [24, 30, 60]
const CODECS: { id: OpcoesExportacao['codec']; nome: string; dica: string }[] = [
  { id: 'hevc', nome: 'HEVC', dica: 'menor (H.265)' },
  { id: 'h264', nome: 'H.264', dica: 'abre em tudo' },
]
const PADRAO: OpcoesExportacao = { resolucao: '4k', fps: 24, codec: 'hevc', navegadores: 6 }
const NAVEGADORES = [2, 4, 6, 8]
const CHAVE = 'exportar.opcoes'

// Mbit/s medidos no vídeo de teste (HEVC a 24 fps); o H.264 sai perto do dobro
const MBPS: Record<OpcoesExportacao['resolucao'], number> = { '720p': 3.7, '1080p': 8, '4k': 28 }
const tamanho = (o: OpcoesExportacao, s: number) => {
  const mb = (MBPS[o.resolucao] * (o.codec === 'h264' ? 2 : 1) * (o.fps === 24 ? 1 : o.fps === 30 ? 1.15 : 1.5) * s) / 8 + (s * 0.32) / 8
  return mb >= 1000 ? `${(mb / 1000).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`
}

function lembradas(): OpcoesExportacao {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) ?? '{}') }
  } catch {
    return PADRAO
  }
}

const nomePadrao = (projeto: Projeto, o: OpcoesExportacao) => {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${projeto.nome} · ${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}h${z(d.getMinutes())} · ${o.resolucao === '4k' ? '4K' : o.resolucao} ${o.fps}`
}

export default function Exportar({ projeto, duracao }: { projeto: Projeto; duracao: number }) {
  const [atual, setAtual] = useState<Exportacao | null>(null)
  const [aberto, setAberto] = useState(false)
  const [aviso, setAviso] = useState(false)
  const rodando = atual?.status === 'rodando'

  useEffect(() => {
    setAtual(null)
    setAviso(false)
    void verExportacao(projeto.id).then((r) => setAtual(r.atual))
  }, [projeto.id])

  // acompanha enquanto roda; ao terminar, avisa
  useEffect(() => {
    if (!rodando) return
    const t = setInterval(() => {
      void verExportacao(projeto.id).then((r) => {
        setAtual(r.atual)
        if (r.atual && r.atual.status !== 'rodando') setAviso(true)
      })
    }, 1000)
    return () => clearInterval(t)
  }, [rodando, projeto.id])

  const pct = Math.round((atual?.progresso ?? 0) * 100)
  // sem cortes (o processamento parado ou ainda rodando) não há vídeo final: a exportação recusaria
  const semCortes = duracao <= 0
  return (
    <>
      {/* o botão desligado não recebe o mouse: a dica fica no invólucro */}
      <span className="flex shrink-0" title={semCortes && !rodando ? 'Sem cortes ainda: o vídeo final sai deles (espere o processamento terminar).' : undefined}>
        <Button
          variant="coral"
          size="sm"
          onClick={() => setAberto(true)}
          disabled={semCortes && !rodando}
          className={cn('relative h-9 shrink-0 overflow-hidden px-4', rodando ? 'gap-2' : 'gap-6')}
          title={rodando ? 'Exportando em segundo plano: clique para ver ou cancelar' : 'Exportar o vídeo final'}
        >
          {rodando && <span className="absolute inset-y-0 left-0 bg-ink/30 transition-[width] duration-700" style={{ width: `${pct}%` }} />}
          <span className="relative tabular-nums">{rodando ? `Exportando ${pct}%` : 'Exportar'}</span>
          {!rodando && <span className="seta relative">↗</span>}
        </Button>
      </span>

      {aberto && (
        <ModalExportar
          projeto={projeto}
          duracao={duracao}
          atual={atual}
          fechar={() => setAberto(false)}
          comecou={(e) => {
            setAtual(e)
            setAviso(false)
            setAberto(false)
          }}
          cancelou={() => void verExportacao(projeto.id).then((r) => setAtual(r.atual))}
        />
      )}

      {aviso && atual && atual.status !== 'rodando' && (
        <div className="fixed right-5 bottom-5 z-40 grid w-[340px] gap-2 rounded-[8px] bg-deep p-4 text-cream shadow-[0_20px_60px_#0008] ring-1 ring-line-dark">
          <div className="flex items-start gap-2">
            <p className="text-[13px] font-semibold">
              {atual.status === 'pronta' ? 'Vídeo exportado' : atual.status === 'cancelada' ? 'Exportação cancelada' : 'A exportação falhou'}
            </p>
            <button onClick={() => setAviso(false)} className="ml-auto text-fog hover:text-cream" aria-label="Fechar">
              <X className="size-4" />
            </button>
          </div>
          {atual.status === 'pronta' ? <AcoesArquivo projetoId={projeto.id} e={atual} /> : atual.erro && <p className="text-[12px] text-coral">{atual.erro}</p>}
          {atual.status === 'pronta' && atual.aviso && <p className="text-[12px] text-yellow">{atual.aviso}</p>}
        </div>
      )}
    </>
  )
}

function AcoesArquivo({ projetoId, e }: { projetoId: string; e: Exportacao }) {
  return (
    <div className="grid gap-2">
      <p className="truncate text-[12px] text-fog" title={e.arquivo ?? ''}>
        {e.arquivo}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => void mostrarExportacao(projetoId).catch((x) => window.alert((x as Error).message))}
          className="flex items-center gap-1.5 rounded-full border border-line-dark px-3 py-1 text-[12px] font-semibold text-fog hover:text-cream"
        >
          <FolderOpen className="size-3.5" /> Abrir no Finder
        </button>
        <a href={urlExportacao(projetoId)} download className="flex items-center gap-1.5 rounded-full border border-line-dark px-3 py-1 text-[12px] font-semibold text-fog hover:text-cream">
          <Download className="size-3.5" /> Baixar
        </a>
      </div>
    </div>
  )
}

function Opcoes<T extends string | number>(p: { rotulo: string; valor: T; opcoes: { id: T; nome: string; dica?: string }[]; mudar: (v: T) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="eyebrow text-sage">{p.rotulo}</span>
      <div className="flex gap-2">
        {p.opcoes.map((o) => (
          <button
            key={o.id}
            onClick={() => p.mudar(o.id)}
            aria-pressed={p.valor === o.id}
            className={cn(
              'flex min-w-[76px] flex-col items-center rounded-[6px] px-3 py-1.5 text-[13px] font-semibold ring-1 transition-colors',
              p.valor === o.id ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream',
            )}
          >
            {o.nome}
            {o.dica && <span className={cn('text-[10px] font-normal', p.valor === o.id ? 'text-ink/60' : 'text-fog/70')}>{o.dica}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function ModalExportar(p: {
  projeto: Projeto
  duracao: number
  atual: Exportacao | null
  fechar: () => void
  comecou: (e: Exportacao) => void
  cancelou: () => void
}) {
  const [o, setO] = useState<OpcoesExportacao>(lembradas)
  const [nome, setNome] = useState(() => nomePadrao(p.projeto, lembradas()))
  const [editouNome, setEditouNome] = useState(false)
  const [resumo, setResumo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const rodando = p.atual?.status === 'rodando'

  // sem direção visual não há inserts (a rota recusaria): o vídeo sai só com o ator
  const temDirecao = !!p.projeto.direcao?.itens?.length
  useEffect(() => {
    if (!temDirecao) return
    void lerInserts(p.projeto.id)
      .then((r) => {
        const com = r.pedidos.filter((x) => x.midias.length)
        const comentarios = com.filter((x) => x.tipo === 'comentario_insert_ator').length
        const fundo = FUNDOS.find((f) => f.id === (r.fundo ?? 'gradiente'))?.nome ?? ''
        setResumo([`${com.length} ${com.length === 1 ? 'insert' : 'inserts'}`, `fundo ${fundo}`, comentarios ? `${comentarios} ${comentarios === 1 ? 'comentário' : 'comentários'}` : null].filter(Boolean).join(' · '))
      })
      .catch(() => setResumo('inserts não lidos'))
  }, [p.projeto.id, temDirecao])

  const mudar = (campos: Partial<OpcoesExportacao>) => {
    const novo = { ...o, ...campos }
    setO(novo)
    if (!editouNome) setNome(nomePadrao(p.projeto, novo))
  }
  const exportar = async () => {
    setEnviando(true)
    try {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(o))
      } catch {
        /* sem armazenamento: só não lembra */
      }
      p.comecou(await exportarProjeto(p.projeto.id, { ...o, nome }))
    } catch (e) {
      window.alert((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (rodando && p.atual)
    return (
      <Modal titulo="Exportando" fechar={p.fechar}>
        <p className="truncate text-[13px] text-fog">{p.atual.nome}</p>
        <div className="h-2 overflow-hidden rounded-full bg-cream/10">
          <div className="h-full rounded-full bg-coral transition-[width] duration-700" style={{ width: `${Math.round(p.atual.progresso * 100)}%` }} />
        </div>
        <p className="text-[12px] text-fog">
          {Math.round(p.atual.progresso * 100)}% · roda em segundo plano: pode fechar esta janela, trocar de etapa ou de projeto.
        </p>
        <div className="flex justify-end">
          <button
            onClick={() => void cancelarExportacao(p.projeto.id).then(p.cancelou)}
            className="rounded-full border border-line-dark px-4 py-1.5 text-[12px] font-semibold text-fog hover:border-coral hover:text-coral"
          >
            Cancelar exportação
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal titulo="Exportar vídeo" fechar={p.fechar}>
      <div className="grid gap-4">
        <Opcoes rotulo="Resolução" valor={o.resolucao} opcoes={RESOLUCOES.map((r) => ({ id: r.id, nome: r.nome, dica: r.px }))} mudar={(resolucao) => mudar({ resolucao })} />
        <Opcoes rotulo="Quadros por segundo" valor={o.fps} opcoes={FPS.map((f) => ({ id: f, nome: `${f} fps` }))} mudar={(fps) => mudar({ fps })} />
        <Opcoes rotulo="Codec" valor={o.codec} opcoes={CODECS} mudar={(codec) => mudar({ codec })} />
        <Opcoes
          rotulo="Navegadores em paralelo"
          valor={o.navegadores}
          opcoes={NAVEGADORES.map((n) => ({ id: n, nome: String(n), dica: n === 6 ? 'padrão' : n < 6 ? 'mais leve' : 'mais rápido' }))}
          mudar={(navegadores) => mudar({ navegadores })}
        />
        <label className="grid gap-1.5">
          <span className="eyebrow text-sage">Nome do arquivo</span>
          <input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setEditouNome(true)
            }}
            className="w-full rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[13px] text-cream outline-none focus:border-cream/50"
          />
        </label>
        <p className="text-[12px] leading-[1.6] text-fog">
          {temDirecao ? (resumo ?? '…') : 'sem direção visual: só o ator'} · {Math.floor(p.duracao / 60)}:{String(Math.round(p.duracao % 60)).padStart(2, '0')} · ≈ {tamanho(o, p.duracao)}
          {o.fps > 24 && <span className="block">O bruto tem 24 fps: o ator repete quadros; os inserts saem fluidos em {o.fps} fps.</span>}
        </p>
        {p.atual?.status === 'pronta' && (
          <div className="grid gap-1 border-t border-line-dark pt-3">
            <span className="eyebrow text-sage">Última exportação</span>
            <AcoesArquivo projetoId={p.projeto.id} e={p.atual} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={p.fechar} className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-fog hover:text-cream">
            Cancelar
          </button>
          <Button
            variant="coral"
            size="sm"
            disabled={enviando || !nome.trim() || p.duracao <= 0}
            onClick={() => void exportar()}
            className="h-9 gap-6 px-4"
          >
            Exportar <span className="seta">↗</span>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
