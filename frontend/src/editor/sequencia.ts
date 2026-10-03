import type { Ancora, Clipe, Palavra, Timeline } from '@/api'

/** Clipe da V1 posicionado na saída (o vídeo final é a V1 tocada em sequência). */
export type ClipeNaSaida = Clipe & { saida_ini: number; saida_fim: number }

export type Sequencia = {
  clipes: ClipeNaSaida[]
  duracao: number
  fonteParaSaida: (t: number) => number | null
  saidaParaFonte: (s: number) => number
  /** Intervalo de um item ancorado, na saída. null = órfão (suas palavras foram cortadas). */
  intervalo: (a: Ancora) => { ini: number; fim: number } | null
  palavraNaSaida: (p: Palavra) => number | null
}

export function montarSequencia(timeline: Timeline, palavras: Palavra[]): Sequencia {
  let acc = 0
  const clipes = [...timeline.V1]
    .sort((a, b) => a.inicio - b.inicio)
    .map((c) => {
      const saida_ini = acc
      acc += c.fim - c.inicio
      return { ...c, saida_ini, saida_fim: acc }
    })
  const porId = new Map(palavras.map((p) => [p.id, p]))

  const fonteParaSaida = (t: number) => {
    const c = clipes.find((c) => t >= c.inicio && t < c.fim)
    return c ? c.saida_ini + (t - c.inicio) : null
  }
  const saidaParaFonte = (s: number) => {
    const c = clipes.find((c) => s < c.saida_fim) ?? clipes[clipes.length - 1]
    return c ? c.inicio + Math.min(Math.max(s - c.saida_ini, 0), c.fim - c.inicio) : 0
  }
  const palavraNaSaida = (p: Palavra) => fonteParaSaida((p.inicio + p.fim) / 2)

  const intervalo = (a: Ancora) => {
    const ini = porId.get(a.palavra_ini)
    const fim = porId.get(a.palavra_fim)
    if (!ini || !fim) return null
    const s0 = fonteParaSaida(ini.inicio + 0.001)
    const s1 = fonteParaSaida(fim.fim - 0.001)
    return s0 == null || s1 == null ? null : { ini: s0, fim: s1 }
  }

  return { clipes, duracao: acc, fonteParaSaida, saidaParaFonte, intervalo, palavraNaSaida }
}
