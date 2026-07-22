export const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Utilities",
  "Health",
  "Travel",
  "Entertainment",
  "Other"
] as const;

export function buildImageExtractionPrompt(currency: string) {
  return `You extract credit card transactions from this bank statement image.

Return ONLY valid JSON with this shape:
{"transactions":[{"date":"YYYY-MM-DD","merchant":"string","amount":number,"is_payment":boolean}]}

Rules:
- read every transaction row visible in the image
- date must be ISO YYYY-MM-DD (infer year from statement if missing)
- amount is always positive; set is_payment true for payments, refunds, credits, autopay
- merchant is the cleaned payee name
- currency is ${currency}
- skip headers, balances, summaries, and duplicate rows
- if unsure about a row, omit it`;
}

export function buildExtractionPrompt(statementText: string, currency: string) {
  const truncated = statementText.slice(0, 12000);
  return `You extract credit card transactions from bank statement text.

Return ONLY valid JSON with this shape:
{"transactions":[{"date":"YYYY-MM-DD","merchant":"string","amount":number,"is_payment":boolean}]}

Rules:
- date must be ISO YYYY-MM-DD
- amount is always positive; set is_payment true for payments, refunds, credits, autopay
- merchant is the cleaned payee name
- currency is ${currency}
- skip headers, balances, summaries, and duplicate rows
- if unsure, omit the row

Statement text:
${truncated}`;
}

export function buildCategorizationPrompt(merchants: string[]) {
  return `Classify each merchant into exactly one category from this list:
${CATEGORIES.join(", ")}

Return ONLY valid JSON:
{"categories":["Category", "..."]}

The categories array must have the same length and order as the merchants list.

Merchants:
${merchants.map((merchant, index) => `${index + 1}. ${merchant}`).join("\n")}`;
}

export function buildSingleCategorizationPrompt(merchant: string) {
  return `Classify this merchant into exactly one category from: ${CATEGORIES.join(", ")}.

Return ONLY valid JSON: {"category":"Category"}

Merchant: ${merchant}`;
}
