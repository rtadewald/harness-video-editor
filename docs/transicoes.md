# Transições entre planos

Como o vídeo passa de um plano para o outro (SPEC §8.8): em cada corte entre planos da direção, um efeito (ou o corte
seco) e, se houver, o som dele. Modeladas dos nossos vídeos, como os presets de enriquecimento.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## O que é uma transição

✅ Um **tipo de transição é o par de grupos** (decisão de Rodrigo, out/2026, no lugar do par exato de categorias): o
grupo do plano que sai e o do que entra. São 3 grupos: **Full ator** (Full ator, com lettering, com zoom), **Tela
dividida** (com insert ou motion, e o comentário + insert + ator) e **Tela cheia** (insert ou motion) — 9 pares, cada um
com a sua ordem (`familia:ator>dividida` em `ordem.json`). Sem ordem no grupo vale a do par exato antiga, se houver; na
falta, o corte seco.

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
- **Desfoque:** o quadro desfoca até o corte e o novo plano entra desfocando para nítido. *Na P2 entrou junto do zoom
  (o "Zoom com desfoque"): nas referências, o desfoque sozinho num corte era a entrada do próprio insert.*
- ⏳ **Deslize (whip):** o quadro sai deslizando com rastro de movimento e o novo entra do outro lado. *Não recriado na
  P2: a medida acusou deslocamento em só 4 dos 294 cortes, sempre misturado com zoom ou brilho; o motor tem hoje
  `seco · luz · brilho · zoom` (`transicoes.TIPOS`).*
- **Som:** um som da biblioteca, com intensidade e onde o golpe cai em relação ao corte.

💡 Uma transição é um JSON em `transicoes/<id>.json` (dados, fora do git, como `presets/`): nome, os pares em que vale,
os efeitos com tempos e curvas, o som, de onde veio (referência e instante) e se está aprovada.

## Onde se escolhe

✅ **Página Transições** (na barra de cima, ao lado de Presets): por par, a referência e a recriação lado a lado, aprovar,
e **2 favoritas por par em cima** e **"Outras transições"** embaixo (como os recomendados dos presets).

✅ **No vídeo** (decisão de Rodrigo, out/2026): cada corte entre planos do projeto recebe **sozinho a 1ª favorita do seu
par**, com o som. A **etapa Transições** (separada da de Áudio) mostra a linha do tempo com cada corte marcado; clicar num
corte abre as opções (as 2 favoritas, depois as outras, e "Corte seco"), com ▶ para ver o corte tocando.

💡 Na página Transições, o cartão do **Corte seco** (que não tem cortes próprios) mostra um corte seco sem som do par;
sem um, um corte seco do par mesmo com som (a referência toca muda, a menos que se escolha o som dela); sem nenhum seco
no par, um seco sem som de qualquer par.

💡 Dados no projeto: `transicoes = { <id do plano que entra>: { id: <id da transição> | 'seco', par: 'de>para' } }` (só
as trocadas à mão; o resto segue o padrão do par). Os ids dos planos são de posição (`p5` é o 5º plano da direção): com
outra direção, `p5` pode ser outro corte, por isso a escolha guarda o **par do corte** em que foi feita e só vale
enquanto o corte com aquele id for do mesmo par (`cortesDoVideo`); as antigas, só com o id, valem em qualquer par.
**Gerar a direção do zero** apaga as escolhas (o aviso já diz que os ajustes vão embora); pedir uma correção (v2, v3…)
as mantém. Os motions têm o mesmo problema de ids de posição (⏳, de antes da P2).

## Prévia e exportação

💡 Uma transição age sobre o **quadro inteiro já montado** (o ator, os inserts, os motions, a legenda fica por cima de
tudo): por isso é um efeito "depois da montagem".
- **Prévia:** o palco do player (o contêiner com o ator e as camadas) recebe a transformação (escala, deslocamento,
  desfoque) nos instantes da transição, e um véu por cima faz o brilho. Os sons tocam pelo mesmo tocador dos presets.
- **Exportação:** depois de sobrepor as camadas, o ffmpeg aplica, só nos trechos das transições, a escala/recorte
  (zoom de impacto), o `gblur` (desfoque) e um véu de cor com opacidade pela curva (brilho), tudo por expressões de
  tempo. Os sons entram na mistura (SPEC §13), na trilha **Transições** do mixer de áudio.

