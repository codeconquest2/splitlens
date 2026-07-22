from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)

CATEGORIES = [
    "Groceries",
    "Dining",
    "Transport",
    "Shopping",
    "Utilities",
    "Health",
    "Travel",
    "Entertainment",
    "Other",
]

KEYWORDS = {
    "Groceries": ["whole foods", "trader joe", "costco", "walmart", "kroger"],
    "Dining": ["starbucks", "chipotle", "restaurant", "cafe", "doordash"],
    "Transport": ["uber", "lyft", "shell", "chevron", "parking"],
    "Shopping": ["amazon", "target", "best buy", "ikea"],
    "Utilities": ["verizon", "comcast", "electric", "internet"],
    "Health": ["cvs", "walgreens", "pharmacy", "gym"],
    "Travel": ["airbnb", "hotel", "delta", "united"],
    "Entertainment": ["netflix", "spotify", "cinema"],
}

MODEL_NAME = "keyword-fallback"
model = None


def load_model():
    global model, MODEL_NAME
    sidecar_dir = Path(__file__).parent
    for filename in ("transaction_classifier.pkl", "model.pkl"):
        model_path = sidecar_dir / filename
        if model_path.exists():
            import joblib

            model = joblib.load(model_path)
            MODEL_NAME = filename.replace(".pkl", "")
            return

    model = None
    MODEL_NAME = "keyword-fallback"


def classify_keyword(merchant: str) -> str:
    normalized = merchant.lower()
    for category, words in KEYWORDS.items():
        if any(word in normalized for word in words):
            return category
    return "Other"


def classify_merchant(merchant: str) -> str:
    if model is not None:
        try:
            return str(model.predict([merchant])[0])
        except Exception:
            pass
    return classify_keyword(merchant)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME})


@app.post("/categorize")
def categorize():
    payload = request.get_json(force=True)
    merchants = payload.get("merchants", [])
    categories = [classify_merchant(merchant) for merchant in merchants]
    return jsonify({"categories": categories})


if __name__ == "__main__":
    import os

    load_model()
    port = int(os.environ.get("PORT", os.environ.get("FLASK_RUN_PORT", 8765)))
    app.run(host="0.0.0.0", port=port)
