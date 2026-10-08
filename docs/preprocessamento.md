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

## Enquadramento: de 16:9 para 9:16 pelo rosto

✅ Se o bruto é horizontal, o app gera um **bruto 9:16** e todo o resto (proxy, transcrição, cortes, recorte do ator…)
parte dele. O original fica guardado (`midia/original/`).

✅ **A câmera segue o rosto devagar** (decisão de Rodrigo, out/2026): uma folga em que pequenos movimentos não mexem o
quadro, e o quadro só anda quando o ator se desloca de verdade, com aceleração e chegada suaves (nunca um salto).

💡 Como:
1. **Rosto quadro a quadro** com o detector de rosto do MediaPipe (local, grátis; o mesmo pacote do recorte do ator), a
   ~6 quadros por segundo sobre uma versão reduzida do original: o centro e o tamanho do rosto em cada instante
   ([rosto.md](rosto.md)). Sem rosto num trecho, o quadro fica onde estava.
2. **O caminho da câmera** (o centro horizontal do recorte 9:16 ao longo do tempo): a posição alvo é o centro do rosto;
   uma zona morta de ~8% da largura do recorte; fora dela, a câmera vai até o alvo com uma mola amortecida (sem passar do
   ponto), com velocidade máxima de ~15% da largura por segundo; o caminho é suavizado nos dois sentidos do tempo
   (não atrasa em relação ao ator) e nunca sai da imagem.
3. **O bruto 9:16** é renderizado uma vez pelo ffmpeg (recorte com a posição de cada quadro, na altura original: um 4K
   16:9 vira 1216×2160), HEVC de alta qualidade pelo chip do Mac. Depois segue o pipeline normal.
4. Na etapa, **Enquadramento** mostra o original com o retângulo 9:16 andando sobre ele; dá para mudar a suavidade
   (Calma · Normal · Ágil) e um deslocamento fixo (para a esquerda/direita) e **Reenquadrar** (refaz o bruto 9:16;
   os cortes e o resto continuam, porque o tempo é o mesmo).

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
- **Os LUTs são gerados por nós** (`ferramentas/luts.py`): mede-se nas referências (quadros do ator, fora dos inserts) a
  curva de tons, o equilíbrio de cor das sombras, meios-tons e luzes e a saturação, comparando com os brutos (antes da
  cor); disso sai um LUT 3D `.cube` (33×33×33). Por serem nossos, ficam no git (`backend/luts/`).
- **A vinheta é uma máscara** (elipse do quadro 9:16, centro um pouco acima do meio, borda bem suave), multiplicada
  sobre a imagem. A mesma máscara serve à prévia e à exportação, então as duas ficam iguais.
- **Prévia ao vivo com WebGL:** onde o ator aparece (o player de todas as etapas, a janela do "ator embaixo", a pessoa
  recortada, a simulação dos presets), o vídeo passa por um shader com o LUT (interpolação tetraédrica, como o
  `lut3d` do ffmpeg) e a máscara da vinheta. Sem WebGL, mostra sem o look.
- **Exportação:** no ffmpeg, logo depois do recorte/escala do ator: `lut3d` (com a intensidade como mistura entre a
  imagem original e a com LUT) e a máscara da vinheta multiplicada. A pessoa recortada (cabeça por cima do insert)
  passa pelo mesmo look.
- Dados: `projeto.look = { lut: 'casa' | 'natural' | 'frio' | null, intensidade: 0..1, vinheta: 'sem' | 'leve' | 'normal' | 'forte' }`.

⏳ Na tela dividida, a vinheta é a do quadro inteiro do ator (antes de ele descer para a metade de baixo): conferir no
olho se fica bom ou se a vinheta deve seguir a área visível do ator.
