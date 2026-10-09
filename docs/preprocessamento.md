# Pré-processamento

A primeira etapa do projeto (SPEC §8.1), no lugar da antiga "Cortes": tudo o que se faz no vídeo do ator antes da
direção. São três partes, numa etapa só: **Cortes** (o que já existe: [cortes.md](cortes.md)), **Enquadramento** (só
para vídeos 16:9) e **Look** (LUT e vinheta). Também o que acontece **ao criar o projeto**.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## Novo projeto

✅ A tela de criação tem só (decisão de Rodrigo, out/2026):
- **Nome** do vídeo.
- **Motor de transcrição** (o padrão vem das Configurações; ver [cortes.md](cortes.md)).
- **Formato:** **Reels** (o único ativo), **Anúncio** e **Aula** (aparecem desativados, "em breve").
- O arquivo do **vídeo** (bruto), vertical (9:16) ou horizontal (16:9).

✅ O briefing e os vídeos de apoio saem da criação (não eram usados pela direção). O campo `briefing` continua aceito em
projetos antigos.

💡 `projeto.formato = 'reels'`. Os outros formatos, quando existirem, mudam as regras de cada etapa (duração, ritmo,
legenda); por ora o valor só é guardado.

💡 Feito na F0 (out/2026): `NovoProjeto.tsx` pede Nome, Motor, Formato (Reels marcado; Anúncio e Aula visíveis,
desativados, "em breve") e o vídeo. `POST /api/projetos` aceita `formato` (padrão `reels`; `anuncio` e `aula` dão 422
"em breve") e continua aceitando `briefing_texto`, `briefing_audio` e `apoios` de clientes antigos. Projetos sem
`formato` são lidos como Reels.

## Na tela

💡 A etapa (id `cortes`, o de antes) tem no topo as abas **Cortes · Enquadramento · Look**. Cortes é a tela de sempre
([cortes.md](cortes.md)); Enquadramento e Look são as telas descritas abaixo, com a prévia do vídeo cortado ao lado (num
vídeo vertical, o Enquadramento avisa que não se aplica). Nenhuma das três tem o selo EM CONSTRUÇÃO. Os atalhos dos
Cortes (←/→ no bruto, E, B) valem só na aba Cortes.

## Enquadramento: de 16:9 para 9:16 pelo rosto

✅ Se o bruto é horizontal, o app gera um **bruto 9:16** e todo o resto (proxy, transcrição, cortes, recorte do ator…)
parte dele. O original fica guardado (`midia/original/`).

✅ **A câmera segue o rosto devagar** (decisão de Rodrigo, out/2026): uma folga em que pequenos movimentos não mexem o
quadro, e o quadro só anda quando o ator se desloca de verdade, com aceleração e chegada suaves (nunca um salto).

💡 Como:
1. **Rosto quadro a quadro** com o detector de rosto do MediaPipe (local, grátis; o mesmo pacote do recorte do ator), a
   ~6 quadros por segundo sobre uma versão reduzida do original: o centro e o tamanho do rosto em cada instante
   ([rosto.md](rosto.md)). Sem rosto num trecho, o quadro fica onde estava; sem rosto no vídeo inteiro (gravação de
   tela, ator de costas), o recorte fica no centro.
2. **O caminho da câmera** (o centro horizontal do recorte 9:16 ao longo do tempo): a posição alvo é o centro do rosto;
   uma zona morta de ~8% da largura do recorte; fora dela, a câmera vai até o alvo com uma mola amortecida (sem passar do
   ponto), com velocidade máxima de ~20% da largura por segundo, numa passada só (a câmera nunca anda antes do ator);
   se o rosto vai sair de uma faixa segura do quadro, a mola puxa mais e a velocidade cede; no fim, uma suavização
   curta sem atraso. Nunca sai da imagem.
