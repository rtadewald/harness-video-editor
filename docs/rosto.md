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

💡 Feito na F0 (out/2026), em `backend/app/rosto.py`:
- O modelo é o BlazeFace de curta distância (`blaze_face_short_range.tflite`, ~230 KB), baixado na primeira vez para
  `modelos/` (fora do git, como o do recorte do ator). Os quadros saem do proxy pelo ffmpeg (`fps=6`, já com a rotação),
  confiança mínima 0,5; com mais de um rosto, vale o maior.
- O arquivo: `{por_segundo: 6, largura, altura, amostras: [{t, cx, cy, w, h, conf}]}` (t em s do bruto; o resto em fração
  do quadro). Um buraco recebe a caixa da medida mais próxima no tempo (empate: a anterior) com `conf: 0`; sem rosto
  nenhum no vídeo, `amostras` fica vazia. Um vídeo que o ffmpeg não lê inteiro (truncado, corrompido: código de saída
  diferente de 0, ou menos da metade dos quadros que a duração pede) levanta erro em `medir` e o estado vira `erro`,
  para não se passar por "vídeo sem rosto" (que fica `pronto` e não é refeito).
- Estado no projeto: `rosto: {estado: fila|rodando|pronto|erro, progresso, erro, bruto, amostras, achados}`. Pedido pelo
  pipeline logo depois do proxy (como o recorte; a checagem do estado e a marcação `fila` vão juntas, então dois pedidos
  ao mesmo tempo não põem duas medidas na fila); o que estava na fila ou rodando recomeça quando o servidor sobe. Rotas:
  `GET /api/projetos/{id}/rosto` (o estado; `{estado: 'nenhum'}` se nunca rodou) e `POST …/rosto` (mede de novo).
  Projetos criados antes da F0 não têm a medida até alguém pedir (o POST).
- Para as outras áreas: `rosto.medir(video)` (a P1 usa no original reduzido) e `rosto.rosto_mediano(id, ini, fim)` (a P5:
  a mediana de cx, cy, w, h nas amostras de um intervalo do bruto — as medidas de verdade, senão as preenchidas, senão a
  amostra mais próxima; `None` sem medida).
- Medido no vídeo de teste (2:02, proxy 720×1280): ~10 s de trabalho, 732 amostras, rosto achado em todas (confiança
  0,78–0,96); centro mediano em x 0,48 e y 0,39 (centro-alto do quadro), largura mediana 0,53 do quadro.

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
