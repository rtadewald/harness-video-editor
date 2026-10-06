import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import {
  lerHeuristica,
  lerRoteiro,
  salvarHeuristica,
  sugerirRegras,
  urlArquivoReferencia,
  voltarHeuristica,
  type HeuristicaDirecao,
  type LinhaRoteiro,
  type Referencia,
  type RoteiroRef,
} from '@/api'
import { cn } from '@/lib/utils'
import { COR_PLANO } from './LinhaDirecao'
import Markdown from './Markdown'

/** Toca um intervalo do vídeo em loop (para as linhas do roteiro). */
function useIntervalo(video: React.RefObject<HTMLVideoElement | null>, linha: LinhaRoteiro | null) {
  useEffect(() => {
    const v = video.current
    if (!v || !linha) return
    const comecar = () => {
      v.currentTime = linha.inicio
      v.play().catch(() => {
        v.muted = true
        void v.play()
      })
    }
    const vigiar = () => v.currentTime >= linha.fim - 0.03 && (v.currentTime = linha.inicio)
    if (v.readyState >= 1) comecar()
    else v.addEventListener('loadedmetadata', comecar, { once: true })
    v.addEventListener('timeupdate', vigiar)
    return () => v.removeEventListener('timeupdate', vigiar)
  }, [video, linha])
}

const TAG_LETTERING = /<lettering(?:\s+texto\s*=\s*["“]([^"”]*)["”])?\s*>(.*?)<\/lettering\s*>/gi

/** A fala com os `<lettering>` destacados (e o texto da tela, quando é diferente do falado). */
export function FalaComLettering({ fala }: { fala: string }) {
  const partes: React.ReactNode[] = []
  let pos = 0
  for (const m of fala.matchAll(TAG_LETTERING)) {
    partes.push(fala.slice(pos, m.index))
    partes.push(
      <mark key={m.index} className="rounded-[2px] bg-yellow/20 px-0.5 text-yellow" title={m[1] ? `Lettering na tela: ${m[1]}` : 'Lettering'}>
        {m[2]}
        {m[1] && <span className="ml-1 font-mono text-[10.5px] text-yellow/70">→ {m[1]}</span>}
      </mark>,
    )
    pos = m.index! + m[0].length
  }
  partes.push(fala.slice(pos))
  return <>“{partes}”</>
}

/** Um roteiro dirigido: a marcação `[plano: …]` em cima e a fala embaixo, linha por linha. Clicar toca o trecho. */
function Roteiro({ linhas, atual, tocar }: { linhas: LinhaRoteiro[]; atual?: string | null; tocar: (l: LinhaRoteiro) => void }) {
  return (
    <div className="grid gap-3">
      {linhas.map((l) => (
        <button
          key={l.plano}
          onClick={() => tocar(l)}
          className={cn('group grid gap-0.5 rounded-[4px] px-3 py-2 text-left transition-colors hover:bg-cream/5', atual === l.plano && 'bg-cream/10')}
        >
          <span className="flex items-start gap-2 font-mono text-[11.5px] leading-[1.55] text-yellow">
            <span className={cn('mt-[5px] size-2 shrink-0 rounded-full', COR_PLANO[l.tipo])} />
            {l.marcacao}
          </span>
          <span className="pl-4 text-[13px] leading-[1.6] text-cream/90">{l.fala ? <FalaComLettering fala={l.fala} /> : <i className="text-fog">(sem fala)</i>}</span>
        </button>
      ))}
    </div>
  )
}

/** Modal de um vídeo da Calibragem: o roteiro decupado ao lado do vídeo, e o botão para abrir a calibragem (revisão). */
export function ModalVideo({ r, fechar }: { r: Referencia; fechar: () => void }) {
  const [linhas, setLinhas] = useState<LinhaRoteiro[] | null>(null)
  const [atual, setAtual] = useState<LinhaRoteiro | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  useIntervalo(video, atual)
  useEffect(() => {
    lerRoteiro(r.id)
      .then((d) => setLinhas(d.linhas))
      .catch(() => setLinhas([]))
  }, [r.id])
  useEffect(() => {
    const t = (ev: KeyboardEvent) => ev.key === 'Escape' && fechar()
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [fechar])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>
      <div
        className="grid max-h-full w-full max-w-[1100px] grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="col-span-2 flex items-center gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-sage">Roteiro dirigido</p>
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.03em]">{r.nome}</h2>
          </div>
          <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold', r.status === 'revisado' ? 'bg-mint text-ink' : 'bg-coral text-cream')}>
            {r.status === 'revisado' ? '✓ Revisado' : 'A revisar'}
          </span>
          <Link to={`/calibragem/${r.id}`} className="ml-auto flex h-9 items-center gap-2 rounded-full bg-coral px-4 text-[12px] font-semibold text-cream hover:bg-coral/90">
            Abrir calibragem <span className="seta">↗</span>
          </Link>
          <button onClick={fechar} aria-label="Fechar" className="grid size-9 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
            <X className="size-4" />
          </button>
        </div>
        <video ref={video} src={urlArquivoReferencia(r.id, 'proxy.mp4')} controls playsInline className="h-[min(72vh,700px)] w-auto rounded-[6px] bg-black" />
        <div className="min-h-0 overflow-y-auto pr-1">
          {linhas === null ? <p className="text-fog">Carregando…</p> : <Roteiro linhas={linhas} atual={atual?.plano} tocar={setAtual} />}
        </div>
      </div>
    </div>
  )
}

