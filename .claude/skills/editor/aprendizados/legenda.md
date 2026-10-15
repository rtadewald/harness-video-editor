# Aprendizados · Legenda

O que já foi aprendido nesta área, vídeo a vídeo (como gravar: `etapas/14-concluir.md`). Leia antes de trabalhar nela
e não repita estes erros. **[gosto]** = preferência confirmada pelo criador · **[defeito]** = erro técnico.

## Do criador

_Nenhum ainda._

## Técnicos (do editor)

- **[defeito] A legenda nunca cobre o conteúdo.** Num insert de tela cheia com mídia horizontal, ela vai abaixo da
  mídia, não no meio da tela — corrigido em `render/src/legenda.ts`. Em outros casos em que ainda cubra algo
  importante, vire nota para o criador. _1º teste; mvi-0717 · 2026-10-12_
- O transcritor escreve "Cloud" para "Claude": corrija a grafia na legenda (`ajustes`). _1º teste_
- **[técnica] Motion com texto no meio.** Num plano de motion de tela cheia com texto no centro (Lettering), a legenda
  cai em cima: esconda a legenda das palavras desse plano (`legenda-corrigir <palavra> ""`), como num lettering, e
  confira com `A quadros`. _3-niveis-de-sites-com-ia-claude · 2026-10-14_
