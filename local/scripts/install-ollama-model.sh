#!/usr/bin/env bash
set -euo pipefail

TEXT_MODEL="${1:-qwen2.5:0.5b}"
VISION_MODEL="${2:-moondream}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama is not installed. Get it from https://ollama.com"
  exit 1
fi

echo "Pulling text model ${TEXT_MODEL}..."
ollama pull "${TEXT_MODEL}"

echo "Pulling vision model ${VISION_MODEL}..."
ollama pull "${VISION_MODEL}"

echo "Done."
echo "  PDF/text extraction + categorization: ${TEXT_MODEL}"
echo "  Image statement extraction: ${VISION_MODEL}"
echo "Enable providers in SplitLens → Models."
