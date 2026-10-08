# Rosto do ator

O rosto do ator ao longo do vídeo, medido uma vez por projeto e usado em dois lugares (SPEC §8.7): o **enquadramento
16:9 → 9:16** ([preprocessamento.md](preprocessamento.md)) e o **enquadramento do ator nas áreas que sobram** quando a
tela se divide (tela dividida, "ator embaixo").

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## A medida

💡 `rosto.py`: o detector de rosto do MediaPipe (BlazeFace, local) roda sobre o proxy a ~6 quadros por segundo e grava,
para cada instante, a caixa do rosto (centro, largura, altura, em fração do quadro) e a confiança, em
`midia/rosto/<bruto>.json`. Roda em segundo plano depois do proxy (como o recorte do ator); os buracos (rosto não achado,
virado) são preenchidos com o vizinho. Num 16:9, roda antes, sobre o original reduzido, e guia o enquadramento.

## O ator nas áreas que sobram

✅ Na **tela dividida** e na janela do **"ator embaixo"**, o rosto fica sempre bem posicionado no espaço que sobra para
o ator, com **um enquadramento estável por plano** (decisão de Rodrigo, out/2026: uma câmera se mexendo dentro da metade
de baixo distrai) e **ajuste manual por plano**.

💡 A regra, por plano (a posição típica do rosto no plano: a mediana das medidas dentro dele):
- **Horizontal:** o centro do rosto no centro da área.
- **Vertical (espaço acima da cabeça):** os olhos a ~40% da altura da área, contando de cima; o topo da cabeça nunca
  encosta na borda de cima (pelo menos ~6% de folga).
- **Tamanho:** o rosto ocupa ~30% da altura da área. O ator pode ser **ampliado** até 1,6× para isso (sempre cobrindo a
  área inteira, sem bordas); nunca diminui abaixo do "cobrir a área".
- Planos curtos seguidos do mesmo tipo usam o mesmo enquadramento (não pula entre eles).

✅ **Ajuste manual:** no card do insert (etapa Inserts), arrastar o ator dentro da área e um controle de zoom; "Automático"
volta à regra. Fica no pedido do insert (`enriquecimento.ator = { dx, dy, zoom }`).

💡 Prévia: o estilo do ator na área (`estiloDoAtor`) ganha a escala e o deslocamento do plano. Exportação: o filtro do
ator (`exportacao._ator`) aplica, em cada trecho dividido, a escala e a posição dele (expressões por tempo do ffmpeg),
no lugar do "descer metade da fração" de hoje. A pessoa recortada acompanha.

⏳ Planos de ator em tela cheia (Full ator) continuam como foram gravados.
