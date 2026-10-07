/** Enriquecimento dos inserts (mock; SPEC §8.3): como cada insert aparece. Espelha `inserts.OPCOES_ENRIQUECIMENTO` e
 *  `inserts.ESTILO` do backend; os nomes ficam aqui. */
export type Categoria = 'layout' | 'entrada' | 'entre' | 'movimento' | 'saida'
export type Curva = [number, number, number, number]
/** As categorias e os ajustes da entrada (curva e a parte do trecho que ela dura). */
export type Enriquecimento = Record<Categoria, string> & { curva?: Curva; duracao?: number }

/** Curvas prontas, só as suaves e elegantes (decisão de Rodrigo, out/2026), bem diferentes entre si. */
export const PRESETS_CURVA: { nome: string; curva: Curva }[] = [
  { nome: 'Chega rápido e freia', curva: [0.16, 1, 0.3, 1] },
  { nome: 'Freia bem devagar', curva: [0, 0.7, 0.3, 0.9] }, // chega rápido e vai freando até o último instante
  { nome: 'Desliza leve', curva: [0.33, 1, 0.68, 1] },
  { nome: 'Suave', curva: [0.25, 0.1, 0.25, 1] },
  { nome: 'Acelera e freia', curva: [0.65, 0, 0.35, 1] },
  { nome: 'Começa devagar e assenta', curva: [0.45, 0, 0.2, 1] },
]
/** Duração da entrada (s): slider de 0,5 a 5 s, de 0,25 em 0,25; padrão 1,5 s. */
export const DURACAO = { min: 0.5, max: 5, passo: 0.25, padrao: 1.5 }
export type PadraoCurva = { curva?: Curva; duracao?: number }
/** A curva valendo num insert: a dele, senão o padrão do vídeo, senão chega rápido e freia. */
export const curvaDe = (e: Enriquecimento, padrao?: PadraoCurva): Curva => e.curva ?? padrao?.curva ?? [0.16, 1, 0.3, 1]
/** A duração da entrada (s): a do insert, senão a do padrão do vídeo, senão 1,5 s. */
export const duracaoDe = (e: Enriquecimento, padrao?: PadraoCurva) => e.duracao ?? padrao?.duracao ?? DURACAO.padrao
export type Formato = 'vertical' | 'dividida'

/** Por enquanto (decisão de Rodrigo, out/2026) só o caso de 1 mídia: layout e entrada. Entre as mídias, movimento e saída
 *  voltam quando trabalharmos 2 e 2+ mídias. */
export const CATEGORIAS_ATIVAS: Categoria[] = ['layout', 'entrada']
export const CATEGORIAS_ENRIQUECIMENTO: { id: Categoria; nome: string; dica?: string }[] = [
  { id: 'layout', nome: 'Layout' },
  { id: 'entrada', nome: 'Entrada' },
  { id: 'entre', nome: 'Entre as mídias', dica: 'quando o insert tem mais de uma' },
  { id: 'movimento', nome: 'Movimento' },
  { id: 'saida', nome: 'Saída' },
]

export const OPCOES: Record<Categoria, Record<Formato, string[]>> = {
  layout: { vertical: ['tela_cheia', 'card', 'janela_3d', 'inclinado', 'destaque'], dividida: ['metade', 'card_metade', 'janela_3d_metade', 'mesclada'] },
  entrada: dobro(['sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado']),
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
  subir: 'Deslizar para cima',
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
  verde_claro: 'Verde claro',
  papel: 'Papel',
  nevoa: 'Névoa azul',
  chuva: 'Chuva',
  gradiente: 'Gradiente escuro',
}

export const ESTILO: Record<Formato, Enriquecimento> = {
  vertical: { layout: 'card', entrada: 'surgir', entre: 'sequencia_corte', movimento: 'zoom_lento', saida: 'corte' },
  dividida: { layout: 'metade', entrada: 'surgir', entre: 'sequencia_corte', movimento: 'zoom_lento', saida: 'corte' },
}

/** O enriquecimento valendo num insert: o estilo do formato com o que o criador mudou por cima. */
export const enriquecimentoDe = (x: { formato: Formato; enriquecimento?: Partial<Record<string, unknown>> }): Enriquecimento => {
  const e = { ...ESTILO[x.formato], ...((x.enriquecimento ?? {}) as Partial<Enriquecimento>) }
  // opções que saíram (ex.: a entrada "mola") voltam ao estilo
  for (const k of Object.keys(OPCOES) as Categoria[]) if (!OPCOES[k][x.formato].includes(e[k])) e[k] = ESTILO[x.formato][k]
  return e
}

/** O selinho da timeline: "Card · Surgir" (+ como combina, se há mais de uma mídia). */
export const resumo = (e: Enriquecimento, nMidias: number) =>
  [NOMES[e.layout], NOMES[e.entrada], nMidias > 1 ? NOMES[e.entre] : null].filter(Boolean).join(' · ')
