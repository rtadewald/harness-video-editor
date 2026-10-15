# 04 · Inserts

Cada plano com insert (Insert tela cheia, Tela dividida · insert, Comentário + insert + ator) precisa de **mídia
real**. Esta é uma das duas etapas feitas fora da lógica do app: você dispara **subagentes em grupos de 3 pedidos,
todos de uma vez, em segundo plano** (`subagent_type: general-purpose`, `model: sonnet`), com **até 3 min por insert**, e segue para
Áudio, Legenda e Transições enquanto eles trabalham. Mas a mídia sempre entra **pelo app**: busca no banco do app,
captura do app, upload para o banco do app, ligada ao insert pelo app.

> **Antes, leia `A aprendizados inserts` e mande cada subagente ler também.**

## Rodar

```bash
A travar <id> inserts
A inserts <id>        # cada pedido: id, plano, tipo, tempo, mídias (BAN-…), preset, fala e marcação
```

## Os subagentes (em grupos, pelos briefs da CLI)

```bash
A inserts-briefs <id> --contexto "<1 frase do vídeo>"     # um arquivo por grupo de 3 pedidos sem mídia; imprime os caminhos
```
Dispare **um subagente por arquivo, todos no mesmo turno, em segundo plano** (`general-purpose`, `model: sonnet`), com o
prompt **só**: `Leia <caminho> e siga.` — não escreva o brief à mão (o modelo é `04-brief-inserts.md`; mude lá). Com 24
inserts são 8 subagentes, abaixo do limite de 20 simultâneos, sobrando vaga para o motion novo (que já deve estar rodando,
ver `06`). Pedidos difíceis (o subagente não achou): `A inserts-briefs <id> --grupo 1` só com eles depois, ou o plano B.

## Depois

- `A inserts <id>`: o que ficou **sem mídia**? Troque o plano por motion ou Full ator pela corretora da direção
  (`A direcao-comentar` + `A direcao-corrigir`) e anote o porquê para Rodrigo.
- O que entrou no banco fica para os próximos vídeos, com o selo: sem selo enquanto o projeto está em edição; na
  aprovação, o que ficou de fora vira ✗ recusado e o que entrou, ★ usado (a faxina é na `14-concluir`).

Tempo esperado: ≤ 3 min (em paralelo).
