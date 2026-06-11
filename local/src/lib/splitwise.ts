export interface SplitwiseImportRow {
  date: string;
  description: string;
  category: string;
  total_amount: number;
  currency: string;
  your_share: number;
  type: "owe" | "owed";
}

const categoryMap: Record<string, string> = {
  groceries: "Groceries",
  grocery: "Groceries",
  food: "Dining",
  dining: "Dining",
  restaurant: "Dining",
  transport: "Transport",
  transportation: "Transport",
  travel: "Travel",
  shopping: "Shopping",
  utilities: "Utilities",
  utility: "Utilities",
  health: "Health",
  entertainment: "Entertainment"
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeAmount(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) {
    return 0;
  }

  return Math.abs(Number(cleaned.replace(/[()]/g, "").replace(/^-/, "")));
}

function parseSplitwiseDate(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function mapCategory(value: string) {
  const normalized = value.trim().toLowerCase();
  return categoryMap[normalized] ?? "Other";
}

export function parseSplitwiseCsv(csvText: string): SplitwiseImportRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header.replace(/^"|"$/g, ""), index]));

  return lines.slice(1).flatMap((line) => {
    const columns = parseCsvLine(line);
    const totalAmount = normalizeAmount(columns[headerIndex.Cost] ?? "");

    if (!totalAmount) {
      return [];
    }

    const oweAmount = normalizeAmount(columns[headerIndex["You owe"]] ?? "");
    const owedAmount = normalizeAmount(columns[headerIndex["You are owed"]] ?? "");

    return [
      {
        date: parseSplitwiseDate(columns[headerIndex.Date] ?? ""),
        description: columns[headerIndex.Description] ?? "",
        category: mapCategory(columns[headerIndex.Category] ?? ""),
        total_amount: totalAmount,
        currency: (columns[headerIndex.Currency] ?? "USD").trim() || "USD",
        your_share: owedAmount > 0 ? owedAmount : oweAmount,
        type: owedAmount > 0 ? "owed" : "owe"
      }
    ];
  });
}