3. **O bruto 9:16** é renderizado uma vez pelo ffmpeg (recorte com a posição de cada quadro, na altura original: um 4K
   16:9 vira 1216×2160), HEVC de alta qualidade pelo chip do Mac. Depois segue o pipeline normal.
4. Na etapa, **Enquadramento** mostra o original com o retângulo 9:16 andando sobre ele; dá para mudar a suavidade
   (Calma · Normal · Ágil) e um deslocamento fixo (para a esquerda/direita) e **Reenquadrar** (refaz o bruto 9:16;
   os cortes e o resto continuam, porque o tempo é o mesmo).

💡 Implementado (P1, out/2026): `enquadramento.py` — o passo `enquadramento` roda antes de tudo no pipeline (num vertical
fica "pulado" e não aparece na tela de processamento, nem como pendente); o rosto do original é medido reduzido (lado
maior até 1280 px) e guardado em `midia/rosto/original.json` (reenquadrar não mede de novo); suavidades Calma · Normal ·
Ágil = zona morta 10 / 8 / 5%, velocidade máxima 10 / 20 / 25% da largura do recorte por segundo e mola 1,5 / 2,5 / 4
(1/s); o recorte por quadro vai ao `crop` do ffmpeg pelo `sendcmd`; HEVC `-q:v 80`, áudio copiado; o 9:16 fica em
`midia/bruto_9x16.mp4`. Reenquadrar (`PUT /api/projetos/{id}/enquadramento`) refaz o 9:16 em segundo plano e, em
seguida, o proxy, o rosto e o recorte do ator. A aba mostra o original no instante do player (o tempo do bruto é o
mesmo) com o recorte desenhado.

💡 O caminho da câmera (revisão da P1, out/2026). A primeira versão tirava a média de duas passadas com velocidade
limitada (uma para a frente e outra de trás para a frente no tempo): a câmera começava a andar 2,5 a 4 s antes do ator e,
num deslocamento maior, o rosto saía do 9:16 (medido 0,24 a 0,95 do quadro com Normal). Agora:
- o alvo é o rosto com uma **mediana móvel de 5 amostras** (~0,8 s: tira uma detecção errada isolada sem atrasar um
  deslocamento); nos buracos (`conf: 0`), o rosto fica onde foi visto por último;
- **uma passada só** da mola com zona morta (não adianta o ator); fora da **faixa segura** (o rosto a mais de 20% da
  largura do recorte do centro, ou seja, fora de 30–70% do quadro), a mola ganha um puxão extra (30/s² por unidade fora) e
  a velocidade máxima cede (+2·mola por unidade fora);
- uma trava antes da suavização (o rosto entre 20% e 80% do quadro), uma **gaussiana centrada de σ = 0,25 s** (tira o
  tranco das acelerações; adianta no máximo ~0,5 s) e uma trava final larga (10–90%), que só age num salto do rosto
  (outra pessoa, um erro do detector): o salto vira uma panorâmica rápida (~0,4 s), não um corte.

Medido num 16:9 de teste de 2:02 (o ator do `melhor-ia-design` parado à esquerda, depois andando 150 px/s por 8 s, parado,
voltando), pelo rosto medido no 9:16 gerado: Normal, rosto entre 0,32 e 0,72 do quadro (média 0,51; 0,44–0,72 durante a
caminhada); nas simulações, a câmera começa a andar 0,2–0,3 s depois do ator e o rosto fica em 0,26–0,74 (Calma), 0,31–0,69
(Normal) e 0,33–0,67 (Ágil). Um Reenquadrar de 2:02 em 1080p leva ~20 s (o 9:16 e o proxy); a primeira conversão, com a
medida do rosto, ~30 s.

💡 Robustez do enquadramento (revisão da P1, out/2026):
- **Sem rosto nenhum**: o recorte fica no centro (com o deslocamento); o passo fica pronto com o aviso "sem rosto".
- **A primeira vez**, o original vai para `midia/original/` e o bruto do projeto passa a apontar para lá na mesma
  gravação: se o render falhar, o projeto continua com um bruto que existe, e "Tentar de novo" parte dele.
