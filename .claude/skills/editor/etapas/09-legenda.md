# 09 · Legenda

Gerada pelo app da fala cortada, no estilo da casa (palavra a palavra). Você só corrige a **grafia** do que o
transcritor errou: nomes de ferramentas, marcas, siglas ("cloud" → "Claude", "gpt" → "GPT").

> **Antes, leia `../aprendizados/legenda.md`.**

```bash
A travar <id> legenda
A palavras <id> --mantidas | tr ' ' '\n' | less     # ou: A palavras <id> cloud
A legenda-corrigir <id> <palavra_id> "Claude"
```

Nunca mude a fala. Tempo esperado: ~30 s.
