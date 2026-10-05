#!/usr/bin/env bash
# Idempotent: installs deps and creates env files only if missing.
set -e
cd "$(dirname "$0")/.."

if [ ! -x backend/.venv/bin/uvicorn ]; then
  PY=$(command -v python3.13 || command -v python3.12 || command -v python3)
  echo "[setup] creating backend venv with $PY"
  "$PY" -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d web/node_modules ]; then
  echo "[setup] installing web dependencies"
  npm --prefix web install --silent
fi

for f in backend/.env web/.env.local; do
  src=$([ "$f" = web/.env.local ] && echo web/.env.example || echo backend/.env.example)
  if [ ! -f "$f" ]; then cp "$src" "$f"; echo "[setup] created $f from $src, fill in your keys"; fi
done
