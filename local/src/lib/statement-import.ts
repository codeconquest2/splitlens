import { looksLikePayment } from "@/lib/spending";
import type { ParsedTransaction } from "@/lib/types";

export interface SkippedImportRow {
  line: number;
  raw: string;
  reason: string;
}

export interface StructuredImportResult {
  transactions: ParsedTransaction[];
  rawText: string;
  warnings: string[];
  skippedRows: SkippedImportRow[];
  format: "csv" | "ofx";
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseDate(value: string) {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const ofx = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;
  return "";
}

function parseMoney(value: string) {
  if (!value.trim()) return null;
  const negative = value.includes("(") || value.trim().startsWith("-");
  const amount = Number(value.replace(/[,$()]/g, "").replace(/^-/, "").trim());
  if (!Number.isFinite(amount)) return null;
  return { amount: Math.abs(amount), negative };
}

function valueFor(row: Record<string, string>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function parseCsv(text: string, currency: string): StructuredImportResult {
  const rows = parseCsvRows(text);
  const skippedRows: SkippedImportRow[] = [];
  const [headers = [], ...body] = rows;
  const normalizedHeaders = headers.map(normalizeHeader);
  const transactions: ParsedTransaction[] = [];

  body.forEach((cells, index) => {
    const record = Object.fromEntries(normalizedHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const raw = cells.join(",");
    const date = parseDate(valueFor(record, ["date", "transaction_date", "posted_date", "post_date"]));
    const merchant = valueFor(record, ["merchant", "description", "name", "payee", "memo"]).trim();
    const amountValue =
      parseMoney(valueFor(record, ["amount", "transaction_amount"])) ??
      parseMoney(valueFor(record, ["debit", "withdrawal", "charge"])) ??
      parseMoney(valueFor(record, ["credit", "deposit", "payment"]));

    if (!date || !merchant || !amountValue) {
      skippedRows.push({ line: index + 2, raw, reason: "Missing date, merchant, or amount." });
      return;
    }

    const sourceAmount = valueFor(record, ["amount", "transaction_amount"]);
    const creditAmount = valueFor(record, ["credit", "deposit", "payment"]);
    const isPayment = Boolean(creditAmount && !sourceAmount) || amountValue.negative || looksLikePayment(merchant);
    transactions.push({
      date,
      merchant,
      amount: amountValue.amount,
      currency,
      is_payment: isPayment
    });
  });

  return {
    transactions,
    rawText: text,
    warnings: skippedRows.length ? [`Skipped ${skippedRows.length} CSV row(s).`] : [],
    skippedRows,
    format: "csv"
  };
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseOfx(text: string, currency: string): StructuredImportResult {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CREDITCARDMSGSRSV1>|$)/gi) ?? [];
  const transactions: ParsedTransaction[] = [];
  const skippedRows: SkippedImportRow[] = [];

  blocks.forEach((block, index) => {
    const date = parseDate(tagValue(block, "DTPOSTED") || tagValue(block, "DTUSER"));
    const merchant = tagValue(block, "NAME") || tagValue(block, "MEMO") || "Imported transaction";
    const amount = parseMoney(tagValue(block, "TRNAMT"));
    if (!date || !amount) {
      skippedRows.push({ line: index + 1, raw: block.slice(0, 160), reason: "Missing OFX date or amount." });
      return;
    }
    transactions.push({
      date,
      merchant,
      amount: amount.amount,
      currency,
      is_payment: amount.negative || looksLikePayment(merchant)
    });
  });

  return {
    transactions,
    rawText: text,
    warnings: skippedRows.length ? [`Skipped ${skippedRows.length} OFX transaction(s).`] : [],
    skippedRows,
    format: "ofx"
  };
}

export function parseStructuredStatement(buffer: Buffer, filename: string, mimeType: string, currency: string) {
  const text = buffer.toString("utf8");
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (mimeType.includes("csv") || extension === "csv") {
    return parseCsv(text, currency);
  }
  if (extension === "ofx" || extension === "qfx" || /<OFX>|<STMTTRN>/i.test(text)) {
    return parseOfx(text, currency);
  }
  return null;
}
