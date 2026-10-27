#!/usr/bin/env bash
# NER-SMART one-click start (macOS / Linux)

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting NER-SMART ==="

# --- Backend ---
if [ ! -f "$ROOT/backend/venv/bin/python" ]; then
  echo "[1/3] Creating Python virtual environment..."
  python3 -m venv "$ROOT/backend/venv"
  "$ROOT/backend/venv/bin/python" -m pip install --upgrade pip
  "$ROOT/backend/venv/bin/python" -m pip install -r "$ROOT/backend/requirements.txt"
fi

echo "[1/3] Starting backend on http://127.0.0.1:8000 ..."
( cd "$ROOT/backend" && ./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 ) &
BACKEND_PID=$!

sleep 6

# --- Frontend ---
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "[2/3] Installing frontend dependencies..."
  npm install --prefix "$ROOT/frontend"
fi

echo "[2/3] Starting frontend on http://localhost:5173 ..."
( cd "$ROOT/frontend" && npm run dev ) &
FRONTEND_PID=$!

sleep 6
echo "[3/3] Opening dashboard..."
python3 -m webbrowser "http://localhost:5173" 2>/dev/null || open "http://localhost:5173" 2>/dev/null || true

echo ""
echo "NER-SMART running:"
echo "  Frontend : http://localhost:5173"
echo "  Backend  : http://127.0.0.1:8000   (docs: /docs)"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait