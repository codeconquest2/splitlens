import type { ParsedTransaction } from "@/lib/types";

const monthNames: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

const ignoredLinePatterns = [
  /^(date|transaction|description|merchant|amount|balance|debit|credit)\b/i,
  /\b(statement|account|opening balance|closing balance|payment due|minimum payment)\b/i,
  /^\s*page\s+\d+/i
];

function normalizeDate(rawDate: string) {
  const trimmed = rawDate.replace(/,/g, "").trim();
  const currentYear = String(new Date().getFullYear());

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slashMatch) {
    const [, month, day, year = currentYear] = slashMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const wordMonthMatch = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
  if (wordMonthMatch) {
    const [, monthName, day, year = currentYear] = wordMonthMatch;
    const month = monthNames[monthName.slice(0, 3).toLowerCase()];
    if (month) {
      const normalizedYear = year.length === 2 ? `20${year}` : year;
      return `${normalizedYear}-${month}-${day.padStart(2, "0")}`;
    }
  }

  return "";
}

function normalizeAmount(rawAmount: string) {
  const isNegative = rawAmount.includes("(") || rawAmount.trim().startsWith("-");
  const cleaned = rawAmount.replace(/[,$()]/g, "").trim();
  const amount = Number(cleaned.replace(/^-/, ""));
  if (!Number.isFinite(amount)) return null;
  return Math.abs(isNegative ? -amount : amount);
}

function cleanMerchant(rawMerchant: string) {
  return rawMerchant
    .replace(/\s{2,}/g, " ")
    .replace(/\b(card|purchase|pos|debit|credit|online|transaction)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseTransactionLine(line: string, currency: string): ParsedTransaction | null {
  if (ignoredLinePatterns.some((pattern) => pattern.test(line))) return null;

  const dateAtStart =
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2}(?:,?\s+\d{2,4})?)\s+(.+)$/;
  const dateMatch = line.match(dateAtStart);
  if (!dateMatch) return null;

  const amountAtEnd = /(-?\(?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?|-?\(?\$?\d+\.\d{2}\)?)\s*$/;
  const amountMatch = dateMatch[2].match(amountAtEnd);
  if (!amountMatch) return null;

  const date = normalizeDate(dateMatch[1]);
  const amount = normalizeAmount(amountMatch[1]);
  const merchant = cleanMerchant(dateMatch[2].slice(0, amountMatch.index).trim());

  if (!date || amount === null || !merchant || /balance/i.test(merchant)) {
    return null;
  }

  return {
    date,
    merchant,
    amount,
    currency
  };
}

export async function parseStatement(text: string, currency: string): Promise<ParsedTransaction[]> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const transactions: ParsedTransaction[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const transaction = parseTransactionLine(line, currency);
    if (!transaction) continue;

    const key = `${transaction.date}|${transaction.merchant}|${transaction.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    transactions.push(transaction);
  }

  return transactions;
}

export async function parseStatementImage(
  _base64: string,
  _mimeType: string,
  _currency: string
): Promise<ParsedTransaction[]> {
  return [];
}
