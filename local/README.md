# SplitLens (local)

Budgeting + expense tracker with Splitwise import and pluggable AI/classifier backends.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Models** to configure parsers.

## Pipeline architecture

SplitLens separates **parsing** from **model inference**:

```
PDF → text extraction (pdf-parse)
    → transaction extraction (regex | Ollama | custom LLM)
    → category classification (regex | Ollama | random forest | custom LLM)
    → review → dashboard
```

You choose extraction and categorization **independently** in `/settings`.

| Stage | Default | Optional |
|-------|---------|----------|
| Extraction | Regex (built-in) | Ollama (`qwen2.5:0.5b`), custom OpenAI-compatible API |
| Categorization | Regex keywords | Ollama, random forest sidecar, custom LLM |

Prompts live in `src/lib/pipeline/prompts.ts`. The app builds structured JSON prompts; backends only infer.

## Optional bundles (download separately)

| Bundle | Install |
|--------|---------|
| **Core** | Included — regex extraction + keyword categories |
| **Ollama** | `ollama pull qwen2.5:0.5b` or `./scripts/install-ollama-model.sh` |
| **Random forest** | `packages/random-forest-sidecar` — `python server.py` on port 8765 |
| **Custom LLM** | Set base URL + model in Settings (any `/v1/chat/completions` API) |

Mark bundles as installed in **Models** after setup.

## Recommended local setup (Ollama)

```bash
./scripts/install-ollama-model.sh
# pulls qwen2.5:0.5b (text) + moondream (vision)
```

In SplitLens → **Models**:
- Extraction: `Ollama` for PDFs (LLM) or keep `Regex` for speed
- Image uploads (PNG/JPEG): set extraction to `Ollama` — uses **moondream** vision model
- Categorization: `Ollama` with `qwen2.5:0.5b`, or your random forest sidecar when ready

## Data

Local JSON database: `data/splitlens.local.json` (gitignored).

## Key paths

- `src/lib/pipeline/` — orchestrator, providers, prompts
- `src/app/settings/` — model configuration UI
- `packages/random-forest-sidecar/` — optional classifier service
