# SplitLens (local desktop)

Budgeting + expense tracker with Splitwise import and local-only parser/classifier backends.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Models** to configure parsers.

## Tauri desktop

```bash
npm run tauri:dev
```

This opens SplitLens in a native Tauri window on Linux while running the existing local Next.js server. The app data stays in `data/splitlens.local.sqlite`; local model calls go to Ollama on `localhost`, and merchant classification can use the bundled random-forest sidecar on `localhost`.

Production Tauri packaging is scaffolded but not finished yet. Tauri production builds require static frontend assets, while SplitLens still uses Next route handlers for local database access, statement parsing, model status, Splitwise import, and reconciliation. Those handlers should move into Tauri/Rust commands before `npm run tauri:build` becomes the final distributable path.

## Pipeline architecture

SplitLens separates **parsing** from **local model inference**:

```
PDF → text extraction (pdf-parse)
    → transaction extraction (regex | Ollama)
    → category classification (regex | Ollama | random forest)
    → review → dashboard
```

You choose extraction and categorization **independently** in `/settings`.

| Stage | Default | Optional |
|-------|---------|----------|
| Extraction | Regex (built-in) | Ollama (`qwen2.5:0.5b`) |
| Categorization | Regex keywords | Ollama, random forest sidecar |

Prompts live in `src/lib/pipeline/prompts.ts`. The app builds structured JSON prompts; backends only infer.

## Optional bundles (download separately)

| Bundle | Install |
|--------|---------|
| **Core** | Included — regex extraction + keyword categories |
| **Ollama** | `ollama pull qwen2.5:0.5b` or `./scripts/install-ollama-model.sh` |
| **Random forest** | `packages/random-forest-sidecar` — `python server.py` on port 8765 |

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

Local SQLite database: `data/splitlens.local.sqlite` (gitignored). SplitLens writes this file and local backups with owner-only permissions (`0600`) on Linux/macOS filesystems. Existing `data/splitlens.local.json` data is imported into SQLite on first run.

Use **Models → Local data** to export the database, create a local backup, or restore from a backup. Manual backups are written to `data/backups/`; restore automatically creates a backup of the current database first.

Backup options:

- Plain JSON/CSV exports are readable by anyone who can access the file.
- Encrypted `.splitlens-backup` files use your chosen password with scrypt + AES-256-GCM. SplitLens does not generate or store this backup password, so the same password is required to restore later.
- Use a long password you can keep. Lost encrypted-backup passwords cannot be recovered.

The app also has a local unlock gate. On first use, create an app password; after that, SplitLens asks for that password before opening local DB-backed features in a browser session. Current limitation: the SQLite file is permission-hardened but not SQLCipher-encrypted at rest yet.

Parser diagnostics are stored in the `statement_parse_debug` table and shown on each statement review page.

Statement imports support PDF/image extraction plus structured CSV/OFX/QFX files. CSV/OFX/QFX is preferred when your card issuer provides it because it avoids brittle PDF text parsing.

Merchant rules in **Settings → Merchant rules** override imported categories locally, for example always categorizing a recurring merchant or marking a merchant as a payment.

## Verification

```bash
npm run test
npm run typecheck
npm run build
cd src-tauri && cargo check
```

## Key paths

- `src/lib/pipeline/` — orchestrator, providers, prompts
- `src/app/settings/` — model configuration UI
- `packages/random-forest-sidecar/` — optional classifier service
- `src-tauri/` — Tauri desktop shell
- `schema/local-data-schema.md` — local JSON table list

## Legacy cloud app

The old Supabase/Groq version has been archived at `../legacy-online`. The local app does not require Supabase, Groq, Gemini, or any cloud API keys.
