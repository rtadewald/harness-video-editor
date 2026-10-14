# Aprendizados · Render e autorrevisão

O que já foi aprendido nesta área, vídeo a vídeo (como gravar: `etapas/14-concluir.md`). Leia antes de trabalhar nela
e não repita estes erros. **[gosto]** = preferência confirmada pelo criador · **[defeito]** = erro técnico.

## Do criador

_Nenhum ainda._

## Técnicos (do editor)

- **[técnica] Defeito de render não chega ao criador.** Toda versão passa pelos detectores antes da entrega: quadro
  solto do ator e quadro repetido nas emendas. Se algum acusar, corrija antes de entregar. _mvi-0717 · 2026-10-12_
- **[técnica] Conferir a correção no vídeo inteiro.** Ao corrigir um defeito de render, confira o vídeo todo, não só
  o ponto apontado: o mesmo defeito costuma estar em outras trocas de plano, e a correção pode criar outro. _mvi-0717 · 2026-10-12_
- **[defeito] Quadro repetido na emenda.** O bruto roda a 23,976 quadros/s e o vídeo final a 24: cada trecho precisa
  ocupar exatamente os quadros do vídeo final que lhe cabem — corrigido em `ferramentas/montagem/exportacao.py`. _mvi-0717 · 2026-10-12_
- **[defeito] Quadro repetido dentro de um insert de vídeo.** Quando o instante buscado caía na fronteira entre dois
  quadros da mídia, o navegador às vezes mostrava o anterior: um quadro repetido seguido de um pulado, e o vídeo
  parecia ter fps baixo. Corrigido em `render/src/desenho.ts`: a busca vai ao meio do quadro e espera ele aparecer
  antes da foto. _mvi-0718 · 2026-10-13_
- **[técnica] Quadro repetido dentro do plano.** Antes de entregar, procure quadros repetidos também dentro de cada
  plano, não só nas emendas: um insert com quadros iguais a intervalos regulares parece travado ou lento, mesmo com o
  original liso. _mvi-0718 · 2026-10-13_
- O Gemini acerta problemas de corte e de legenda sobre conteúdo, e erra cor de legenda (diz "preta" para a branca com
  sombra): confira na folha de contato antes de mexer. _1º teste · 2026-10-10_
- Nunca rode o render (ou algo que use multiprocessing) por `python -` (stdin): os processos-filho entram em laço e a
  máquina trava. Use um arquivo com `if __name__ == '__main__'`. _1º teste_
