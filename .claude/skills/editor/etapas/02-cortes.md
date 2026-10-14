# 02 · Cortes

Os cortes já saíram da **IA do app** no pipeline (a seleção de palavras pela LLM + as bordas coladas nos silêncios
reais, com as margens das Configurações). Você **confere**; corrige só erro claro, pelas funções de corte do app.

> **Antes, leia `../aprendizados/cortes.md`.** As regras editoriais estão no SPEC §14 (o app as manda para a IA).

## Rodar

```bash
A travar <id> cortes
A cortes-texto <id>          # o texto final, com o que saiu entre [✂ …], e as dúvidas da IA
```

Leia **inteiro**: a fala corre sem repetições nem buracos de sentido? Sobrou alguma retomada, "corta", "de novo"?

## Quando mexer (raro)

- Uma retomada que ficou ou um trecho bom que saiu: `A cortes-faixa <id> <ini> <fim>` corta (ou com `--manter` devolve)
  um intervalo **do bruto**, em segundos (tempos das palavras: `A palavras <id> <texto>` e o editor). Prefira isso a
  refazer tudo.
- A seleção inteira ruim: `A cortes-refazer <id>` (pede outra seleção à IA do app; `A projeto-esperar <id>`).
- Dúvida com impacto no sentido: **mantenha** e anote para Rodrigo (`A anotar <id> cortes "<dúvida>"`).

Nunca reescreva a fala. Tempo esperado: 10–30 s (só leitura, na maioria das vezes).
