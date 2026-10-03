# AGENTS — Harness Video Editor

Editor de vídeo local com interface web. Cada etapa (Cortes, Inserts, Motion, Legenda) é feita por IA e corrigida por Rodrigo. Tudo o que foi decidido está em [SPEC.md](SPEC.md). Leia antes de mexer.

Responda em PT-BR, direto. Separe o que existe do que é plano.

## Stack

- `backend/`: Python, FastAPI, LangChain, OpenRouter, MLX Whisper, FFmpeg (`uv`).
- `frontend/`: React, Vite, TypeScript, Tailwind, shadcn/ui. Visual segue o design system Otto (SPEC §7).
- `projetos/`: dados dos projetos, fora do git.
- `_legado/`: projeto anterior. Serve só de referência, não é fonte de verdade.

## Como rodar

`./dev.sh` → abra http://localhost:5173 (API em :8000).
Testes: `cd backend && uv run pytest`. Checagem do front: `cd frontend && npm run build`.

## Regras de trabalho

- **Uma fase por vez** (SPEC §15). Rodrigo avalia antes da próxima. Não implemente o que está fora da fase atual.
- **Simples primeiro.** Nada de configuração, abstração ou validação além do necessário. Se um arquivo passar de ~200 linhas, pergunte se está crescendo sem motivo.
- **Decisões editoriais são da LLM**; o código valida e calcula tempos.
- **Regras editoriais só no SPEC §14.** Não copie para prompts nem docs.
- **Correção pontual não é regra geral**, a menos que Rodrigo diga.
- **Não declare aprovado** o que Rodrigo não aprovou.
- Originais em `projetos/*/midia/` nunca são alterados.
- Mudou uma decisão? Atualize o SPEC no mesmo commit. Este arquivo fica com no máximo ~40 linhas.
- Docs de bibliotecas: Context7.

## Segurança

- A chave do OpenRouter fica só em `backend/.env`. Nunca mostre, registre ou faça commit dela.
- Os caminhos têm espaços: use aspas.