- **"Tentar de novo"/processar de novo** não refaz o 9:16 se ele já existe com a mesma suavidade e o mesmo deslocamento
  (`enquadramento.feito`); só o Reenquadrar refaz. O pipeline e o Reenquadrar nunca geram o 9:16 ao mesmo tempo (uma trava
  por projeto).
- **Reenquadrar** é recusado (409) com outro Reenquadrar na fila ou rodando, ou com o processamento do vídeo ainda
  andando (depois de um erro do pipeline, o que ficou pendente não conta); o "Tentar de novo" do processamento é recusado
  durante um Reenquadrar.
- **O proxy não some**: é refeito num arquivo à parte e trocado no fim (o player continua com o antigo enquanto isso); o
  Reenquadrar só fica `pronto` com o proxy novo no lugar. A cada 9:16 novo, `enquadramento.versao` sobe; o endereço do
  player leva `?v=<versao>`, e o editor (não só a aba) acompanha o Reenquadrar em qualquer aba ou etapa e recarrega os
  dados e o player quando ele termina — sem recarregar a página.
- **O recorte e o rosto do ator** são refeitos do proxy novo. Um que estava rodando sobre o vídeo antigo termina depois,
  vê que a versão mudou e descarta o resultado (não marca `pronto`); sem proxy registrado (sendo refeito), os dois não
  começam.
- **Servidor reiniciado no meio** (o `--reload` do `dev.sh`): o Reenquadrar que estava na fila ou rodando recomeça
  sozinho, e as sobras (`bruto_9x16.parte.mp4`, `.cmds`) são apagadas.
- **Projetos de antes do enquadramento** com o bruto ainda 16:9: a aba diz isso e oferece **Converter para 9:16** (o
  mesmo caminho do Reenquadrar; os cortes continuam, o tempo é o mesmo).

⏳ Duas pessoas no quadro: segue o rosto maior (o mais perto da câmera).

## Look: LUT e vinheta

✅ **2 ou 3 LUTs básicos e a vinheta**, no estilo dos nossos vídeos (decisão de Rodrigo, out/2026). A vinheta (bordas
escurecidas, como no print de referência) vem ligada por padrão. Valem para o vídeo inteiro do projeto e só para o
**ator** (não para os inserts nem para os motions).

✅ Os looks:
- **Natural:** quase neutro, só um pouco de contraste.
- **Casa** (padrão): o look dos nossos vídeos, medido nas referências — mais contraste, pele quente, sombras um pouco
  frias e o verde/azul do fundo menos saturados.
- **Frio / limpo:** branco mais neutro e contraste suave (para gravações com luz quente demais).
- e **Sem LUT**.

✅ Controles: o look, a **intensidade** do LUT (0 a 100%, padrão 100%) e a **vinheta** (Sem · Leve · Normal · Forte,
padrão Normal), com a prévia mudando na hora.

💡 Como:
- **Os LUTs são gerados por nós** (`ferramentas/luts.py`): um LUT 3D `.cube` (33×33×33) por look, a partir de uma
  transformação de cor simples (contraste, tons das sombras e das luzes, saturação). Por serem nossos, ficam no git
  (`backend/luts/`).
- **A vinheta é uma máscara** (elipse do quadro 9:16, centro um pouco acima do meio, borda bem suave), multiplicada
  sobre a imagem. A mesma máscara serve à prévia e à exportação, então as duas ficam iguais.
- **Prévia ao vivo com WebGL:** onde o ator aparece (o player de todas as etapas, a janela do "ator embaixo", a pessoa
  recortada), o vídeo passa por um shader com o LUT (interpolação trilinear, a mesma do `lut3d` da exportação) e a
  máscara da vinheta. Sem WebGL, mostra sem o look.
