#!/usr/bin/env bash
# Sobe backend (FastAPI :8000) e frontend (Vite :5173). Ctrl+C derruba os dois.
set -e
cd "$(dirname "$0")"
[ -d frontend/node_modules ] || (cd frontend && npm install)
(cd backend && uv run uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev) &
trap 'kill 0' EXIT
wait
