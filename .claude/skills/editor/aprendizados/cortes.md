# Aprendizados · Cortes

O que já foi aprendido nesta área, vídeo a vídeo (como gravar: `etapas/14-concluir.md`). Leia antes de trabalhar nela
e não repita estes erros. **[gosto]** = preferência confirmada pelo criador · **[defeito]** = erro técnico.

## Do criador

- **[gosto] Corte colado na fala.** Cada trecho começa no primeiro quadro em que o ator começa a falar e termina logo
  depois da última sílaba, com no máximo ~1 quadro de folga (0,04 s). O ar antes e depois da fala mostra o ator se
  preparando para a tomada ou relaxando depois dela (olhar para baixo, ajeitar a postura): no vídeo, parece erro. _mvi-0717 · 2026-10-12_
- **[gosto] Respiro só entre blocos ligados.** Entre duas frases da mesma tomada, que continuam o raciocínio sem erro,
  pode ficar uma pausa natural de até ~0,5 s: é o respiro do ator, e cortá-lo atropela a fala. Pausa maior que ~1 s
  dentro de um trecho sai sempre: o Reels não aguenta silêncio. _mvi-0717 · 2026-10-12_
- **[gosto] Pausa no meio da frase sai.** Pausa no meio da mesma frase acima de ~0,6 s parece erro e sai
  (`cortes.parametros.pausa_max` 0,6). Entre frases ligadas, o respiro natural de até ~0,5 s continua. _mvi-0718 · 2026-10-13_

## Técnicos (do editor)

- **[técnica] Cortar olhando a imagem, não só o som.** Depois de aplicar os cortes, olhe os 2–3 quadros de cada lado
  de toda emenda: não pode sobrar um quadro perdido do ator em outra pose nem um quadro da tomada anterior. Se o som
  está certo e a imagem não, ajuste a borda do trecho à mão (no `timeline.V1`, guardando o valor antigo em `auto`). _mvi-0717 · 2026-10-12_
- **[defeito]** Borda "fora de pausa" (fala colada na palavra removida): o fim da palavra no ElevenLabs costuma vir
  ~0,1–0,2 s tarde e o começo da palavra cortada vaza ("o 'm' de 'mas'"). Ajuste a borda à mão no `timeline.V1`
  (guarde o valor da IA em `auto`). _melhor-ia-para-design·v1 ✂2 · 2026-10-10 (o criador fez o mesmo ajuste no 18)_
- O ElevenLabs acerta palavras repetidas ("gastando gastando") que o Whisper fundia; por isso é o motor. _do 18_
- Num vídeo de 2 min, a seleção típica remove ~35–45% do bruto (2:02 → 1:04 no vídeo de teste). _do 18_
