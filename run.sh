#!/usr/bin/env bash
# Tiny Town launcher.
#   ./run.sh               start the game and open it in the browser
#   ./run.sh --no-browser  start without opening a browser
#   ./run.sh --restart     stop a running Tiny Town server first (picks up server code changes)
#   PORT=4000 ./run.sh     use another port (default: PORT from .env, otherwise 3000)
# Ctrl+C stops the server.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

OPEN_BROWSER=1
RESTART=0
for arg in "$@"; do
  case "$arg" in
    --no-browser) OPEN_BROWSER=0 ;;
    --restart) RESTART=1 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# --- Node.js ---
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Install version 18 or newer: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node.js 18+ is required (found $(node -v))." >&2
  exit 1
fi

# --- settings ---
if [ -z "${PORT:-}" ] && [ -f .env ]; then
  PORT=$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d "\"' \r")
fi
PORT=${PORT:-3000}
export PORT
URL="http://localhost:$PORT"

if [ ! -f .env ]; then
  echo "⚠️  No .env file: cloud models are off. To enable them: cp .env.example .env, then add your key."
fi

open_browser() {
  [ "$OPEN_BROWSER" = 1 ] || return 0
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  else
    echo "Open $URL in your browser."
  fi
}
is_tiny_town() { curl -fsS -m 2 "$URL/api/version" 2>/dev/null | grep -q '"version"'; }
port_pid() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
  else
    ss -ltnpH "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n 1
  fi
}

# --- already running? ---
if is_tiny_town; then
  if [ "$RESTART" = 1 ]; then
    PID=$(port_pid)
    if [ -z "$PID" ]; then
      echo "❌ Tiny Town is running on port $PORT, but its process could not be found. Stop it manually." >&2
      exit 1
    fi
    echo "🔄 Stopping the running server (pid $PID)..."
    kill "$PID"
    for _ in $(seq 1 20); do is_tiny_town || break; sleep 0.25; done
  else
    echo "✅ Tiny Town is already running at $URL (use --restart to restart it)."
    open_browser
    exit 0
  fi
elif [ -n "$(port_pid)" ]; then
  echo "❌ Port $PORT is used by another program. Try: PORT=4000 ./run.sh" >&2
  exit 1
fi

# --- Ollama (optional, for local models) ---
OLLAMA_URL_CHECK=$(sed -n 's/^[[:space:]]*OLLAMA_URL[[:space:]]*=[[:space:]]*//p' .env 2>/dev/null | tail -n 1 | tr -d "\"' \r")
OLLAMA_URL_CHECK=${OLLAMA_URL:-${OLLAMA_URL_CHECK:-http://localhost:11434}}
if curl -fsS -m 2 "$OLLAMA_URL_CHECK/api/tags" >/dev/null 2>&1; then
  echo "🖥️  Ollama is running: local models are available."
elif command -v ollama >/dev/null 2>&1; then
  echo "🖥️  Starting Ollama..."
  mkdir -p logs
  nohup ollama serve >> logs/ollama.log 2>&1 &
  for _ in $(seq 1 20); do
    curl -fsS -m 1 "$OLLAMA_URL_CHECK/api/tags" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fsS -m 1 "$OLLAMA_URL_CHECK/api/tags" >/dev/null 2>&1 \
    || echo "⚠️  Ollama did not start: local models will be missing (see logs/ollama.log)."
else
  echo "ℹ️  Ollama is not installed: only cloud models will be available."
fi

# --- open the browser once the server answers, then run it in the foreground ---
(
  for _ in $(seq 1 40); do
    if is_tiny_town; then open_browser; exit 0; fi
    sleep 0.25
  done
) &

echo "🏘️  Starting Tiny Town at $URL (Ctrl+C to stop)"
exec node server.js
