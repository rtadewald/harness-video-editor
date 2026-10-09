# Legenda

A etapa **Legenda** (SPEC §8.10): legendas geradas da fala já cortada, no estilo dos nossos vídeos — posição, fonte e
ritmo medidos nas referências.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## O estilo da casa

✅ **Um estilo único, modelado das referências** (decisão de Rodrigo, out/2026). No print de referência: texto branco,
negrito, frase curta, no **centro da tela**, com uma sombra suave para ler sobre qualquer fundo.

💡 A medida (`ferramentas/legenda_analisar.py`): em quadros das referências (4 por segundo), o texto da legenda é lido
(OCR do macOS) com a posição e o tamanho; comparando com as palavras faladas (a transcrição da referência), mede-se:
- **posição** (altura na tela) por categoria de plano (Full ator, tela dividida, insert tela cheia, motion…) — numa tela
  dividida, por exemplo, ela pode ficar na costura entre o insert e o ator;
- **fonte** (família, peso), **tamanho**, cor, contorno e sombra, maiúsculas ou não, pontuação;
- **ritmo**: quantas palavras e caracteres por bloco, em quanto tempo cada bloco aparece em relação às palavras, onde
  ele quebra (pausas, vírgulas, fim de ideia) e se as palavras aparecem uma a uma dentro do bloco;
- **destaques**: se alguma palavra muda de cor ou tamanho, e quando.

Se a fonte for paga e não estiver no Mac, o Claude pede o arquivo a Rodrigo (as da Apple — SF Pro — já são lidas do
próprio Mac, como nos motions).

## No vídeo

✅ Gerada **sozinha da transcrição já cortada**, com edição na etapa Legenda: o texto de cada bloco (corrigir uma palavra,
juntar, separar) e o tempo (pela fala). A legenda **desvia sozinha** dos inserts e da caixinha de comentário. *(P4: feito
para a costura, a janela do ator e a caixinha; falta o conteúdo dos inserts em tela cheia e dos motions — ⏳ no fim.)*

💡 *(substituído na P4 pelos `ajustes`, ver "Como ficou")* Os blocos ficam presos às palavras (SPEC §9):
`projeto.legenda = { ligada, blocos: [{ palavra_ini, palavra_fim, texto? }] }` (o `texto` só quando foi editado). Mexer
nos cortes faz os blocos acompanharem.

💡 **Prévia:** uma camada HTML sobre o player (as fontes e o tamanho em unidades do quadro, como os inserts).
**Exportação:** um arquivo **ASS** gerado dos mesmos blocos e do mesmo estilo, desenhado pelo `ass` do ffmpeg (libass)
por cima de tudo, no fim da montagem (SPEC §13) — rápido e nítido em 4K, sem fotografar quadros.

⏳ Variações de estilo (por formato: anúncio, aula) quando esses formatos existirem.

## Como ficou (P4, out/2026)

💡 **O que as referências mostraram** (`ferramentas/legenda_analisar.py`; o OCR do macOS — Vision, pelo `ocrmac`, num
ambiente à parte — em 4 quadros/s, guardado em `dados/referencias/_legenda_ocr/`; o resumo em `dados/referencias/_legenda.json`):
2.777 quadros com legenda em 10 referências. O texto lido só conta como legenda quando bate com as palavras faladas
naquele instante (±1,2 s): o que é de um insert ou de um motion sai.
- **Uma palavra por vez** é o estilo da casa: 53% dos quadros mostram 1 palavra e 7 das 10 referências têm mediana 1;
  três referências usam frases curtas (mediana 2 a 3 palavras). Uma linha em 93% dos quadros.
- **Minúsculas** como na fala (só 1% em maiúsculas); pontuação em 17% dos quadros.
- **Centralizada** (x = 0,5), com o centro na altura de cada tipo de plano (mediana, fração da altura, de cima): Full ator
  0,554 · tela dividida com insert 0,453 (a costura) · com motion 0,476 · insert tela cheia 0,428 · motion tela cheia
  0,504 · comentário + insert + ator 0,409 · lettering 0,524.
- **Fonte**: SF Pro Display Bold (comparada lado a lado com SF Pro, Helvetica Neue e Avenir Next: o "t" de corte
  inclinado e o "a" batem só com a SF Pro), branca, com sombra escura difusa logo abaixo (a fonte e a sombra foram
  escolhidas comparando a olho, lado a lado com as referências; a ferramenta não mede cor nem sombra).