⏳ Uma transição que muda o próprio corte (por exemplo, sobrepor os dois planos por alguns quadros) pede quadros dos dois
lados ao mesmo tempo; fica para depois, se as referências tiverem.

💡 As **entradas e saídas dos inserts sem preset** (que antes também se chamavam "transições") passaram a se chamar
**entradas** na F0 (out/2026; falta a aprovação de Rodrigo): `entradas.py`, `editor/entradas.ts`, rotas `/api/entradas…`
e a chave `entradas` nas Configurações (a antiga `transicoes` passa para `entradas` quando o servidor sobe,
`entradas.migrar`, antes de esta área gravar qualquer coisa ali). O nome `transicoes` fica só para as transições entre
planos.

## Como ficou (P2, out/2026)

💡 **O que as referências mostraram** (`ferramentas/transicoes_analisar.py` → `transicoes/pares.json`; 294 cortes em 30
pares, sem a referência duplicada): cerca de 68% dos cortes são secos; os sons de corte caem sobre cortes secos (o Click
Classic no corte, ~8 dB abaixo da voz: Médio; a Instant Camera ao entrar num insert de tela cheia e o Riser 07 terminando
no corte para o ator, ~15–20 dB abaixo: Baixo). O "desfoque" que a medida acusa nos cortes para um insert quase sempre é
a **entrada do próprio insert** (o card surgindo desfocado), não uma transição — conferido nas tiras de quadros. Os
efeitos visuais de verdade são três, conferidos quadro a quadro:
- **Luz colorida** (48-image-to-html-manychat em 6,9 s e 55,2 s): sobe de −0,21 s, quase branca no corte, some até
  +0,15 s. Recriada em `ferramentas/transicoes_efeitos.py` → `backend/transicoes_efeitos/luz.webm` (0,433 s, 540×960 a
  30 fps, VP9 com transparência, no git; no MP4 é ampliada para o tamanho do vídeo — 4× no 4K —, o que basta para uma
  luz difusa); a transição começa 0,22 s antes do corte.
- **Zoom com desfoque** (a mesma referência em 2,0 s e 13,63 s): 0,18 s antes, 0,25 s depois; escala até 1,22 e `gblur`
  (σ = maior lado / 120) pela mesma curva.
- **Brilho branco** (cursor-free-v2 em 4,43 s, o corte medido pela diferença entre quadros; a direção marcava 4,5 s):
  sobe 0,22 s até o corte e cai em 0,1 s; o branco chega a 85% pela força.

💡 **A biblioteca** (`ferramentas/transicoes_semear.py`): Corte seco · Corte com clique · Corte com câmera · Subida até o
corte · Luz colorida · Zoom com desfoque · Brilho branco. As favoritas: a 1ª é a mais comum no par (quase sempre o corte
seco) e a 2ª, a mais comum com efeito ou som; sem nenhuma no par, a reserva do grupo de destino (Full ator: Subida até o
corte; Tela cheia: Corte com câmera; Tela dividida: Corte com clique). Cada corte das referências conta para a transição com efeito
de que ele é fonte (a referência e o instante, com 0,2 s de tolerância: o corte medido quadro a quadro cai alguns
quadros antes do da análise — o brilho em 4,43 s, o corte em 4,54 s), senão para a do som achado nele, senão para o
corte seco. 💡 O mesmo vale para as **fontes** (o corte que a página mostra como referência): um corte que é fonte de
uma transição com efeito não entra nas fontes de uma de som (rodada 2 da QA: no par Full ator → Motion tela cheia, o
"Corte com clique" mostrava o corte da Luz colorida, manychat 6,87 s, e a recriação saía tingida da luz). A página já
pula essas fontes (`fonteDe` em `paginas/Transicoes.tsx`); os dados gravados em `transicoes/` ainda as listam (o
`corte-clique` com o manychat 6,87 s e o `subida-ao-corte` com o cursor-free-v2 4,54 s, o corte do Brilho branco) até o
semear ser rodado de novo — decisão de Rodrigo. **Refazível sem perder a curadoria**: de quem já existe, guarda o nome, o som (e a intensidade) e o
"aprovado", e só grava a ordem dos pares que ainda não têm a sua em `ordem.json`; `--refazer` volta tudo ao que a
análise diz. Nada sai aprovado: "aprovada" é a marca da revisão de Rodrigo (não muda o que entra no vídeo).

