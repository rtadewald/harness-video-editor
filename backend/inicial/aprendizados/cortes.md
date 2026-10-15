# Aprendizados · Cortes

O que já foi aprendido nesta área, vídeo a vídeo (como gravar: `etapas/14-concluir.md`). Leia antes de trabalhar nela
e não repita estes erros. **[gosto]** = preferência confirmada pelo criador · **[defeito]** = erro técnico.

## Do criador

## Técnicos (do editor)

- **[técnica] Cortar olhando a imagem, não só o som.** Depois de aplicar os cortes, olhe os 2–3 quadros de cada lado
  de toda emenda: não pode sobrar um quadro perdido do ator em outra pose nem um quadro da tomada anterior. Se o som
  está certo e a imagem não, ajuste a borda do trecho à mão (no `timeline.V1`, guardando o valor antigo em `auto`). _mvi-0717 · 2026-10-12_
- **[defeito]** Borda "fora de pausa" (fala colada na palavra removida): o fim da palavra no ElevenLabs costuma vir
  ~0,1–0,2 s tarde e o começo da palavra cortada vaza ("o 'm' de 'mas'"). Ajuste a borda à mão no `timeline.V1`
  (guarde o valor da IA em `auto`). _melhor-ia-para-design·v1 ✂2 · 2026-10-10 (o criador fez o mesmo ajuste no 18)_
- O ElevenLabs acerta palavras repetidas ("gastando gastando") que o Whisper fundia; por isso é o motor. _do 18_
- Num vídeo de 2 min, a seleção típica remove ~35–45% do bruto (2:02 → 1:04 no vídeo de teste). _do 18_
