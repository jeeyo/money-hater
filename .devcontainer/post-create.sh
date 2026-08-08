#!/usr/bin/env bash
# One-time devcontainer bootstrap: install toolchains and dependencies.
set -euo pipefail

if ! command -v uv > /dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

cd /workspace/backend
uv sync

cd /workspace/frontend
npm install --no-audit --no-fund

echo "Dependencies installed."
