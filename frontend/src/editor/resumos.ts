/** O que cada tela ainda em construção vai ter (o resumo do doc da área, SPEC §15). */
export type Resumo = { fase: string; titulo: string; frase: string; itens: string[]; doc: string }

export const RESUMOS = {
  audio: {
    fase: 'P3',
    titulo: 'Áudio',
    frase: 'A voz do ator, a faixa de fundo e o mixer das trilhas.',
    itens: [
      'Limpeza da voz (Sem · Leve · Média · Forte, ou o isolamento máximo), timbre (Natural · Quente · Clara) e compressor.',
      'Uma faixa de fundo gerada por IA, parecida com as das referências, que abaixa um pouco quando o ator fala.',
      'Mixer em dB: Ator, Sons dos presets, Transições e Fundo; o volume final em −14 LUFS.',
    ],
    doc: 'docs/audio.md',
  },
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
