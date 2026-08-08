#!/usr/bin/env bash
# Devcontainer bootstrap: install toolchains, dependencies, and apply migrations.
set -euo pipefail

if ! command -v uv > /dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

cd /workspace/backend
uv sync
uv run alembic upgrade head
uv run python -m app.worker.apply_schema

cd /workspace/frontend
npm install --no-audit --no-fund

echo
echo "Ready. Start the stack with:"
echo "  cd backend  && uv run uvicorn app.main:app --reload --host 0.0.0.0   # API :8000"
echo "  cd backend  && uv run python -m app.worker.run                       # worker"
echo "  cd frontend && npm run dev                                           # UI  :5173"
