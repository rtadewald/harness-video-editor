/** Enriquecimento dos inserts (mock; SPEC §8.3): como cada insert aparece. Espelha `inserts.OPCOES_ENRIQUECIMENTO` e
 *  `inserts.ESTILO` do backend; os nomes ficam aqui. */
export type Categoria = 'layout' | 'entrada' | 'entre' | 'movimento' | 'saida'
export type Enriquecimento = Record<Categoria, string>
export type Formato = 'vertical' | 'dividida'

export const CATEGORIAS_ENRIQUECIMENTO: { id: Categoria; nome: string; dica?: string }[] = [
  { id: 'layout', nome: 'Layout' },
  { id: 'entrada', nome: 'Entrada' },
  { id: 'entre', nome: 'Entre as mídias', dica: 'quando o insert tem mais de uma' },
  { id: 'movimento', nome: 'Movimento' },
  { id: 'saida', nome: 'Saída' },
]

export const OPCOES: Record<Categoria, Record<Formato, string[]>> = {
  layout: { vertical: ['tela_cheia', 'card', 'janela_3d', 'inclinado', 'destaque'], dividida: ['metade', 'card_metade', 'janela_3d_metade', 'mesclada'] },
  entrada: dobro(['sem', 'surgir', 'deslizar', 'subir', 'mola', 'girar', 'voo_3d', 'zoom_borrado']),
  entre: dobro(['sequencia_corte', 'sequencia_transicao', 'lado_a_lado', 'grade', 'empilhadas']),
  movimento: dobro(['parado', 'zoom_lento', 'zoom_ponto', 'rolagem']),
  saida: dobro(['corte', 'sumir', 'deslizar']),
}
function dobro(l: string[]) {
  return { vertical: l, dividida: l }
}

export const NOMES: Record<string, string> = {
  tela_cheia: 'Tela cheia',
  card: 'Card',
  janela_3d: 'Janela 3D',
  inclinado: 'Inclinado',
  destaque: 'Destaque',
  metade: 'Metade inteira',
  card_metade: 'Card na metade',
  janela_3d_metade: 'Janela 3D',
  mesclada: 'Tela mesclada',
  sem: 'Sem animação',
  surgir: 'Surgir',
  deslizar: 'Deslizar',
  subir: 'Subir',
  mola: 'Mola',
  girar: 'Girar',
  voo_3d: 'Voo 3D',
  zoom_borrado: 'Zoom borrado',
  sequencia_corte: 'Em sequência · corte',
  sequencia_transicao: 'Em sequência · transição',
  lado_a_lado: 'Lado a lado',
  grade: 'Grade',
  empilhadas: 'Empilhadas',
  parado: 'Parado',
  zoom_lento: 'Zoom lento',
  zoom_ponto: 'Zoom num ponto',
  rolagem: 'Rolagem',
  corte: 'Corte seco',
  sumir: 'Sumir',
}

export const ESTILO: Record<Formato, Enriquecimento> = {
  vertical: { layout: 'card', entrada: 'surgir', entre: 'sequencia_corte', movimento: 'zoom_lento', saida: 'corte' },
  dividida: { layout: 'metade', entrada: 'surgir', entre: 'sequencia_corte', movimento: 'zoom_lento', saida: 'corte' },
}

/** O enriquecimento valendo num insert: o estilo do formato com o que o criador mudou por cima. */
export const enriquecimentoDe = (x: { formato: Formato; enriquecimento?: Partial<Enriquecimento> }): Enriquecimento => ({
  ...ESTILO[x.formato],
  ...(x.enriquecimento ?? {}),
})

/** O selinho da timeline: "Card · Surgir" (+ como combina, se há mais de uma mídia). */
export const resumo = (e: Enriquecimento, nMidias: number) =>
  [NOMES[e.layout], NOMES[e.entrada], nMidias > 1 ? NOMES[e.entre] : null].filter(Boolean).join(' · ')
