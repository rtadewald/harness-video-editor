import type { Clipe, Palavra, Silencio } from '@/api'
import { ms3 } from '@/api'

/** O que Rodrigo tem selecionado na etapa de Cortes (texto e timeline compartilham). */
export type Selecao = { tipo: 'palavra'; id: string } | { tipo: 'corte'; n: number } | null

/** Um trecho do bruto que NÃO vai para o vídeo: antes do primeiro clipe, entre dois clipes, ou depois do último. */
export type Corte = {
  n: number
  ini: number
  fim: number
  antes: Clipe | null
  depois: Clipe | null
  /** Última palavra mantida antes do corte e primeira mantida depois. */
  palavraAntes: Palavra | null
  palavraDepois: Palavra | null
  removidas: Palavra[]
  /** 'pausa' = nenhuma palavra saiu; só uma pausa longa foi encurtada. */
  tipo: 'removido' | 'pausa'
}

export function calcularCortes(clipes: Clipe[], palavras: Palavra[], duracao: number): Corte[] {
  const cs = [...clipes].sort((a, b) => a.inicio - b.inicio)
  if (!cs.length) return []
  const indice = new Map(palavras.map((p, i) => [p.id, i]))
  const lacunas: [Clipe | null, Clipe | null][] = []
  if (cs[0].inicio > 0.05) lacunas.push([null, cs[0]])
  cs.slice(1).forEach((c, i) => c.inicio - cs[i].fim > 0.001 && lacunas.push([cs[i], c]))
  if (duracao - cs[cs.length - 1].fim > 0.05) lacunas.push([cs[cs.length - 1], null])

  return lacunas.map(([antes, depois], i) => {
    const a = antes ? indice.get(antes.palavra_fim)! : -1
    const b = depois ? indice.get(depois.palavra_ini)! : palavras.length
    const removidas = palavras.slice(a + 1, b)
    return {
      n: i + 1,
      ini: antes ? antes.fim : 0,
      fim: depois ? depois.inicio : duracao,
      antes,
      depois,
      palavraAntes: a >= 0 ? palavras[a] : null,
      palavraDepois: b < palavras.length ? palavras[b] : null,
      removidas,
      tipo: removidas.length ? 'removido' : 'pausa',
    }
  })
}

export const refCorte = (c: Corte) => `✂${c.n} · ${ms3(c.ini)} → ${ms3(c.fim)} s`
export const refPalavra = (p: Palavra) => `${p.id} “${p.texto}” · ${ms3(p.inicio)} → ${ms3(p.fim)} s`

export type Borda = {
  lado: 'inicio' | 'fim'
  t: number
  palavra: Palavra | null
  /** Folga entre a borda e a palavra vizinha, em ms. Negativo = o corte entra na palavra. */
  folgaMs: number | null
  silencio: Silencio | null
  /** Clipe dono desta borda e onde a IA a tinha posto, se Rodrigo a moveu. */
  clipeId: string
  automatico: number | null
}

/** Como cada ponta do corte se relaciona com a fala vizinha e com as pausas reais do áudio. */
export function bordasDoCorte(c: Corte, silencios: Silencio[]): Borda[] {
  const silencioEm = (t: number) => silencios.find((s) => s.inicio - 0.001 <= t && t <= s.fim + 0.001) ?? null
  const out: Borda[] = []
  if (c.palavraAntes) {
    out.push({ lado: 'inicio', t: c.ini, palavra: c.palavraAntes, folgaMs: Math.round((c.ini - c.palavraAntes.fim) * 1000), silencio: silencioEm(c.ini), clipeId: c.antes!.id, automatico: c.antes!.auto?.fim ?? null })
  }
  if (c.palavraDepois) {
    out.push({ lado: 'fim', t: c.fim, palavra: c.palavraDepois, folgaMs: Math.round((c.palavraDepois.inicio - c.fim) * 1000), silencio: silencioEm(c.fim), clipeId: c.depois!.id, automatico: c.depois!.auto?.inicio ?? null })
  }
  return out
}

/** Trecho a tocar para "ouvir emenda": ~2 s antes e ~2 s depois do corte, sem sair dos clipes vizinhos. */
export function trechoDaEmenda(c: Corte, margem = 2): { de: number; ate: number } {
  if (c.antes && c.depois) return { de: Math.max(c.antes.inicio, c.ini - margem), ate: Math.min(c.depois.fim, c.fim + margem) }
  if (c.antes) return { de: Math.max(c.antes.inicio, c.ini - margem), ate: c.ini } // corte no fim do vídeo
  return { de: c.fim, ate: Math.min(c.depois!.fim, c.fim + margem) } // corte no começo do vídeo
}