- **Exportação:** no ffmpeg, logo depois do recorte/escala do ator: `lut3d` (com a intensidade como mistura entre a
  imagem original e a com LUT) e a máscara da vinheta multiplicada. A pessoa recortada (cabeça por cima do insert)
  passa pelo mesmo look.
- Dados: `projeto.look = { lut: 'casa' | 'natural' | 'frio' | null, intensidade: 0..1, vinheta: 'sem' | 'leve' | 'normal' | 'forte' }`.

💡 Implementado (P1, out/2026): `look.py` (catálogo, máscara, filtros), `ferramentas/luts.py` (os 3 `.cube`), rotas
`GET /api/look`, `GET /api/look/{lut}.cube`, `GET/PUT /api/projetos/{id}/look`; no front, `editor/look.ts`,
`CanvasLook.tsx` (WebGL2: o LUT como textura 3D trilinear, `RGB16F`) e `PainelLook.tsx` (com "Segure para ver sem o
look"). A vinheta: força Leve 0,25 · Normal 0,40 · Forte 0,55 (o canto do quadro fica a ~64% com Normal), elipse com
centro em 45% da altura. Na exportação, o look entra logo depois da escala do ator, em RGB (`gbrp`), e a máscara é uma
entrada em loop no fim da lista. Conferido: a prévia e o ffmpeg no mesmo quadro diferem ~4 níveis de 255 (decodificação
e escala), contra 16–18 sem o look; os cantos batem (82 × 82 com Normal, 67 × 66 com Forte). Sem look, o comando da
exportação é idêntico ao de antes.

💡 Os LUTs foram ajustados à mão (as constantes de `ferramentas/luts.py`), a partir de uma comparação visual dos planos
de ator das referências com um bruto cru — não por uma medida automática (out/2026). Se Rodrigo quiser outro tom, muda-se
ali e roda-se a ferramenta.

💡 **Interpolação trilinear nos dois lados:** a textura 3D do WebGL só faz trilinear, então a exportação força
`lut3d=…:interp=trilinear` (o padrão do ffmpeg é tetraédrica) para a prévia e o MP4 darem o mesmo número.

💡 **A intensidade** é `LUT·k + original·(1 − k)` nos dois lados: o `mix()` do shader e, no ffmpeg,
`[lut][original]blend=all_mode=normal:all_opacity=k` (o blend dá primeira·opacity + segunda·(1 − opacity); na primeira
versão as entradas estavam trocadas e a intensidade saía invertida no MP4 — só 0, 50% e 100% batiam; corrigido na revisão
da P1, com um teste a 25%). Na aba Look, o número e a prévia mudam a cada passo do slider (arraste ou setas) e o servidor
recebe 0,4 s depois que ele para.

💡 **Projetos sem `look`** (todos os de antes da P1) usam o padrão: Casa a 100% com a vinheta Normal. Um vídeo já
exportado antes, se exportado de novo, sai com essa cor e essa vinheta; para sair como antes, escolha "Sem LUT" e a
vinheta "Sem" na aba Look.

💡 A prévia do look não para ao trocar de aba ou de etapa: o canvas WebGL não perde o contexto quando o efeito roda de
novo no mesmo canvas (o `StrictMode` do modo de desenvolvimento roda duas vezes); só o programa, as texturas e o buffer
são liberados, e o contexto é largado quando o canvas sai da página.

⏳ **A simulação dos presets** (página Presets) ainda mostra o ator sem o look: a página tem dezenas de simulações ao mesmo
tempo e cada `CanvasLook` é um contexto WebGL (o navegador mantém ~16 e perde os mais antigos). Fazer junto com um
desenho que compartilhe um contexto, ou só na simulação aberta em tamanho grande.

⏳ Na tela dividida, a vinheta é a do quadro inteiro do ator (antes de ele descer para a metade de baixo): conferir no
olho se fica bom ou se a vinheta deve seguir a área visível do ator.
