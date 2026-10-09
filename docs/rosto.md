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
  `dados/modelos/` (fora do git, como o do recorte do ator). Os quadros saem do proxy pelo ffmpeg (`fps=6`, já com a rotação),
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
- Para as outras áreas: `rosto.medir(video)` (a P1 usa no original reduzido). A mediana de cx, cy, w, h num trecho
  (as medidas de verdade, senão as preenchidas, senão a amostra mais próxima) é calculada no navegador
  (`ator/ator.ts` `useRosto`), que já tem a sequência para levar o tempo da saída ao do bruto; o `rosto_mediano` do
  backend, que a P5 acabou não usando, saiu na limpeza de out/2026.
- 💡 Na P1 (out/2026): `_quadros` reduz o vídeo para o lado maior de até 1280 px antes de passar ao detector (as medidas
  saem em fração do quadro; um 4K não passa ~25 MB por quadro pelo cano). A medida do original 16:9, que guia o
  enquadramento, fica em `midia/rosto/original.json` (não é apagada num Reenquadrar; a do proxy, `<bruto>.json`, é).
  Num Reenquadrar, uma medida que estava rodando sobre o vídeo antigo é descartada quando termina (a versão do 9:16
  mudou), e sem proxy registrado a medida não começa ([preprocessamento.md](preprocessamento.md)).
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
volta à regra. Fica no pedido do insert (`enriquecimento.ator = { dx, dy, zoom }`). *(Feito de outro jeito na P5: o
arraste e o zoom ficaram nas alças sobre o próprio vídeo, como o card do comentário, e não no card do insert — ver "Como
ficou".)*

💡 ~~Prévia: o estilo do ator na área (`estiloDoAtor`) ganha a escala e o deslocamento do plano. Exportação: o filtro do
ator (`exportacao._ator`) aplica, em cada trecho dividido, a escala e a posição dele (expressões por tempo do ffmpeg),
no lugar do "descer metade da fração" de hoje. A pessoa recortada acompanha.~~ Substituído pela geometria única de "Como
ficou" (`estiloDoAtor` saiu; a exportação ganhou `_ator_na_geometria`).

⏳ Planos de ator em tela cheia (Full ator) continuam como foram gravados.

## Como ficou (P5, out/2026)

💡 **Uma geometria só** (`frontend/src/editor/ator.ts`): o quadro do ator (do tamanho do vídeo) com o canto de cima à
esquerda em (`tx`, `ty`) e a escala `s`, em frações do quadro. A prévia aplica como CSS (`translate` + `scale`, e o
`clip-path` da janela ou dos cantos); a página de render manda a geometria de cada trecho junto da divisão
(`__render.trechos[].divisao.ator`) e `exportacao._ator_na_geometria` só aplica os números (sem geometria, o ffmpeg faz
como antes: os comandos congelados não mudam).

💡 **Tela dividida — o enquadramento pelo rosto**: o rosto típico do insert (a mediana das medidas de `rosto.py` no
trecho, lida no navegador de `midia/rosto/<bruto>.json`); o centro do rosto no meio da largura, os olhos (15% da altura
da caixa do rosto acima do centro dela) a 40% da altura da área de baixo, o topo da cabeça (com o cabelo) a pelo menos
6% da borda da área, o rosto com ~30% da altura da área — ampliando até 1,6× quando ajuda, sempre cobrindo a área inteira
(sem bordas pretas). Sem rosto medido, como antes (o ator desce metade do insert). **Ajuste manual**: a alça "Ator" no
vídeo (etapa Inserts) arrasta o enquadramento dentro da área e a alça do canto dá zoom (`enriquecimento.ator = {dx, dy,
zoom}`); "Automático" no painel volta à regra. O zoom é um fator sobre o automático **para mais ou para menos** (de 1/1,6
a 1,6): num plano aberto, em que o automático já amplia, dá para voltar até o "cobrir a área" (a escala nunca fica
abaixo de 1). 💡 O ajuste é guardado **como vale na tela**: o zoom e o deslocamento que sobram depois dos limites
(`ajusteNaFolga`), para um arraste além da borda (ou para os lados sem zoom, quando não há folga) não acumular um
deslocamento invisível que faria o ator pular depois de um zoom ou parar de andar na volta.

✅ **No "ator embaixo", três modos por insert** (pedido de Rodrigo, out/2026), abaixo da caixa "Ator embaixo, cropado
numa janela": **Janela** (a de antes: o ator a 55%, recortado de 49% da altura dele para baixo, cantos redondos, a cabeça
saindo por cima pela máscara do recorte do ator), **Recortado** (só a pessoa, sem o cenário: a máscara do recorte do
ator, a 62%, apoiada embaixo) e **Canto** (o ator inteiro a 34%, no canto de baixo à direita, cantos redondos). Como o
card do comentário, o ator é **selecionado, arrastado e redimensionado com o cursor no vídeo** (`enriquecimento.ator =
{modo, x, y, escala}`: o centro e o tamanho); "Posição automática" volta à de fábrica. Na janela e no recortado
apoiados embaixo (a posição de fábrica, ou movidos até a borda de baixo), mudar o tamanho os mantém apoiados — crescem
para cima e não passam da borda (a janela não perde os cantos redondos de baixo). Sem posição escolhida, a janela e
o recortado põem o rosto no meio da largura. O recortado sem o recorte do ator pronto sai como o ator inteiro no lugar
(com cantos redondos). Na exportação, cada trecho por cima é um pedaço recortado do vídeo do ator (só aqueles quadros
são escalados), com a máscara de cantos redondos e, na janela e no recortado, a pessoa pela máscara. 💡 Cada pedaço
começa com quadros transparentes até o instante dele (`tpad`) e a pessoa corta o ator e a máscara no trecho antes de
juntá-los: sem isso o ffmpeg guardava na memória todos os quadros do ator até o insert (gigabytes num insert tardio;
[exportacao.md](exportacao.md)).

