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

```text
Escreva um preset de motion novo em <raiz>/frontend/public/motion/presets/<id>.html (id: minúsculas e hífens).
Leia antes: <raiz>/.claude/skills/editor/aprendizados/motions.md; a identidade (uv run --project backend python -c
"from app import projeto; print(projeto.ler_config()['identidade_motion'])", rodado em <raiz>/backend); os recusados em
frontend/public/motion/presets/_recusados/ (com o motivo), se houver; e prompt.html, lettering.html e ../runtime.js:
copie a estrutura (<script type="application/json" id="preset"> com nome, descricao, fundo, duracao, sons e
"a_revisar": true; <script id="campos">; <style>; a timeline do GSAP pausada entregue com motion.pronto(tl)).
Pedido: <o que a direção pede> · formato <vertical|dividida> · duração <s> · fala: "<fala>".
Regras: poucos elementos; quase nenhum texto; curva longa e suave (perto de 0.25,0.1,0.1,1 em 0,8–1 s), nunca linear;
a cena nunca para até o corte; fontes Inter, Instrument Serif ou SF Pro; sons só do catálogo do app.
Teste: abra http://localhost:5173/motions (o app no ar) e confira o seu na grade, ou fotografe a página de motion do
app com Playwright em 4 instantes; olhe as imagens e corrija. Responda com o id e os campos.
```
Depois: `A motions-usar …` com o id novo. Ele aparece na página Motions com "A REVISAR" para Rodrigo aprovar.
Animação mais elaborada que isso: troque o plano (insert real ou Full ator) pela corretora e anote a ideia.

## Elementos

Lettering, palavra ManyChat, caixinha de perguntas e print sobreposto vêm da direção, presos às palavras, e o app os
desenha. Para mudar um texto, corrija pela corretora da direção.

Tempo esperado: 2–4 min (o motion novo, em paralelo).
