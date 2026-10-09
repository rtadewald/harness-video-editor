import { cn } from '@/lib/utils'
import type { Preset } from '@/presets/presets'

// o que as partes da página Presets compartilham

/** Muda quando a posição parada do card muda (o recorte da referência é refeito). */
export const versao = (p: Preset, j: number) => {
  const c = p.receita.cards[j]
  let h = 0
  for (const ch of JSON.stringify([p.fontes[0], c?.repouso, c?.inicio_frac, c?.entrada?.duracao])) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

const CHIP = 'rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1'

export const chip = (ativo: boolean) => cn(CHIP, ativo ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')