⏳ **Decisão para Rodrigo: o padrão de hoje deixa o vídeo sem transições.** Pela regra acima, a 1ª favorita de todos os
pares (menos Comentário → Full ator) é o Corte seco, e cada corte recebe sozinho a 1ª favorita: sem trocar à mão, o MP4
sai sem efeito nem som de transição, igual a antes da P2 (a etapa avisa isso na tela). É fiel às referências — dos 294
cortes, ~10% têm algum som no corte e só 5 um efeito visual de verdade (os conferidos quadro a quadro) —, mas pode não ser o que se espera. Caminhos: (a)
manter (o criador escolhe à mão os poucos cortes com efeito, como nas referências); (b) a 1ª favorita passar a ser a
mais comum **com efeito ou som** (todo corte ganha um som: bem acima das referências); (c) um meio-termo, por exemplo o
som só nos cortes para um insert de tela cheia ou para um motion. Para mudar sem código: a ★ e "Tornar o padrão do
par" na página Transições.

💡 **A curva** é a mesma na prévia e no MP4: smoothstep subindo em `antes` s até o corte e descendo em `depois` s; sem
`antes`, nada antes do corte (`transicoes._janela` e `transicoes.envelope` ↔ `transicoes.ts envelope`). Prévia:
`EfeitoNoPalco` envolve o palco do player (escala e `blur(desfoque·altura/120)`, dividido pela escala porque o CSS
desfoca antes de ampliar), o véu branco e o vídeo da luz por cima; os sons tocam pelo mesmo tocador dos presets (grupo
`transicoes`), com o fator de som do projeto (o `FatorSom` vem do Editor, para todas as etapas, como no MP4). MP4:
`_transicoes` em `_pos_montagem`, e **o custo é o das janelas, não o da duração do vídeo** (antes, o `gblur`, o
`lutrgb` e o `format=gbrp` rodavam em todos os quadros: em 4K, um brilho deixava a passada final até 15× mais lenta, e
o vídeo inteiro passava por yuv→rgb→yuv): o quadro montado vira `yuv420p` bt709 antes das transições (o formato de saída; só bt709: aceitar também `unknown`/bt601 deixava a negociação escolher outra matriz quando a luz entrava, e com o look ligado o vídeo inteiro saía ~3 a 7 níveis mais escuro em R e B — achado na conferência da revisão; o `luz.webm`, sem marcação de cor, entra marcado bt709 —; sem isso o ffmpeg negociava `yuva420p` na saída das sobreposições e o `scale` do zoom convertia o vídeo inteiro, refazendo o conversor a cada quadro); fora das janelas o quadro sai **idêntico** ao de uma exportação sem transições (desvio de cor 0,0 por canal, medido em vídeo sintético e no bruto real, com e sem look, para os três efeitos; `test_luz_com_look_nao_muda_a_cor_fora_da_janela`); o zoom é um `scale` com `eval=frame` + recorte central (com o tamanho igual,
fora da janela, o `scale` só repassa o quadro) e um `gblur` que só liga na janela, com o σ mudando quadro a quadro por
`sendcmd` (σ = curva·maior lado/120: o desfoque cresce com a curva, como o `blur()` da prévia; antes era um desfoque de
σ fixo misturado por `blend`, que nos quadros do meio dava imagem dupla); o brilho é uma fonte `color` branca do tamanho
da janela, com a transparência pela curva no relógio dela, começando num quadro inteiro, sobreposta por `overlay` (o
quadro fora da janela passa intocado); a luz por `overlay`. Medido em 4K (testsrc2 2160×3840, 20 s, HEVC pelo chip):
sem transição 5,2 s; com um zoom, um brilho ou uma luz, os mesmos 5,2–5,3 s (antes: 19,4 s com o zoom e 14,2 s com o
brilho); no vídeo de teste (1:01,7 em 4K), brilho + zoom + luz somam ~4,5% de CPU à passada ([exportacao.md](exportacao.md)). Os sons entram na mistura com os de apoio. A página de
render manda os cortes com efeito em `__render.transicoes` e os sons em `__render.sons`.

💡 **A regra do padrão do par** é uma só, a do front (`padraoDoPar`, que decide o vídeo e a exportação):
`transicoes.padrao_do_par` (back) é a mesma — a ordem do grupo (senão a do par exato antiga); a 1ª favorita dela; uma
ordem sem favorita fica **seca**, e sem nada também (`corte-seco`).

