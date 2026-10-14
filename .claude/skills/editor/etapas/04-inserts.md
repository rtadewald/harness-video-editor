# 04 · Inserts

Cada plano com insert (Insert tela cheia, Tela dividida · insert, Comentário + insert + ator) precisa de **mídia
real**. Esta é uma das duas etapas feitas fora da lógica do app: você dispara **um subagente por insert, todos de uma
vez, em segundo plano** (`subagent_type: general-purpose`, `model: sonnet`), com **até 3 min cada**, e segue para
Áudio, Legenda e Transições enquanto eles trabalham. Mas a mídia sempre entra **pelo app**: busca no banco do app,
captura do app, upload para o banco do app, ligada ao insert pelo app.

> **Antes, leia `../aprendizados/inserts.md` e mande cada subagente ler também.**

## Rodar

```bash
A travar <id> inserts
A inserts <id>        # cada pedido: id, plano, tipo, tempo, mídias (BAN-…), preset, fala e marcação
```

## O subagente (um por pedido sem mídia)

```text
Você busca a mídia de UM insert de um Reels no app Harness. Repositório: <raiz>. A CLI do app:
  uv run --project backend python ferramentas/app.py <comando>   (o app já está no ar)
Projeto <id> · pedido <pedido> · plano <plano> · <tipo> · formato <vertical|dividida> · <duração> s.
Fala: "<fala>"
O que deve aparecer (marcação): <marcação>
Contexto do vídeo: <1 frase>. Briefing: <se houver>.
Antes: leia <raiz>/.claude/skills/editor/aprendizados/inserts.md e siga.
LIMITE: 3 minutos. Estourou, pare e diga o que achou.
Ordem:
 (1) o banco do app: `app.py banco-buscar "<termos>"` (o selo de cada um: prefira ★ usado e ✓ aprovado; evite ✗ recusado);
 (2) a captura do app, quando a fala cita um site/ferramenta (ache a URL oficial com WebSearch):
     `app.py capturar <id> <pedido> <url> --proporcao <16:9 dividida | 9:16 tela cheia> --duracao <dur+1, mín. 4> --esperar`
     (cada dobra vira uma mídia do banco já ligada ao insert; outra dobra: `--dobras 0 0.4`, em fração da página);
 (3) mídia oficial do produto (yt-dlp só do trecho útil, com --download-sections; imagem original), salva em
     /tmp/claude…/ e subida ao banco do app: `app.py banco-subir <arquivo> --projeto <id> --url <de onde veio> --nome …
     --descricao "<o que aparece, concreto: marca, textos, o que acontece>" --palavras a,b,c` (com o projeto, a mídia entra
     no selo da faxina; com a sua descrição, a IA do app não descreve de novo).
Nunca rosto ou vídeo de outro criador; nunca imagem gerada por IA; nunca mockup seu.
Confira o que achou olhando quadros (ffmpeg num /tmp, e leia as imagens). Só um pedaço serve: `app.py banco-trecho <midia> <ini> <fim>`.
Ligue ao insert (1 a 3 mídias, na ordem; se a fala cita duas coisas, uma de cada): `app.py inserts-ligar <id> <pedido> <BAN-… ou ids>`.
Responda em 2 linhas: os códigos ligados e a nota (o que achou, ou por que não achou).
```

## Depois

- `A inserts <id>`: o que ficou **sem mídia**? Troque o plano por motion ou Full ator pela corretora da direção
  (`A direcao-comentar` + `A direcao-corrigir`) e anote o porquê para Rodrigo.
- O que entrou no banco fica para os próximos vídeos, com o selo: sem selo enquanto o projeto está em edição; na
  aprovação, o que ficou de fora vira ✗ recusado e o que entrou, ★ usado (a faxina é na `14-concluir`).

Tempo esperado: ≤ 3 min (em paralelo).
