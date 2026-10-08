# Transições entre planos

Como o vídeo passa de um plano para o outro (SPEC §8.8): em cada corte entre planos da direção, um efeito (ou o corte
seco) e, se houver, o som dele. Modeladas dos nossos vídeos, como os presets de enriquecimento.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## O que é uma transição

✅ Um **tipo de transição é o par exato de categorias** (decisão de Rodrigo, out/2026): a categoria do plano que sai e a
do que entra — por exemplo Full ator → Tela dividida, Insert tela cheia → Full ator. Um par que nunca apareceu nas
referências usa o padrão da família (ator → insert, insert → ator, insert → insert, → motion, motion →) e, na falta,
o corte seco.

💡 Nas 13 referências há **333 cortes entre planos em 30 pares**. Os mais comuns: Tela dividida ↔ Full ator (41 + 41),
Tela dividida ↔ Insert tela cheia (34 + 32), Insert tela cheia ↔ Full ator (30 + 24), Tela dividida → Tela dividida
(20), Insert tela cheia → Insert tela cheia (14), Full ator → Motion (13). Os sons já achados nos cortes: o **Click
Classic 01** exatamente no corte, o **Riser 07** terminando no corte para o ator e o **Instant Camera 01** no corte para um
insert de tela cheia ([inserts.md](inserts.md), sons).

## Como são montadas

✅ **Como os presets** (decisão de Rodrigo, out/2026): o Claude analisa quadro a quadro cada corte das referências, com o
som detectado nele, e recria o efeito à mão; Rodrigo aprova na página **Transições**.

💡 `ferramentas/transicoes_analisar.py`: para cada corte entre planos de cada referência, uma tira de quadros de
−0,4 s a +0,4 s em volta do corte (24 quadros/s) e os sons detectados de −0,8 s a +0,4 s (`sons_detectar.py`). Sai um
relatório por par: quantos cortes, quais parecem secos, quais têm efeito (mudança brusca de brilho, de escala, desfoque,
deslocamento) e quais sons. Com isso o Claude escreve cada transição.

💡 **O motor** (os efeitos que uma transição pode usar, combinados, cada um com duração antes/depois do corte e curva):
- **Corte seco** (nada).
- **Brilho / flash:** um véu branco (ou de luz quente) que sobe até o corte e se dissipa depois.
- **Zoom de impacto:** o quadro inteiro aproxima nos últimos instantes do plano que sai e/ou chega já aproximado e
  assenta.
- **Desfoque:** o quadro desfoca até o corte e o novo plano entra desfocando para nítido.
- **Deslize (whip):** o quadro sai deslizando com rastro de movimento e o novo entra do outro lado.
- **Som:** um som da biblioteca, com intensidade e onde o golpe cai em relação ao corte.

💡 Uma transição é um JSON em `transicoes/<id>.json` (dados, fora do git, como `presets/`): nome, os pares em que vale,
os efeitos com tempos e curvas, o som, de onde veio (referência e instante) e se está aprovada.

## Onde se escolhe

✅ **Página Transições** (na barra de cima, ao lado de Presets): por par, a referência e a recriação lado a lado, aprovar,
e **2 favoritas por par em cima** e **"Outras transições"** embaixo (como os recomendados dos presets).

✅ **No vídeo** (decisão de Rodrigo, out/2026): cada corte entre planos do projeto recebe **sozinho a 1ª favorita do seu
par**, com o som. A **etapa Transições** (separada da de Áudio) mostra a linha do tempo com cada corte marcado; clicar num
corte abre as opções (as 2 favoritas, depois as outras, e "Corte seco"), com ▶ para ver o corte tocando.

💡 Dados no projeto: `transicoes = { <id do plano que entra>: <id da transição> | 'seco' }` (só as trocadas à mão; o
resto segue o padrão do par). Preso aos planos da direção (que se prendem às palavras, SPEC §9).

## Prévia e exportação

💡 Uma transição age sobre o **quadro inteiro já montado** (o ator, os inserts, os motions, a legenda fica por cima de
tudo): por isso é um efeito "depois da montagem".
- **Prévia:** o palco do player (o contêiner com o ator e as camadas) recebe a transformação (escala, deslocamento,
  desfoque) nos instantes da transição, e um véu por cima faz o brilho. Os sons tocam pelo mesmo tocador dos presets.
- **Exportação:** depois de sobrepor as camadas, o ffmpeg aplica, só nos trechos das transições, a escala/recorte
  (zoom de impacto, deslize), o `gblur` (desfoque) e um véu de cor com opacidade pela curva (brilho), tudo por
  expressões de tempo. Os sons entram na mistura (SPEC §13), na trilha **Transições** do mixer de áudio.

⏳ Uma transição que muda o próprio corte (por exemplo, sobrepor os dois planos por alguns quadros) pede quadros dos dois
lados ao mesmo tempo; fica para depois, se as referências tiverem.

💡 O nome "transições" hoje também é usado pelas **entradas e saídas dos inserts sem preset** (`transicoes.py`,
`editor/transicoes.ts`); essas passam a se chamar **entradas** (`entradas.py`) para não confundir.
