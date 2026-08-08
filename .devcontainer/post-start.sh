#!/usr/bin/env bash
# Runs on every container start: bring the schema up to date and make sure the
# demo account exists, so the app always has something to show.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

cd /workspace/backend
uv run alembic upgrade head
uv run python -m app.worker.apply_schema
# No-op when the demo account is already there; use --reset for fresh data
uv run python -m app.dev.seed

cat <<'EOF'

Money Hater is ready. Sign in with:

    demo@moneyhater.dev / demodemo123

Start the stack:
  cd backend  && uv run uvicorn app.main:app --reload --host 0.0.0.0   # API :8000
  cd backend  && uv run python -m app.worker.run                       # worker
  cd frontend && npm run dev                                           # UI  :5173

Fresh demo data at any time:
  cd backend && uv run python -m app.dev.seed --reset
EOF