✅ **Sugestão da IA** (pedido de Rodrigo): no card do insert, a fala e "O que acontece no insert" ficam num toggle
"Sugestão da IA ▸", fechado por padrão (lembrado aberto neste navegador), para as mídias ficarem à vista.

💡 **A legenda e o card do comentário desviam do ator pela geometria** (no modo e na posição em que ele estiver; a
altura não depende do rosto, então a prévia e a página de render dão o mesmo): o card do comentário sozinho fica acima
do alto da cabeça (`ator.topoDoAtor`: na janela e no recortado, ~10% abaixo do topo do quadro do ator encolhido; no
canto, o topo da caixa); a legenda fica na altura do Full ator dentro do ator encolhido (na janela e no recortado) ou
logo acima da caixa (no canto), e continua desviando do card. Um card arrastado à mão fica onde foi posto.
💡 **A ordem do ator e do card** é a mesma na prévia e no MP4: o ator por cima do insert (a janela, o canto, a pessoa)
fica **por cima do card do comentário**, porque na exportação o card é fotografado junto com a camada dos inserts e o
ator é posto depois. Na prévia, o palco (`EfeitoNoPalco`) isola o que está dentro (`isolation: isolate`), para a
legenda, o brilho e a luz das transições ficarem por cima de tudo, como no MP4.
💡 **A página de render espera só a leitura do rosto**: `useRosto` devolve `undefined` enquanto a medida pronta está
sendo lida, e `null` se não há medida (o vídeo sem rosto nenhum, ou o arquivo que falta ou não carrega) — aí segue com o
enquadramento de antes, em vez de nunca se dizer pronta (a exportação morria no tempo de espera).
💡 **Bruto horizontal** (projeto de antes do enquadramento): a medida é do proxy 16:9 e a saída é o recorte 9:16 em
`enquadramento.x`; `useRosto` leva o centro e a largura do rosto para esse recorte (`cx' = (cx − (1 − r)·x) / r`,
`w' = w / r`, com `r` a largura do recorte em fração do quadro deitado).
💡 **Motions de tela dividida** (`tela_dividida_motion`): o ator embaixo do motion é enquadrado pelo rosto, só no
automático — não há alça nem ajuste guardado (o plano não tem pedido de insert onde guardar; caberia em
`motions[plano].ator` se fizer falta).
💡 **A Simulação** da página Presets usa a mesma geometria, na posição de fábrica (a janela, sem modos e sem rosto: o
vídeo de amostra não tem medida).
⏳ Planos curtos seguidos do mesmo tipo ainda são enquadrados cada um pelo seu rosto (a regra pede o mesmo
enquadramento); como o rosto típico muda pouco entre planos vizinhos, a diferença é pequena.
