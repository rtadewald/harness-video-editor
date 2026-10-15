# 06 · Motions e elementos

> **Antes, leia `../aprendizados/motions.md` e `../aprendizados/elementos.md`.** A identidade visual dos motions está nas
> Configurações do app (`identidade_motion`) e em `aprendizados/motions.md`.

## Motions

Um plano de **Motion tela cheia** ou **Tela dividida · motion** recebe um preset de motion do app (HTML + GSAP, em
`frontend/public/motion/presets/`), com os campos preenchidos pela fala:

```bash
A travar <id> motions
A motions                                         # os presets (MOT-…), campos e "A REVISAR"
A motions-usar <id> <plano> --preset <MOT-… | id> --formato <vertical|dividida> --valores '{"prompt": "…"}' [--fundo chuva]
A motions-usar <id> <plano> --video <BAN-…> --formato …        # um vídeo do banco no lugar do motion
```

### Motion novo (a outra etapa feita fora do app)

Nenhum preset serve e a ideia é simples (um número que cresce, dois logos lado a lado, uma lista que se monta): um
**subagente em segundo plano** (`model: opus`) escreve o preset novo em `frontend/public/motion/presets/<id>.html`:

```bash
A motion-brief <id> <plano> --preset <id-novo> --duracao <s do plano> [--pedido "<o que mais mostrar>"]   # imprime o caminho
```
Dispare o subagente com o prompt **só**: `Leia <caminho> e siga.` (o modelo é `06-brief-motion.md`; mude lá).
**Dispare-o primeiro, logo depois da direção**: é a tarefa mais longa (~7 min) e, se ficar por último, é ela que segura
a entrega.
Depois: `A motions-usar …` com o id novo. Ele aparece na página Motions com "A REVISAR": só Rodrigo aprova (Aprovar)
ou recusa com o motivo (vai para `_recusados/`). Nunca tire o `a_revisar` você mesmo. Recusado num vídeo em revisão:
troque o motion do plano (outro preset ou um novo) antes.
Animação mais elaborada que isso: troque o plano (insert real ou Full ator) pela corretora e anote a ideia.

## Elementos

Lettering, palavra ManyChat, caixinha de perguntas e print sobreposto vêm da direção, presos às palavras, e o app os
desenha na prévia e no MP4 (o mesmo estilo do 19: lettering branco abaixo do queixo ou com o fundo desfocado sobre um
insert, a barra do ManyChat digitando, a caixinha do Instagram, o print como etiqueta mono com o texto). Onde há
lettering, a legenda some sozinha. Para mudar um texto, corrija pela corretora da direção; confira na checagem
(`A quadros <id> <s>` no meio do elemento).

Tempo esperado: 2–4 min (o motion novo, em paralelo).
