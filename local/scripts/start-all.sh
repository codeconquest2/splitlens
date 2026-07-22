#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RF_DIR="$ROOT/packages/random-forest-sidecar"
RF_PID_FILE="$RF_DIR/.sidecar.pid"
LOG_DIR="$ROOT/.logs"

mkdir -p "$LOG_DIR"

find_python() {
  for candidate in python3.12 python3.11 python3.10; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

stop_sidecar() {
  if [[ -f "$RF_PID_FILE" ]]; then
    pid="$(cat "$RF_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "Stopped random forest sidecar (pid $pid)"
    fi
    rm -f "$RF_PID_FILE"
  fi
}

start_sidecar() {
  if [[ ! -f "$RF_DIR/server.py" ]]; then
    echo "Random forest sidecar not found, skipping."
    return 0
  fi

  if ! PYTHON="$(find_python)"; then
    echo "Python 3.10–3.12 not found — random forest sidecar skipped (regex/Ollama still work)."
    return 0
  fi

  if [[ ! -d "$RF_DIR/.venv" ]]; then
    echo "Setting up random forest venv (first run)..."
    "$PYTHON" -m venv "$RF_DIR/.venv"
  fi

  # shellcheck disable=SC1091
  source "$RF_DIR/.venv/bin/activate"
  python -m pip install --upgrade pip wheel
  python -m pip install -r "$RF_DIR/requirements.txt"

  cd "$RF_DIR"
  nohup python server.py >"$LOG_DIR/random-forest.log" 2>&1 &
  echo $! >"$RF_PID_FILE"
  echo "Random forest sidecar started (pid $(cat "$RF_PID_FILE"))"
}

cleanup() {
  stop_sidecar
}
trap cleanup EXIT INT TERM

stop_sidecar
start_sidecar

echo ""
echo "Starting SplitLens at http://localhost:3000"
echo "Auto backends: regex (built-in) · Ollama (if running) · random forest (sidecar)"
echo ""

cd "$ROOT"
exec npm run dev:app
