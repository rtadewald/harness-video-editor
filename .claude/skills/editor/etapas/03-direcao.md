# 03 · Direção visual

A direção sai do **algoritmo do app** (a diretora + a formatadora no Gemini, guiadas pela Calibragem e pela
Heurística). Você gera, confere contra as regras do criador e corrige pela **corretora** do app.

> **Antes, leia `A aprendizados elementos`** e as regras do criador (`A heuristica --projeto <id>`: as "Regras do criador" são
> obrigatórias).

## Rodar

```bash
A travar <id> direcao
A direcao-gerar <id> --esperar        # 40–90 s
A direcao-ver <id>                    # cada plano: tipo, marcação, texto e a fala
```

## Conferir (contra `A heuristica --projeto <id>`)

- Abertura: nunca Full ator (a não ser pedido); vídeo de dúvida abre com Comentário + insert + ator.
- Nenhum Full ator com mais de 3–4 s seguidos; troca de plano no fim de frase ou numa pausa.
- A tela mostra o que a frase diz; o real antes do motion (ferramenta citada → a ferramenta em uso); lettering grande
  só para a palavra do ManyChat; nada de material repetido em sequência.
- O que é **achável**: um site, um produto, um repositório. Ideia abstrata pede motion ou Full ator.

## Corrigir (pela corretora)

```bash
A palavras <id> <palavra>                                   # o id da palavra onde o problema está
A direcao-comentar <id> <palavra_id> "o que mudar aqui"      # um por ponto
A direcao-corrigir <id> --geral "<comentário geral, opcional>" --esperar
```
A corretora gera a próxima versão da direção. Plano B (ela não atendeu): Rodrigo editaria o plano na etapa Direção; você
também pode (é a mesma edição da tela) — mas registre o porquê com `A anotar`.

Dúvida que muda o sentido (pergunta retórica ou leitura de comentário?): anote para Rodrigo. Tempo: 1–2 min.
