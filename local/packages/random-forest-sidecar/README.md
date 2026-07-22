# Random forest categorizer sidecar

Optional downloadable component for SplitLens. The main app sends merchant names here; the sidecar returns categories.

## API

### `GET /health`

```json
{ "status": "ok", "model": "merchant-rf-v1" }
```

### `POST /categorize`

Request:

```json
{ "merchants": ["Whole Foods", "Uber Trip"] }
```

Response:

```json
{ "categories": ["Groceries", "Transport"] }
```

Categories must be one of: Groceries, Dining, Transport, Shopping, Utilities, Health, Travel, Entertainment, Other.

## Run locally

```bash
cd packages/random-forest-sidecar
./start.sh
```

The script creates a `.venv`, installs scikit-learn 1.6.1 (matches `transaction_classifier.pkl`), verifies the model loads, and starts the server on port 8765.

**Requires Python 3.10–3.12** (the model was trained with scikit-learn 1.6.1). On Fedora:

```bash
sudo dnf install python3.12 python3.12-devel
./start.sh
```

Default URL: `http://localhost:8765` (configure in SplitLens → Models).

## Train your own model

Place your trained classifier at `transaction_classifier.pkl` (preferred) or `model.pkl` in this directory. The sidecar loads it on startup; otherwise it falls back to keyword rules.
