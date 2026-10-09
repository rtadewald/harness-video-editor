/** O que cada tela ainda em construção vai ter (o resumo do doc da área, SPEC §15). */
export type Resumo = { fase: string; titulo: string; frase: string; itens: string[]; doc: string }

export const RESUMOS = {
  legenda: {
    fase: 'P4',
    titulo: 'Legenda',
    frase: 'Legendas geradas da fala já cortada, no estilo da casa.',
    itens: [
      'O estilo medido nas referências: posição por tipo de plano, fonte, tamanho, ritmo e destaques.',
      'Editar o texto de cada bloco (corrigir, juntar, separar), presos às palavras; a legenda desvia dos inserts.',
      'Na exportação, desenhada por cima de tudo, nítida em 4K.',
    ],
    doc: 'docs/legenda.md',
  },
} satisfies Record<string, Resumo>
