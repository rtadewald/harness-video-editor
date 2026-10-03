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
  /** Onde a palavra toca na saída (a parte dela que cai num clipe). null = não toca. */
  palavraNaSaida: (p: Palavra) => { ini: number; fim: number } | null
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
  // O Whisper às vezes estica a palavra para dentro de uma pausa cortada: vale o pedaço que toca.
  const palavraNaSaida = (p: Palavra) => {
    const c = clipes.find((c) => p.inicio < c.fim && p.fim > c.inicio)
    if (!c) return null
    return { ini: c.saida_ini + Math.max(p.inicio, c.inicio) - c.inicio, fim: c.saida_ini + Math.min(p.fim, c.fim) - c.inicio }
  }

  const intervalo = (a: Ancora) => {
    const ini = porId.get(a.palavra_ini)
    const fim = porId.get(a.palavra_fim)
    const s0 = ini && palavraNaSaida(ini)
    const s1 = fim && palavraNaSaida(fim)
    return s0 && s1 ? { ini: s0.ini, fim: s1.fim } : null
  }

  return { clipes, duracao: acc, fonteParaSaida, saidaParaFonte, intervalo, palavraNaSaida }
}
