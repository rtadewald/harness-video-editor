import { useEffect, useRef, useState } from 'react'
import { History, LoaderCircle, Lock, RotateCcw } from 'lucide-react'
import { destravarProjeto, lerAtividade, lerVersoes, restaurarVersao, salvarVersao, type EntradaAtividade, type EstadoClaude, type VersaoProjeto } from '@/api'
import { cn } from '@/lib/utils'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const ETAPA: Record<string, string> = { cortes: 'cortes', direcao: 'direção', inserts: 'inserts', motions: 'motions', presets: 'presets', transicoes: 'transições', audio: 'áudio', legenda: 'legenda', checagem: 'checagem', versao: 'versão' }

/** As versões do projeto inteiro e o Claude trabalhando (docs/editor-claude.md, E2): o seletor de versão (voltar a uma,
 *  salvar a de agora), o aviso "Claude editando · etapa" com o registro do que ele fez (o projeto fica só leitura e dá
 *  para destravar) e o aviso "a vN chegou". Consulta o servidor a cada 4 s; `mudou` relê o projeto. */
export default function Versoes(p: { projetoId: string; mudou: () => void }) {
  const [versoes, setVersoes] = useState<VersaoProjeto[]>([])
  const [atual, setAtual] = useState(0)
  const [claude, setClaude] = useState<EstadoClaude>({ editando: false })
  const [atividade, setAtividade] = useState<EntradaAtividade[]>([])
  const [aberto, setAberto] = useState<'versoes' | 'atividade' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const ultima = useRef<number | null>(null)
  const editava = useRef(false)
  const mudou = useRef(p.mudou)
  useEffect(() => {
    mudou.current = p.mudou
  })

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      try {
        const [v, a] = await Promise.all([lerVersoes(p.projetoId), lerAtividade(p.projetoId)])
        if (!vivo) return
        setVersoes(v.versoes)
        setAtual(v.atual)
        setClaude(a.claude)
        setAtividade(a.atividade.slice(-12).reverse())
        const n = v.versoes.at(-1)?.versao ?? 0
        // uma versão nova (o Claude entregou) ou o fim da trava: relê o projeto
        if ((ultima.current != null && n > ultima.current) || (editava.current && !a.claude.editando)) {
          mudou.current()
          if (ultima.current != null && n > ultima.current) {
            setAviso(`A v${n} chegou`)
            setTimeout(() => setAviso(null), 5000)
          }
        }
        ultima.current = n
        editava.current = a.claude.editando
      } catch {
        /* sem servidor: tenta de novo */
      }
    }
    void ler()
    const t = setInterval(ler, 4000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [p.projetoId])

  const voltar = async (n: number) => {
    if (!window.confirm(`Voltar o projeto à v${n}? O estado de agora fica guardado se você salvar uma versão antes.`)) return
    await restaurarVersao(p.projetoId, n).catch((e) => window.alert((e as Error).message))
    setAberto(null)
    p.mudou()
  }
  const salvar = async () => {
    const v = await salvarVersao(p.projetoId).catch((e) => window.alert((e as Error).message))
    if (v) setVersoes((l) => [...l, v])
  }

  return (
    <div className="relative flex items-center gap-1">
      {claude.editando && (
        <button
          onClick={() => setAberto(aberto === 'atividade' ? null : 'atividade')}
          className="flex h-8 items-center gap-2 rounded-full bg-yellow/15 px-3 text-[11px] font-semibold text-yellow ring-1 ring-yellow/50"
          title="O Claude está editando: o projeto fica só leitura até a versão chegar"
        >
          <LoaderCircle className="size-3.5 animate-spin" />
          Claude editando{claude.etapa ? ` · ${ETAPA[claude.etapa] ?? claude.etapa}` : ''}
          <Lock className="size-3 opacity-70" />
        </button>
      )}
      <button
        onClick={() => setAberto(aberto === 'versoes' ? null : 'versoes')}
        className={cn('flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-semibold hover:bg-cream/10 hover:text-cream', aberto === 'versoes' && 'bg-cream/10 text-cream')}
        title="Versões do projeto"
        aria-label="Versões"
      >
        <History className="size-4" />
        {atual ? `v${atual}` : null}
      </button>
      {aviso && <span className="absolute top-10 right-0 z-50 rounded-full bg-mint px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap text-ink shadow-lg">{aviso}</span>}
      {aberto && (
        <div className="absolute top-10 right-0 z-50 w-[380px] rounded-[10px] border border-line-dark bg-ink p-3 text-cream shadow-2xl">
          {aberto === 'versoes' ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <p className="eyebrow flex-1 text-sage">Versões do projeto</p>
                <button onClick={() => void salvar()} className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-fog ring-1 ring-line-dark hover:text-cream">
                  Salvar versão agora
                </button>
              </div>
              {!versoes.length && <p className="text-[12px] text-fog">Nenhuma versão ainda. O Claude marca uma a cada entrega; você também pode salvar a de agora.</p>}
              <ul className="grid max-h-[50vh] gap-1 overflow-y-auto">
                {[...versoes].reverse().map((v) => (
                  <li key={v.versao} className={cn('flex items-start gap-2 rounded-[6px] px-2 py-1.5', v.versao === atual && 'bg-cream/[0.06]')}>
                    <b className="w-8 shrink-0 text-[12px] tabular-nums">v{v.versao}</b>
                    <span className="grid min-w-0 flex-1 text-[11.5px]">
                      <span className="text-fog">
                        {quando(v.criado_em)} · {v.autor === 'claude' ? 'Claude' : 'você'}
                        {v.versao === atual ? ' · a de agora' : ''}
                        {v.aprovada && <b className="text-mint"> · ✓ aprovada</b>}
                      </span>
                      {v.resumo && <span className="line-clamp-2 text-cream/85">{v.resumo}</span>}
                    </span>
                    {v.versao !== atual && (
                      <button onClick={() => void voltar(v.versao)} className="flex shrink-0 items-center gap-1 text-[11px] text-fog hover:text-cream" title={`Voltar à v${v.versao}`}>
                        <RotateCcw className="size-3" /> Voltar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <p className="eyebrow flex-1 text-yellow">O que o Claude está fazendo</p>
                <button
                  onClick={() => window.confirm('Destravar o projeto? Use só se o Claude parou no meio.') && void destravarProjeto(p.projetoId)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-fog ring-1 ring-line-dark hover:text-cream"
                >
                  Destravar
                </button>
              </div>
              <ul className="grid max-h-[50vh] gap-1 overflow-y-auto text-[11.5px]">
                {atividade.map((a, k) => (
                  <li key={k} className="flex gap-2">
                    <span className="w-24 shrink-0 text-fog tabular-nums">{quando(a.em).split(', ')[1] ?? quando(a.em)}</span>
                    <span className="min-w-0 flex-1">
                      <b className="text-sage">{ETAPA[a.etapa] ?? a.etapa}</b> · {a.texto}
                      {a.segundos != null && <span className="text-fog"> ({a.segundos.toFixed(0)} s)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
