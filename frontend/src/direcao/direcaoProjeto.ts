import type { ItemDirecaoProjeto, ItemRef, Palavra } from '@/api'
import type { Sequencia } from '@/player/sequencia'

/** Conversão entre a direção guardada (presa a palavras) e a editada na tela (tempos no vídeo final).
 *  Guardar presa às palavras faz a direção acompanhar mudanças nos cortes (SPEC §9). */

/** Palavra que toca no vídeo final, com início e fim na saída e as bordas do trecho (clipe) em que ela está. */
export type PalavraSaida = Palavra & { saida_ini: number; saida_fim: number; clipe_ini: number; clipe_fim: number }

export function palavrasNaSaida(palavras: Palavra[], seq: Sequencia): PalavraSaida[] {
  const out: PalavraSaida[] = []
  for (const w of palavras) {
    if (w.mantida === false) continue
    const s = seq.palavraNaSaida(w)
    const c = s && seq.clipes.find((c) => s.ini >= c.saida_ini - 0.001 && s.ini < c.saida_fim)
    if (s && c) out.push({ ...w, saida_ini: s.ini, saida_fim: s.fim, clipe_ini: c.saida_ini, clipe_fim: c.saida_fim })
  }
  return out.sort((a, b) => a.saida_ini - b.saida_ini)
}

/** Itens em tempo de saída (para a timeline) e os órfãos (todas as palavras deles foram cortadas). */
export function paraTempo(itens: ItemDirecaoProjeto[], palavras: Palavra[], saida: PalavraSaida[], duracao: number) {
  const ordem = new Map(palavras.map((w, k) => [w.id, k]))
  const naSaida = new Map(saida.map((w) => [w.id, w]))
  // a palavra âncora foi cortada? usa a primeira (ou a última) que sobrou dentro do intervalo do item
  const resolver = (ini: string, fim: string, lado: 'ini' | 'fim') => {
    const a = ordem.get(ini) ?? 0
    const b = ordem.get(fim) ?? a
    const dentro = saida.filter((w) => (ordem.get(w.id) ?? -1) >= a && (ordem.get(w.id) ?? -1) <= b)
    const alvo = naSaida.get(lado === 'ini' ? ini : fim)
    if (alvo) return { w: alvo, exato: true }
    const w = lado === 'ini' ? dentro[0] : dentro[dentro.length - 1]
    return w ? { w, exato: false } : null
  }
  const visiveis: ItemRef[] = []
  const orfaos: ItemDirecaoProjeto[] = []
  for (const i of itens) {
    const a = resolver(i.palavra_ini, i.palavra_fim, 'ini')
    const b = resolver(i.palavra_ini, i.palavra_fim, 'fim')
    if (!a || !b) {
      orfaos.push(i)
      continue
    }
    // a folga em volta da palavra nunca atravessa uma emenda: a troca não começa no fim do trecho anterior
    const inicio = Math.max(a.w.clipe_ini, a.w.saida_ini + (a.exato ? i.off_ini : 0))
    const fim = Math.min(b.w.clipe_fim, b.w.saida_fim + (b.exato ? i.off_fim : 0))
    visiveis.push({ id: i.id, camada: i.camada, tipo: i.tipo, conteudo: i.conteudo, inicio, fim, descricao: i.descricao, texto: i.texto })
  }
  // planos contíguos: cada um vai até o começo do seguinte; o primeiro começa no 0 e o último termina no fim do vídeo
  const planos = visiveis.filter((i) => i.camada === 'plano').sort((x, y) => x.inicio - y.inicio)
  planos.forEach((p, k) => {
    p.inicio = k === 0 ? 0 : Math.max(p.inicio, planos[k - 1].inicio + 0.05)
  })
  planos.forEach((p, k) => (p.fim = k + 1 < planos.length ? planos[k + 1].inicio : duracao))
  for (const e of visiveis) {
    if (e.camada === 'elemento') {
      e.inicio = Math.max(0, e.inicio)
      e.fim = Math.min(duracao, Math.max(e.fim, e.inicio + 0.05))
    }
  }
  return { visiveis, orfaos }
}

/** De volta para a forma guardada: cada ponta vira palavra + deslocamento. */
export function paraAncora(itens: ItemRef[], saida: PalavraSaida[]): ItemDirecaoProjeto[] {
  const r3 = (t: number) => Math.round(t * 1000) / 1000
  const ultima = saida[saida.length - 1]
  return itens.map((i) => {
    const wi = saida.find((w) => w.saida_fim > i.inicio + 0.001) ?? ultima
    const anteriores = saida.filter((w) => w.saida_ini < i.fim - 0.001)
    const ult = anteriores[anteriores.length - 1] ?? wi
    const wf = ult.saida_ini < wi.saida_ini ? wi : ult
    return {
      id: i.id,
      camada: i.camada,
      tipo: i.tipo,
      conteudo: i.conteudo,
      palavra_ini: wi.id,
      palavra_fim: wf.id,
      off_ini: r3(i.inicio - wi.saida_ini),
      // um plano é definido pelo começo (o fim dele é o começo do seguinte)
      off_fim: i.camada === 'plano' ? 0 : r3(i.fim - wf.saida_fim),
      texto: i.texto,
      descricao: i.descricao,
    }
  })
}
