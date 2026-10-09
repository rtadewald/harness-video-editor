/** O que cada tela ainda em construção vai ter (o resumo do doc da área, SPEC §15). */
export type Resumo = { fase: string; titulo: string; frase: string; itens: string[]; doc: string }

export const RESUMOS = {
  enquadramento: {
    fase: 'P1',
    titulo: 'Enquadramento',
    frase: 'Só para vídeos horizontais (16:9): a câmera segue o rosto devagar e gera o bruto 9:16 que o resto do processo usa.',
    itens: [
      'Pequenos movimentos não mexem o quadro; ele só anda quando o ator se desloca de verdade, com aceleração e chegada suaves.',
      'O original 16:9 com o retângulo 9:16 andando sobre ele.',
      'Suavidade (Calma · Normal · Ágil), um deslocamento fixo para os lados e Reenquadrar.',
    ],
    doc: 'docs/preprocessamento.md',
  },
  look: {
    fase: 'P1',
    titulo: 'Look',
    frase: 'LUTs no estilo dos nossos vídeos e a vinheta, só no ator, iguais na prévia e no MP4.',
    itens: [
      'Looks: Natural, Casa (o padrão), Frio / limpo e Sem LUT.',
      'Intensidade do LUT (0 a 100%) e a vinheta: Sem · Leve · Normal · Forte (ligada por padrão).',
      'A prévia muda na hora (WebGL); a exportação aplica o mesmo LUT e a mesma máscara.',
    ],
    doc: 'docs/preprocessamento.md',
  },
  transicoes: {
    fase: 'P2',
    titulo: 'Transições',
    frase: 'Como o vídeo passa de um plano para o outro, com o som.',
    itens: [
      'Cada corte entre planos recebe sozinho a 1ª favorita do seu par (por exemplo, Full ator → Tela dividida).',
      'A linha do tempo com cada corte marcado; clicar num corte abre as 2 favoritas, as outras e o Corte seco, com ▶.',
      'Efeitos modelados das referências: brilho, zoom de impacto, desfoque, deslize… e o som de cada um.',
    ],
    doc: 'docs/transicoes.md',
  },
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
