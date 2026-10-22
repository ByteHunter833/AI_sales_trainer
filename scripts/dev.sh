#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1 && [ -d "$PROJECT_DIR/.runtime/node-v22.23.4-linux-x64/bin" ]; then
  export PATH="$PROJECT_DIR/.runtime/node-v22.23.4-linux-x64/bin:$PATH"
fi
if [ ! -x "$PROJECT_DIR/.venv/bin/python" ] || [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
  echo 'Install the dependencies described in README.md first.' >&2
  exit 1
fi
cd "$PROJECT_DIR/backend"
"$PROJECT_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --ws-max-size 16384 &
BACKEND_PID=$!
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
echo 'SalesPilot AI: http://127.0.0.1:5173'
wait -n "$BACKEND_PID" "$FRONTEND_PID"
