/** Enriquecimento dos inserts (mock; SPEC §8.3): como cada insert aparece. Espelha `inserts.OPCOES_ENRIQUECIMENTO` e
 *  `inserts.ESTILO` do backend; os nomes ficam aqui. */
type Categoria = 'layout' | 'entrada' | 'entrada_2' | 'saida' | 'saida_2' | 'entre' | 'movimento'
export type Curva = [number, number, number, number]
/** As categorias e, com 2 mídias, onde a 2ª começa (`corte`, fração do insert). A curva, a duração e os detalhes de cada
 *  entrada e saída são globais, por tipo (`transicoes.ts`). */
export type Enriquecimento = Record<Categoria, string> & { corte?: number }
/** Qual mídia: 1 (a 1ª, ou a única) ou 2 (a 2ª, num insert com duas). */
export type Qual = 1 | 2

/** Curvas prontas: só três (decisão de Rodrigo, out/2026) — a dele e as duas mais clássicas entre editores e motion
 *  designers: a "expo out" (a entrada mais usada em interface e motion profissional: desacelera natural, sem quicar) e o
 *  Easy Ease do After Effects (o F9: influência de 33% nas duas pontas). */
export const PRESETS_CURVA: { nome: string; curva: Curva }[] = [
  { nome: 'Freia bem devagar', curva: [0, 0.7, 0.3, 0.9] }, // chega rápido e vai freando até o último instante
  { nome: 'Chega rápido e assenta', curva: [0.16, 1, 0.3, 1] }, // expo out
  { nome: 'Easy Ease', curva: [0.33, 0, 0.67, 1] }, // o do After Effects
  { nome: 'Assenta bem suave', curva: [0.22, 1, 0.36, 1] }, // quint out: chega e vai pousando
  { nome: 'Sai e chega suave', curva: [0.65, 0, 0.35, 1] }, // ease-in-out cúbico
  { nome: 'Sedoso', curva: [0.83, 0, 0.17, 1] }, // ease-in-out forte: quase parado nas pontas
]
/** Duas curvas são a mesma (a menos do arredondamento). */
export const iguais = (a: Curva, b: Curva) => a.every((v, i) => Math.abs(v - b[i]) < 0.005)
/** A entrada e a saída de uma mídia. */
export const entradaDe = (e: Enriquecimento, qual: Qual = 1) => (qual === 2 ? e.entrada_2 : e.entrada)
export const saidaDe = (e: Enriquecimento, qual: Qual = 1) => (qual === 2 ? e.saida_2 : e.saida)
/** Onde a 2ª mídia começa, em fração do insert (padrão: no meio). */
export const corteDe = (e: Enriquecimento, dur = Infinity) =>
  // na sequência a 1ª fica pelo menos 0,5 s (o corte 0, "junto com a 1ª", só vale nos layouts em que as duas aparecem juntas)
  e.entre === 'sequencia' ? Math.max(e.corte ?? 0.5, Math.min(0.5 / dur, 0.5)) : (e.corte ?? 0.5)
export type Formato = 'vertical' | 'dividida'


const OPCOES: Record<Categoria, Record<Formato, string[]>> = {
  layout: { vertical: ['tela_cheia', 'card', 'janela_3d', 'inclinado', 'destaque'], dividida: ['metade', 'card_metade', 'janela_3d_metade', 'mesclada'] },
  entrada: dobro(['sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom']),
  entrada_2: dobro(['sem', 'surgir', 'subir', 'voo_3d', 'zoom_borrado', 'seco_zoom']),
  saida: dobro(['corte', 'sumir', 'deslizar', 'voo_3d', 'zoom_borrado']),
  saida_2: dobro(['corte', 'sumir', 'deslizar', 'voo_3d', 'zoom_borrado']),
  // como 2 mídias convivem (decisão de Rodrigo, out/2026); 3 ou mais: em sequência, divididas igualmente
  entre: dobro(['sequencia', 'empilhadas', 'lado_a_lado']),
  movimento: dobro(['parado', 'zoom_lento', 'zoom_ponto', 'rolagem']),
}
function dobro(l: string[]) {
  return { vertical: l, dividida: l }
}

const ESTILO: Record<Formato, Enriquecimento> = {
  vertical: { layout: 'card', entrada: 'surgir', entrada_2: 'surgir', entre: 'sequencia', movimento: 'zoom_lento', saida: 'corte', saida_2: 'corte' },
  dividida: { layout: 'metade', entrada: 'surgir', entrada_2: 'surgir', entre: 'sequencia', movimento: 'zoom_lento', saida: 'corte', saida_2: 'corte' },
}

/** O enriquecimento valendo num insert: o estilo do formato com o que o criador mudou por cima. */
export const enriquecimentoDe = (x: { formato: Formato; enriquecimento?: Partial<Record<string, unknown>> }): Enriquecimento => {
  const e = { ...ESTILO[x.formato], ...((x.enriquecimento ?? {}) as Partial<Enriquecimento>) }
  // opções que saíram (ex.: a entrada "mola") voltam ao estilo
  for (const k of Object.keys(OPCOES) as Categoria[]) if (!OPCOES[k][x.formato].includes(e[k])) e[k] = ESTILO[x.formato][k]
  return e
}

