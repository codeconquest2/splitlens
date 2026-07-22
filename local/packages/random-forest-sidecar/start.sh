#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VENV="$ROOT/.venv"
PORT="${PORT:-8765}"

find_python() {
  local candidate version major minor
  for candidate in python3.12 python3.11 python3.10; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done

  if command -v python3 >/dev/null 2>&1; then
    version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    major="${version%%.*}"
    minor="${version#*.}"
    if (( major == 3 && minor >= 10 && minor <= 12 )); then
      echo "python3"
      return 0
    fi
  fi

  return 1
}

if ! PYTHON="$(find_python)"; then
  echo "Python 3.10–3.12 is required to load transaction_classifier.pkl (scikit-learn 1.6.1)."
  echo "Python 3.13+ is not supported yet for this model."
  echo ""
  echo "On Fedora:"
  echo "  sudo dnf install python3.12 python3.12-devel"
  echo ""
  echo "Then re-run: ./start.sh"
  exit 1
fi

echo "Using $PYTHON ($("$PYTHON" --version))"

if [[ ! -d "$VENV" ]]; then
  echo "Creating virtualenv at $VENV"
  "$PYTHON" -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

python -m pip install --upgrade pip wheel >/dev/null
echo "Installing dependencies (scikit-learn 1.6.1 for transaction_classifier.pkl)..."
python -m pip install -r requirements.txt

if [[ -f "$ROOT/transaction_classifier.pkl" ]]; then
  echo "Found transaction_classifier.pkl"
elif [[ -f "$ROOT/model.pkl" ]]; then
  echo "Found model.pkl"
else
  echo "No .pkl model found — sidecar will use keyword fallback until you add one."
fi

echo "Verifying model load..."
python - <<PY
from pathlib import Path
import joblib

sidecar_dir = Path("${ROOT}")
for name in ("transaction_classifier.pkl", "model.pkl"):
    path = sidecar_dir / name
    if not path.exists():
        continue
    model = joblib.load(path)
    sample = model.predict(["Starbucks", "Whole Foods", "Uber"])
    print(f"Loaded {name} -> sample predictions: {list(sample)}")
    break
else:
    print("Keyword fallback mode (no model file).")
PY

echo ""
echo "Starting random forest sidecar on http://localhost:${PORT}"
echo "Configure SplitLens → Models → Random forest sidecar → http://localhost:${PORT}"
echo ""

export FLASK_RUN_PORT="$PORT"
exec python server.py
