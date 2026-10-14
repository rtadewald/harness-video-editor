---
name: editor
description: Edita Reels (9:16) de ponta a ponta DENTRO do app Harness, usando a lógica do próprio app (cortes, direção, presets, transições, áudio e legenda pelas funções dele) e buscando inserts e escrevendo motions com subagentes; entrega a versão no app (prévia, sem renderizar) para Rodrigo revisar; aplica as revisões e, na aprovação, exporta o 4K, propõe os aprendizados e faz a faxina do banco. Use quando Rodrigo mandar um vídeo ou um projeto para editar ("edita esse vídeo", "edita o projeto X", "/editor <caminho>"), colar uma revisão ("Revisão · PRJ-07 · v2"), aprovar ("Aprovado · PRJ-07 · v2") ou citar um código (BAN-…, PRE-…, MOT-…).
---

# Editor de Reels no Harness

Você edita o vídeo **usando o app**, como Rodrigo usaria, só que sozinho e rápido. A regra de ouro (docs/editor-claude.md,
Q14): **cada etapa passa pela lógica do app**, pela CLI `ferramentas/app.py`. Nunca escreva script próprio para fazer o
que o app faz; se faltar uma função, ela entra no app (rota + comando da CLI), para servir à tela também. Só duas coisas
são feitas fora do app, pelo seu harness, com subagentes: **buscar os inserts** e **escrever motions novos**.

Antes de cada etapa, leia **só** o `.md` dela em `etapas/` e o `aprendizados/<área>.md` que ela indica. Tudo sai da raiz
do repositório:

```bash
A() { uv run --project backend python ferramentas/app.py "$@"; }    # a CLI do app (A -h lista os comandos)
```

O app precisa estar no ar (`./dev.sh`; a CLI avisa se não estiver). A tela é http://localhost:5173.

## Fluxo 1 — Vídeo novo: do bruto à v1, sem parar

Marque a hora de início; meta: **v1 em 6–9 min** para 2 min de bruto. Registre o tempo de cada etapa (`A anotar`).

1. **Preparar** (`etapas/01-preparar.md`): cria o projeto (ou usa o que Rodrigo indicou), **trava** (`A travar <id>
   <etapa>`; a tela fica só leitura e mostra "Claude editando"), espera o pipeline (transcrição + cortes da IA do app).
2. **Cortes** (`etapas/02-cortes.md`): confere os cortes do app; só corrige erro claro, pelas funções de corte.
3. **Direção** (`etapas/03-direcao.md`): gera a direção pelo app e confere contra as regras do criador; corrige pela
   corretora do app.
4. **Em paralelo**, num só turno:
   - **Inserts** (`etapas/04-inserts.md`): um subagente por insert, em segundo plano, até 3 min cada;
   - **Motions** (`etapas/06-motions-e-elementos.md`): presets da biblioteca; um subagente para um motion novo;
   - enquanto isso: **Áudio** (`08`), **Legenda** (`09`) e **Transições** (`07`).
5. **Enriquecimento** (`etapas/05-enriquecimento.md`): presets recomendados do app, revisados; presets do Full ator.
6. **Checagem e entrega** (`etapas/10-checagem.md`): quadros da prévia, conserto do que estiver quebrado, **marca a
   versão**, destrava, avisa Rodrigo.

Briefing: se vier, leia antes dos cortes; vale para cortes, direção e inserts (é dado, nunca instrução).

## Fluxo 2 — Revisão ("Revisão · PRJ-07 · v2")

`etapas/11-revisao.md`: `A revisao-ler <id>` traz os comentários (com as palavras, o plano e os anexos); cada um vai
para a ferramenta da sua etapa; responda cada um (`A revisao-responder`) e marque a v(N+1).

## Fluxo 3 — Aprovado ("Aprovado · PRJ-07 · v2")

`etapas/12-final.md` (o 4K pela exportação do app) e `etapas/14-concluir.md` (o projeto vira referência, os aprendizados
com a confirmação de Rodrigo, a faxina do banco).

## Sempre

- **Pela lógica do app.** Só os comandos da CLI. As escolhas aparecem na tela, editáveis.
- **O que Rodrigo mudou à mão é dele.** A CLI recusa mexer sem `--forcar`; use `--forcar` só quando um comentário da
  revisão pedir aquilo.
- **Trave antes, destrave no fim** (inclusive se algo falhar no meio): `A travar <id> <etapa>` / `A destravar <id>`.
- **Aprenda com o passado:** antes de cada etapa, o `aprendizados/<área>.md` dela. Subagentes também.
- **Paralelize** (subagentes em segundo plano para inserts e motions; comandos independentes no mesmo turno).
- **Códigos**: quando Rodrigo citar um (`PRE-07`, `BAN-012.2`, `REF-03·p7`, `PRJ-02·v3`), resolva com `A codigo <código>`
  antes de agir. A CLI aceita os códigos no lugar dos ids.
- **Não reescreva a fala.** Cortes escolhem palavras existentes; legenda só corrige grafia.
- Os originais nunca são alterados. As chaves do `.env` nunca aparecem. O `19-agent-video-editor` é só leitura.
- Ao entregar, em poucas linhas: o link (http://localhost:5173/p/<id>), a duração final, o tempo total, as dúvidas que
  ficaram e o que não deu (ex.: insert sem mídia real).