💡 **A página Transições**: à esquerda "Todas as transições" e os grupos de origem (Full ator, Tela dividida, Tela cheia),
cada um abrindo para os destinos com o nº de cortes nas referências (os pares de categorias somados) e o padrão; à direita, as
favoritas do par (a ★ liga/desliga; a 1ª é o "padrão do par", e "Tornar o padrão do par" a sobe) e as outras, cada uma
com **a referência e a recriação lado a lado** no mesmo relógio (a recriação usa o quadro de antes e o de depois do
efeito da própria referência, com o efeito e o som do motor), o som (qual e a intensidade), aprovar e "Som da referência
/ da recriação"; embaixo, os cortes do par nas referências, cada um tocando com o som. O modal da transição (clicar no
nome ou na engrenagem) toca a referência e a recriação cada uma sozinha, com o próprio som, e mostra os cortes das
referências onde ela aparece.

💡 **A etapa Transições** segue o arranjo da etapa Inserts (pedido de Rodrigo, out/2026): à esquerda o corte selecionado
— **sempre o próximo a partir do cursor** (parado enquanto o vídeo toca; clicar num corte leva o cursor até ele) — com
as favoritas do par e as outras, cada uma com a **demonstração**, 3 por linha numa coluna larga (820 px, arrastável; a referência e a recriação lado a lado, como na
página Transições; o nome embaixo escolhe), ▶ Ver o corte (atalho **R**) e voltar à favorita; à direita do vídeo, o card **Todos os cortes** (pedido de Rodrigo, out/2026; `sortearTransicoes`): **Variar favoritas** (cada corte com uma das 2 favoritas do par, meio a meio), **Sortear todas** (50% uma favorita sorteada entre elas, 50% uma das outras sorteada entre elas; sem favorita, uma das outras) e **Voltar às favoritas** (tira as escolhas à mão); cada clique sorteia de novo e grava tudo num PUT só (a 1ª favorita sorteada fica como padrão do par, não à mão); no meio a prévia, e embaixo a **linha do tempo**
(`editor/LinhaBase.tsx`, a mesma base da dos Inserts) com as trilhas **Planos**, **Transições** (a janela do efeito em
volta de cada corte; o ponto vermelho marca a escolhida à mão) e **Sons**. ▶ Ver o corte toca de 1,5 s antes a 1,5 s
depois e para, pelo mesmo trecho do player da etapa Inserts (`tocarTrecho`; pausar o esquece). 💡 Rodada 2 da QA: um
som ainda não começado nunca é pedido ao áudio com o ponto antes do início do arquivo (ele entra na hora certa, do
começo), só um som que começou entra na lista do que para ao pausar, e parar um som que já acabou não derruba os outros;
antes, "Ver o corte" num corte com riser (Subida até o corte, Brilho branco) ou o 2º "Ver" num corte com clique deixava a
página em branco ao fim do trecho. E qualquer erro inesperado numa tela agora mostra um aviso com "Recarregar"
(`components/FalhaNaTela.tsx`), não a página em branco.

💡 **A prévia mostra o quadro montado**: a composição da etapa Inserts (o insert no lugar com a entrada e o fundo, o ator
descendo ou na janela, a pessoa recortada, o card do comentário, o motion) saiu para `editor/MontagemNoPalco.tsx` e é
a `sobreposicao` do Preview nas duas etapas (na Transições, `MontagemDoProjeto` lê os inserts, o banco e os motions; o
card do comentário só arrasta na Inserts). Assim "Ver o corte" mostra a troca de plano de verdade.

💡 **As transições só aparecem onde o quadro está montado**: o efeito e o som delas valem na prévia das etapas Inserts e
Transições (`Preview transicoes`); no Pré-processamento e na Direção o ator fica limpo (sem flashes ao avaliar o look,
sem cliques ao ouvir uma emenda).

💡 **Página Transições, revisão de out/2026** (pedido de Rodrigo): uma vista **Todas as transições** no topo da lista (a
abertura da página), com os cards das 7 transições juntos, cada uma com um corte das referências de onde veio; e o card
no padrão dos cards de preset — a referência e a recriação de borda a borda (sem moldura), os rótulos embaixo sobre um
degradê, o selo Aprovada/A revisar e "Padrão do par" no canto, o play no meio; embaixo, o nome com o tipo de efeito, os
ícones de favorita do par e de aprovar (a descrição fica na dica do nome) e o som (a intensidade num grupo compacto, que cabe no
card mais estreito da grade — antes, a linha do som passava da borda do card).
