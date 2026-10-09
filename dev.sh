#!/usr/bin/env bash
# Sobe backend (FastAPI) e frontend (Vite). Ctrl+C derruba os dois.
# Portas: 8000 e 5173, ou as do `.dev.env` desta pasta (fora do git), para rodar duas cópias ao mesmo tempo (git worktree):
#   HARNESS_API_PORT=8001
#   HARNESS_FRONT_PORT=5174
set -e
cd "$(dirname "$0")"
[ -f .dev.env ] && set -a && . ./.dev.env && set +a
export HARNESS_API_PORT="${HARNESS_API_PORT:-8000}"
export HARNESS_FRONT_PORT="${HARNESS_FRONT_PORT:-5173}"
export HARNESS_FRONT="http://localhost:$HARNESS_FRONT_PORT"  # a página que a exportação e os motions abrem
[ -d frontend/node_modules ] || (cd frontend && npm install)
# --timeout-graceful-shutdown: no --reload, não esperar para sempre um vídeo aberto no navegador (um <video> pausado segura a resposta)
(cd backend && uv run uvicorn app.main:app --reload --timeout-graceful-shutdown 2 --port "$HARNESS_API_PORT") &
(cd frontend && npm run dev) &
echo "Harness: http://localhost:$HARNESS_FRONT_PORT (API em :$HARNESS_API_PORT)"
trap 'kill 0' EXIT
wait
