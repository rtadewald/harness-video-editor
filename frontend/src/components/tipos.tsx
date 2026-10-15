import { useEffect, useState } from 'react'
import { lerConfig, type Tipo } from '@/api'
import { cn } from '@/lib/utils'

/** Os tipos de vídeo (Reels, Ad, VSL…; docs/editor-claude.md, Q33), das Configurações: lidos uma vez por página e
 *  relidos quando mudam lá (`tiposMudaram`). Cada projeto e cada referência tem um. */
const EVENTO = 'tipos-mudaram'
let cache: Promise<Tipo[]> | null = null
const carregar = () => (cache ??= lerConfig().then((c) => c.tipos).catch(() => []))

export function tiposMudaram() {
  cache = null
  window.dispatchEvent(new Event(EVENTO))
}

export function useTipos(): Tipo[] {
  const [tipos, setTipos] = useState<Tipo[]>([])
  useEffect(() => {
    let vivo = true
    const ler = () => void carregar().then((t) => vivo && setTipos(t))
    ler()
    window.addEventListener(EVENTO, ler)
    return () => {
      vivo = false
      window.removeEventListener(EVENTO, ler)
    }
  }, [])
  return tipos
}

export const rotuloTipo = (tipos: Tipo[], id: string) => {
  const t = tipos.find((x) => x.id === id)
  return t ? `${t.emoji ? `${t.emoji} ` : ''}${t.nome}` : id
}

/** O filtro por tipo de uma página (null = todos), lembrado neste navegador. */
export function useFiltroTipo(chave: string): [string | null, (t: string | null) => void] {
  const [tipo, setTipo] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`tipo.${chave}`) || null
    } catch {
      return null
    }
  })
  const mudar = (t: string | null) => {
    setTipo(t)
    try {
      if (t) localStorage.setItem(`tipo.${chave}`, t)
      else localStorage.removeItem(`tipo.${chave}`)
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }
  return [tipo, mudar]
}

const CHIP = 'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-colors'
const LIGADO = 'border-cream bg-cream text-ink'
const DESLIGADO = 'border-line-dark text-fog hover:border-cream/50 hover:text-cream'

/** Os chips de filtro: Todos e um por tipo, com a contagem (`contar`). */
export function ChipsTipo(p: { tipos: Tipo[]; atual: string | null; mudar: (t: string | null) => void; contar?: (t: string | null) => number; semTodos?: boolean }) {
  const n = (t: string | null) =>
    p.contar && <span className={cn('tabular-nums', p.atual === t ? 'text-ink/60' : 'text-fog/60')}>{p.contar(t)}</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!p.semTodos && (
        <button onClick={() => p.mudar(null)} className={cn(CHIP, p.atual === null ? LIGADO : DESLIGADO)}>
          Todos {n(null)}
        </button>
      )}
      {p.tipos.map((t) => (
        <button key={t.id} onClick={() => p.mudar(t.id)} className={cn(CHIP, p.atual === t.id ? LIGADO : DESLIGADO)}>
          {t.emoji && <span aria-hidden>{t.emoji}</span>}
          {t.nome} {n(t.id)}
        </button>
      ))}
    </div>
  )
}

/** Trocar o tipo de um projeto ou de uma referência: o emoji (o nome no título) e, ao clicar, a lista. */
export function SeletorTipo(p: { tipos: Tipo[]; valor: string; mudar: (t: string) => void; className?: string }) {
  return (
    <select
      value={p.valor}
      onChange={(e) => p.mudar(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title={`Tipo: ${rotuloTipo(p.tipos, p.valor)}`}
      aria-label="Tipo de vídeo"
      className={cn('cursor-pointer appearance-none rounded-full border border-line-dark bg-ink/85 px-2 py-0.5 text-[11px] text-cream outline-none hover:border-cream/50', p.className)}
    >
      {!p.tipos.some((t) => t.id === p.valor) && <option value={p.valor}>{p.valor}</option>}
      {p.tipos.map((t) => (
        <option key={t.id} value={t.id}>
          {rotuloTipo([t], t.id)}
        </option>
      ))}
    </select>
  )
}

/** O filtro por tipo compacto (numa barra que já tem muitos chips): uma lista com "Todos os tipos". */
export function FiltroTipo(p: { tipos: Tipo[]; atual: string | null; mudar: (t: string | null) => void }) {
  return (
    <select
      value={p.atual ?? ''}
      onChange={(e) => p.mudar(e.target.value || null)}
      aria-label="Tipo de vídeo"
      className={cn(CHIP, 'cursor-pointer appearance-none bg-transparent outline-none', p.atual ? LIGADO : DESLIGADO)}
    >
      <option value="">Todos os tipos</option>
      {p.tipos.map((t) => (
        <option key={t.id} value={t.id}>
          {rotuloTipo([t], t.id)}
        </option>
      ))}
    </select>
  )
}