- **Tamanho**: 56 px num quadro 1080×1920 (2,92% da altura), calibrado pelo mesmo OCR: a palavra "vulnerabilidades" lida
  na referência e desenhada no Chrome dão a mesma altura (0,0247) e quase a mesma largura (0,382 × 0,388).
- **Tempo** (`ferramentas/legenda_ritmo.py`, sobre os mesmos quadros e a transcrição de cada referência — o mesmo
  ElevenLabs dos projetos; resultado em `dados/referencias/_legenda_ritmo.json`; 4 quadros/s, então ±0,125 s por instante e
  valem as medianas): o bloco **entra 0,17 s antes** da 1ª palavra (mediana de 1.470 blocos; de 0,15 a 0,21 s nas 10
  referências) e **sai ~0,1 s antes do fim** da última; numa pausa de 0,3 s ou mais, a legenda some antes da próxima
  palavra (8 de 10 pausas — as referências são cortadas justas, pausas assim quase não há).
- **A frase não se monta palavra a palavra**: nas que usam frases, o bloco troca inteiro (1.169 trocas × 35 em que o
  texto cresce, que são o OCR lendo meia frase).
- **Destaques: não há.** Nenhuma palavra muda de cor: o detector (pixels claros do texto, dentro da caixa do OCR, com
  saturação alta) marcou 7 de 2.777 quadros, e os 7 eram texto de um insert ou de um motion lido junto (CLAUDE, Codex);
  os quadros conferidos a olho são todos brancos. Nem de tamanho: a altura da linha fica entre 0,021 e 0,033 (p10–p90),
  a variação das letras de cada palavra.

💡 **Os blocos** (`legenda/legenda.ts`, uma conta só para a prévia, a etapa e a página de render): das palavras da fala
cortada, no tempo da saída. **Palavra a palavra** (padrão): um bloco por palavra; **Frase curta**: até 3 palavras e 18
letras, quebrando na pontuação e nas pausas de 0,3 s (escolhido, não medido: as três referências com frases têm mediana
de 2 a 3 palavras). O tempo é o medido: o bloco entra 0,17 s antes da 1ª palavra; fica até o próximo se a pausa for
menor que 0,3 s, senão sai 0,1 s antes do fim da última palavra; nunca passa do início do próximo (duas palavras que
começam quase juntas não se sobrepõem no ASS) e, no começo do vídeo, o zero não engole um bloco. A vírgula, o ponto e
vírgula e os dois-pontos do fim saem. Os **ajustes** ficam presos às palavras (`projeto.legenda.ajustes = {<id da
palavra que começa o bloco>: {fim?, texto?}}`; `texto: ''` esconde): juntar com o próximo, separar, corrigir o texto,
esconder, voltar ao automático. Corrigir o texto ou esconder **prende também o `fim`**, para o texto ficar sempre com
as mesmas palavras (trocar o ritmo ou mudar uma pausa não o espalha por outras; um texto antigo sem `fim` fica só na
sua palavra). Separar divide o texto corrigido entre as partes (as últimas palavras do texto vão para o resto) e só
deixa ajustes que mudam algo. 💡 No Frase curta, Separar prende as duas partes (`{fim}` na 1ª palavra também): sem
isso, o agrupamento automático juntava a 1ª palavra de volta ao bloco anterior curto, e separar de novo desfazia a
separação de antes. 💡 Rodada 2 da QA: essas presilhas (só o `fim`) levam o modo (`{fim, modo: 'frase'}`) e só valem no
Frase curta — no Palavra a palavra não pintam o bloco de amarelo, não contam como "mexidos à mão" e não juntam palavras
que o criador nunca juntou ali (o resto de um bloco que ele juntou à mão continua junto nos dois modos). Corrigir,
juntar ou esconder um bloco tira a marca: vale nos dois. "Juntar com o próximo" só grava o texto junto se um dos dois
blocos tinha texto corrigido (o `fim` de uma presilha não conta: o texto automático das palavras juntas é o mesmo e
acompanha um corte que tire uma delas). O texto corrigido perde os espaços das pontas e os repetidos; igual ao de
agora, nada é gravado. 💡 "Juntar com o próximo" fica desligado quando um dos dois blocos está escondido (o texto do
outro apareceria enquanto a palavra escondida é falada): mostre o bloco antes de juntar. O PUT mescla dentro da trava do projeto (dois cliques seguidos não se apagam).

