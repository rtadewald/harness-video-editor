# AGENTS — Harness Video Editor

Editor de vídeo local com interface web. Cada etapa (Cortes, Direção visual, Inserts, Motion, Legenda) é feita por IA e corrigida por Rodrigo. Tudo o que foi decidido está em [SPEC.md](SPEC.md). Leia antes de mexer.

Responda em PT-BR, direto. Separe o que existe do que é plano.

## Stack

- `backend/`: Python, FastAPI, LangChain, OpenRouter, MLX Whisper, FFmpeg (`uv`).
- `frontend/`: React, Vite, TypeScript, Tailwind, shadcn/ui. Visual segue o design system Otto (SPEC §7).
- `projetos/` e `referencias/`: dados dos projetos e da Calibragem, fora do git.
- `_legado/`: projeto anterior. Serve só de referência, não é fonte de verdade.

## Como rodar

`./dev.sh` → abra http://localhost:5173 (API em :8000).
Testes: `cd backend && uv run pytest`. Checagem do front: `cd frontend && npm run build`.

## Regras de trabalho

- **Uma fase por vez** (SPEC §15). Rodrigo avalia antes da próxima. Não implemente o que está fora da fase atual.
- **Simples primeiro.** Nada de configuração, abstração ou validação além do necessário. Se um arquivo passar de ~200 linhas, pergunte se está crescendo sem motivo.
- **Decisões editoriais são da LLM**; o código valida e calcula tempos.
- **Regras editoriais dos cortes só no SPEC §14.** Não copie para prompts nem docs. As da direção são do criador: ficam na configuração e na heurística (SPEC §8.2).
- **App agnóstico de criador:** nada de nome de pessoa ou marca nos prompts (SPEC §12).
- **Correção pontual não é regra geral**, a menos que Rodrigo diga.
- **Não declare aprovado** o que Rodrigo não aprovou.
- Originais em `projetos/*/midia/` nunca são alterados.
- Mudou uma decisão? Atualize o SPEC no mesmo commit. Este arquivo fica com no máximo ~40 linhas.
- Docs de bibliotecas: Context7.

## Git

- Cada funcionalidade numa branch saída da main; **uma branch de trabalho por vez** (não abra outra antes de a atual ir para a main). Commite à vontade nela.
- No push (quando Rodrigo pedir): junte os commits da branch num só (`git reset --soft $(git merge-base main HEAD)` + commit; rebase sobre a main se ela andou), `git merge --no-ff` na main, `git push origin main` (nunca forçado) e apague a branch local.

## Segurança

- As chaves (OpenRouter, ElevenLabs) ficam só em `backend/.env`. Nunca mostre, registre ou faça commit delas.
- Os caminhos têm espaços: use aspas.