/** Aba "Heurística" da Calibragem: a heurística da direção (regras + roteiros de exemplo). */
export function HeuristicaDirecao({ versao }: { versao: number }) {
  return <EditorHeuristica versao={versao} />
}

/** Heurística da direção (SPEC §8.2.1): as regras (texto Markdown que você lê ou edita) e os roteiros de exemplo,
 *  montados da análise (corrige-se na revisão de cada vídeo). Tudo vai para o prompt do diretor. */
function EditorHeuristica({ versao }: { versao: number }) {
  const [h, setH] = useState<HeuristicaDirecao | null>(null)
  const [modo, setModo] = useState<'ler' | 'editar'>('ler')
  const [sugerindo, setSugerindo] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState<{ refId: string; nome: string; linha: LinhaRoteiro } | null>(null)
  useEffect(() => {
    lerHeuristica().then(setH).catch((ev) => setErro(ev.message))
  }, [versao])
  const acao = async (f: () => Promise<HeuristicaDirecao>) => {
    setErro('')
    try {
      setH(await f())
    } catch (ev) {
      setErro((ev as Error).message)
    }
  }
  const sugerir = async () => {
    if (!window.confirm('A IA lê os roteiros e refaz as "Regras sugeridas pela IA". As suas regras ficam como estão, e a versão atual é guardada (dá para voltar). Continuar?')) return
    setSugerindo(true)
    await acao(sugerirRegras)
    setSugerindo(false)
    setModo('ler')
  }
  const salvar = async (regras: string) => {
    if (!h || regras === h.regras) return
    await acao(() => salvarHeuristica(regras))
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1500)
  }
  if (!h) return erro ? <p className="text-[12px] text-coral">⚠ {erro}</p> : null
  const linhas = h.roteiros.reduce((n, x) => n + x.linhas.length, 0)
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[18px] font-semibold tracking-[-0.03em]">Heurística da direção</p>
        <button
          onClick={() => void sugerir()}
          disabled={sugerindo}
          className="flex h-8 items-center gap-2 rounded-full border border-yellow/70 bg-yellow/10 px-3.5 text-[11px] font-semibold text-yellow hover:bg-yellow hover:text-ink disabled:opacity-60"
        >
          {sugerindo ? 'Lendo os roteiros…' : 'Sugerir regras com IA'}
        </button>
        {h.tem_anterior && (
          <button onClick={() => void acao(voltarHeuristica)} className="text-[11px] font-semibold text-fog hover:text-cream hover:underline" title="Troca pelas regras de antes da última sugestão">
            ↺ Voltar às regras anteriores
          </button>
        )}
        <span className="text-[11px] text-fog">{salvo ? '✓ Salvo' : ''}</span>
      </div>
      <p className="max-w-[860px] text-[12px] leading-[1.7] text-fog">
        É o que o diretor dos projetos lê, inteiro: as regras e, embaixo, os roteiros dos seus vídeos — a fala com a marcação do que aparecia na tela em cada
        momento. Ele aprende a dirigir olhando o roteiro. As regras você edita aqui; os roteiros vêm da análise (para corrigir uma marcação, abra a calibragem
        do vídeo).
      </p>
      {erro && <p className="text-[12px] text-coral">⚠ {erro}</p>}

      <section className="max-w-[900px]">
        <div className="mb-2 flex items-center gap-3">
          <p className="eyebrow text-sage">Regras</p>
          <div className="flex rounded-full border border-line-dark p-0.5 text-[11px] font-semibold">
            {(['ler', 'editar'] as const).map((m) => (
              <button key={m} onClick={() => setModo(m)} className={cn('rounded-full px-3 py-1', modo === m ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
                {m === 'ler' ? 'Ler' : 'Editar'}
              </button>
            ))}
          </div>
        </div>
        {modo === 'ler' ? (
          <div className="rounded-[6px] bg-deeper px-6 py-4 ring-1 ring-line-dark">
            <Markdown texto={h.regras} exemplo={(_, rotulo) => rotulo} />
          </div>
        ) : (
          <textarea
            key={h.gerado_em ?? 'regras'}
            defaultValue={h.regras}
            spellCheck={false}
            onBlur={(ev) => void salvar(ev.target.value)}
            className="min-h-[40vh] w-full resize-y rounded-[6px] border border-line-dark bg-deeper px-5 py-4 font-mono text-[12.5px] leading-[1.75] text-cream outline-none focus:border-cream/50"
          />
        )}
      </section>

      <section className="max-w-[900px]">
        <p className="eyebrow mb-1 text-sage">Roteiros de exemplo</p>
        <p className="mb-3 text-[11px] text-fog">
          {h.roteiros.length} vídeo(s) · {linhas} linhas. Clique numa linha para assistir àquele trecho.
        </p>
        <div className="grid gap-2">
          {h.roteiros.map((x: RoteiroRef) => (
            <div key={x.ref} className="rounded-[6px] bg-deeper ring-1 ring-line-dark">
              <button onClick={() => setAberto(aberto === x.ref ? null : x.ref)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <ChevronDown className={cn('size-4 text-fog transition-transform', aberto !== x.ref && '-rotate-90')} />
                <span className="font-semibold">{x.nome}</span>
                <span className="text-[11px] text-fog">
                  {x.linhas.length} linhas{x.revisado ? ' · ✓ revisado' : ''}
                </span>
                <Link to={`/calibragem/${x.ref}`} onClick={(ev) => ev.stopPropagation()} className="ml-auto text-[11px] font-semibold text-yellow hover:underline">
                  abrir calibragem ↗
                </Link>
              </button>
              {aberto === x.ref && (
                <div className="border-t border-line-dark px-2 py-3">
                  <Roteiro linhas={x.linhas} atual={tocando?.refId === x.ref ? tocando.linha.plano : null} tocar={(l) => setTocando({ refId: x.ref, nome: x.nome, linha: l })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {tocando && <PlayerLinha {...tocando} fechar={() => setTocando(null)} />}
    </div>
  )
}

/** Toca uma linha do roteiro (em loop), com a marcação e a fala. */
function PlayerLinha({ refId, nome, linha, fechar }: { refId: string; nome: string; linha: LinhaRoteiro; fechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  useIntervalo(video, linha)
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => ev.key === 'Escape' && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>
      <div className="grid max-w-[780px] grid-cols-[auto_minmax(0,1fr)] gap-6 rounded-[8px] bg-deep p-5 ring-1 ring-line-dark" onClick={(ev) => ev.stopPropagation()}>
        <video ref={video} src={urlArquivoReferencia(refId, 'proxy.mp4')} controls playsInline className="h-[min(70vh,620px)] w-auto rounded-[6px] bg-black" />
        <div className="grid content-start gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fog">
              {nome} · {linha.inicio.toFixed(1)}–{linha.fim.toFixed(1)} s
            </span>
            <button onClick={fechar} aria-label="Fechar" className="ml-auto text-fog hover:text-cream">
              <X className="size-4" />
            </button>
          </div>
          <p className="font-mono text-[12px] leading-[1.6] text-yellow">{linha.marcacao}</p>
          <p className="leading-[1.6]">{linha.fala ? <FalaComLettering fala={linha.fala} /> : '(sem fala)'}</p>
        </div>
      </div>
    </div>
  )
}