💡 **Mexer nos cortes** (SPEC §9, como os planos da direção): um ajuste cuja 1ª palavra saiu passa à 1ª que sobrou entre
ela e o `fim` (e o `fim` à última que sobrou); se nenhuma sobrou, ele fica **órfão**: a etapa lista os órfãos (o texto
ou a fala de antes) para **reatar** à próxima palavra que ficou ou **descartar**. O contador "mexidos à mão" conta só
os ajustes que valem.

💡 **A altura** (`alturaDaLegenda`): a medida para o tipo de plano, acertada pelo que está na tela em cada insert
(`zonasDaLegenda`, da mesma `divisaoDe` do Render e da prévia):
- **tela dividida**: na **costura real** do trecho (a divisão de cada insert: de 0,28 a 0,62; o motion dividido é meio a
  meio, 0,5), não na mediana 0,453;
- **ator embaixo** (o insert na tela toda e o ator numa janela): a altura do Full ator dentro da janela do ator
  encolhido (0,755 — no peito, como no Full ator); desde a P5, pela geometria do ator no modo e na posição em que ele
  estiver (no recortado também no peito; no canto, logo acima da caixa; [rosto.md](rosto.md));
- **card do comentário**: logo **acima** do card (ou abaixo, se não couber), com a altura do card estimada pelo texto e
  pela escala (no melhor-ia-design: a legenda termina em 0,466 e o card começa em 0,481). 💡 Como o bloco entra 0,17 s
  antes da fala, a 1ª palavra de um plano aparece ainda no anterior: ela desvia também do card de comentário que está
  na tela nesse tempo (antes, "cara" aparecia por cima do card no fim do plano 1).

💡 **Prévia**: uma camada HTML por cima do palco, fora do efeito das transições (como no MP4), em unidades do quadro
(`cqh`). **Exportação**: a página de render manda os blocos visíveis em `__render.legenda`; `legenda.py` escreve o ASS
(dois eventos por bloco: a sombra em preto, borrada e 3 px abaixo, e o texto branco) e o `ass` do ffmpeg (libass) o
desenha por cima de tudo, no fim da montagem. O libass acha a SF Pro Display Bold instalada no Mac (`~/Library/Fonts`,
pelo fontconfig); no libass o mesmo tamanho é 66 (ele mede a fonte de outro jeito), conferido pelo OCR.

💡 **A etapa Legenda** segue o arranjo da de Inserts: à esquerda ligar/desligar, o ritmo (Palavra a palavra · Frase
curta), os órfãos e o bloco do cursor para editar (o campo só grava o que foi digitado, e se refaz quando o bloco muda);
no meio a prévia montada com a legenda; embaixo a linha do tempo com os planos e os blocos (amarelos os mexidos à mão;
cada um com a largura exata do seu tempo, o texto só quando cabe — no zoom inteiro os estreitos não se cobrem). A
legenda aparece também na prévia das etapas Inserts (com os inserts como estão sendo mexidos; um botão ao lado a
esconde só ali), Transições e Áudio.

💡 **Prévia e MP4 iguais em qualquer resolução**: no ASS, a sombra se espalha em fração da altura (`\blur6` em 1080p,
`\blur12` em 4K, como os 12/1920 da prévia) e o espaço entre as letras acompanha o −0,01em da prévia (`\fsp−0,13` em
1080p: "vulnerabilidades" 411 px nos dois; o Spacing negativo no estilo o libass ignora, por isso vai em cada evento).
O caminho do ASS (dentro da pasta da exportação, que leva o nome dado pelo criador) é escapado nos dois níveis do
ffmpeg, sem aspas: um apóstrofo no nome quebrava a exportação.

⏳ **Para Rodrigo (desvio de um ✅):** "a legenda desvia sozinha dos inserts e da caixinha de comentário" está feito
para a caixinha de comentário, a costura da tela dividida e a janela do "ator embaixo", mas **não** para o conteúdo
dos inserts em tela cheia e dos motions: o que há dentro deles (um card branco, um texto do motion) só existe desenhado
na hora, e a legenda fica na altura medida para o tipo de plano. No melhor-ia-design ela cai, num motion de tela cheia,
dentro da caixa branca do prompt. Saídas possíveis: ler a área ocupada de cada insert/motion e procurar uma faixa
livre, ou um fundo/contorno só nesses trechos — a decidir.
⏳ A SF Pro Display precisa estar instalada no Mac (está em `~/Library/Fonts`); sem ela, o libass cai para outra fonte.
