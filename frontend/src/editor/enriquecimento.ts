/** Enriquecimento dos inserts (mock; SPEC §8.3): como cada insert aparece. Espelha `inserts.OPCOES_ENRIQUECIMENTO` e
 *  `inserts.ESTILO` do backend; os nomes ficam aqui. */
export type Categoria = 'layout' | 'entrada' | 'entrada_2' | 'entre' | 'movimento' | 'saida'
export type Curva = [number, number, number, number]
/** As categorias e os ajustes da entrada (curva e duração; `_2` = os da 2ª mídia) e, com 2 mídias, onde a 2ª começa
 *  (`corte`, fração do insert). */
export type Enriquecimento = Record<Categoria, string> & { curva?: Curva; duracao?: number; curva_2?: Curva; duracao_2?: number; corte?: number }
/** Qual mídia: 1 (a 1ª, ou a única) ou 2 (a 2ª, num insert com duas). */
export type Qual = 1 | 2

/** Curvas prontas: só três (decisão de Rodrigo, out/2026) — a dele e as duas mais clássicas entre editores e motion
 *  designers: a "expo out" (a entrada mais usada em interface e motion profissional: desacelera natural, sem quicar) e o
 *  Easy Ease do After Effects (o F9: influência de 33% nas duas pontas). */
export const PRESETS_CURVA: { nome: string; curva: Curva }[] = [
  { nome: 'Freia bem devagar', curva: [0, 0.7, 0.3, 0.9] }, // chega rápido e vai freando até o último instante
  { nome: 'Chega rápido e assenta', curva: [0.16, 1, 0.3, 1] }, // expo out
  { nome: 'Easy Ease', curva: [0.33, 0, 0.67, 1] }, // o do After Effects
]
/** Duração da entrada (s): slider de 0,5 a 5 s, de 0,25 em 0,25; padrão 1,5 s. */
export const DURACAO = { min: 0.5, max: 5, passo: 0.25, padrao: 1.5 }
export type PadraoCurva = { curva?: Curva; duracao?: number }
/** A curva valendo numa mídia do insert: a dela, senão o padrão do vídeo, senão chega rápido e freia. */
export const curvaDe = (e: Enriquecimento, padrao?: PadraoCurva, qual: Qual = 1): Curva =>
  (qual === 2 ? e.curva_2 : e.curva) ?? padrao?.curva ?? [0.16, 1, 0.3, 1]
/** A duração da entrada (s): a da mídia, senão a do padrão do vídeo, senão 1,5 s. */
export const duracaoDe = (e: Enriquecimento, padrao?: PadraoCurva, qual: Qual = 1) =>
  (qual === 2 ? e.duracao_2 : e.duracao) ?? padrao?.duracao ?? DURACAO.padrao
/** Entradas sem curva própria (o card da curva some): sem animação e a seca com zoom leve, que dura a mídia toda. */
export const SEM_CURVA = ['sem', 'seco_zoom']
/** A entrada de uma mídia. */
export const entradaDe = (e: Enriquecimento, qual: Qual = 1) => (qual === 2 ? e.entrada_2 : e.entrada)
/** Onde a 2ª mídia começa, em fração do insert (padrão: no meio). */
export const corteDe = (e: Enriquecimento, dur = Infinity) =>
  // na sequência a 1ª fica pelo menos 0,5 s (o corte 0, "junto com a 1ª", só vale nos layouts em que as duas aparecem juntas)
  e.entre === 'sequencia' ? Math.max(e.corte ?? 0.5, Math.min(0.5 / dur, 0.5)) : (e.corte ?? 0.5)
/** Os campos de ajuste de uma mídia (a 2ª tem o sufixo `_2`). */
export const campo = (k: 'curva' | 'duracao' | 'entrada', qual: Qual) => (qual === 2 ? `${k}_2` : k)
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
  entrada: dobro(['sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom']),
  entrada_2: dobro(['sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom']),
  // como 2 mídias convivem (decisão de Rodrigo, out/2026); 3 ou mais: em sequência, divididas igualmente
  entre: dobro(['sequencia', 'empilhadas', 'lado_a_lado']),
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
  seco_zoom: 'Seca + zoom leve',
  sequencia: 'Sequência',
  empilhadas: 'Empilhadas',
  lado_a_lado: 'Lado a lado',
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
  vertical: { layout: 'card', entrada: 'surgir', entrada_2: 'surgir', entre: 'sequencia', movimento: 'zoom_lento', saida: 'corte' },
  dividida: { layout: 'metade', entrada: 'surgir', entrada_2: 'surgir', entre: 'sequencia', movimento: 'zoom_lento', saida: 'corte' },
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
