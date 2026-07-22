export interface SplitwisePersonBalance {
  name: string;
  net: number;
}

export interface SplitwiseImportRow {
  date: string;
  description: string;
  category: string;
  total_amount: number;
  currency: string;
  your_share: number;
  type: "owe" | "owed";
  person_balances: SplitwisePersonBalance[];
  your_net: number;
  payer_name: string | null;
  is_payment: boolean;
}

export interface SplitwiseParseResult {
  rows: SplitwiseImportRow[];
  member_names: string[];
  format: "group" | "personal";
}

const STANDARD_COLUMNS = new Set([
  "date",
  "description",
  "category",
  "cost",
  "currency",
  "notes",
  "note"
]);

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
  entertainment: "Entertainment",
  general: "Other",
  home: "Home",
  rent: "Home"
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

function normalizeHeader(header: string) {
  return header.replace(/^"|"$/g, "").trim();
}

function normalizeAmount(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) {
    return 0;
  }

  const isNegative = cleaned.includes("(") || cleaned.startsWith("-");
  const numeric = Number(cleaned.replace(/[()]/g, "").replace(/^-/, ""));
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return isNegative ? -numeric : numeric;
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

function isSummaryRow(description: string, category: string) {
  const normalized = description.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "total balance" ||
    normalized.startsWith("total balance") ||
    (category.trim().toLowerCase() === "payment" && normalized.includes("paid"))
  );
}

function isPaymentRow(description: string, category: string) {
  const normalizedDescription = description.trim().toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();
  return normalizedCategory === "payment" || normalizedDescription.includes("settlement");
}

function findPayerName(balances: SplitwisePersonBalance[]) {
  const payers = balances.filter((entry) => entry.net > 0.001);
  if (payers.length === 1) {
    return payers[0].name;
  }

  if (payers.length > 1) {
    return payers.sort((left, right) => right.net - left.net)[0].name;
  }

  return null;
}

function parseGroupFormat(
  lines: string[],
  headerIndex: Record<string, number>,
  headers: string[]
): SplitwiseParseResult {
  const personColumns = headers
    .map(normalizeHeader)
    .filter((header) => header && !STANDARD_COLUMNS.has(header.toLowerCase()));

  const memberNames = personColumns.filter(Boolean);
  const rows: SplitwiseImportRow[] = [];

  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    const description = columns[headerIndex.Description] ?? "";
    const category = columns[headerIndex.Category] ?? "";
    const totalAmount = Math.abs(normalizeAmount(columns[headerIndex.Cost] ?? ""));

    if (!totalAmount || isSummaryRow(description, category)) {
      continue;
    }

    const personBalances = personColumns.map((name) => ({
      name,
      net: normalizeAmount(columns[headerIndex[name]] ?? "")
    }));

    const payerName = findPayerName(personBalances);
    const isPayment = isPaymentRow(description, category);

    rows.push({
      date: parseSplitwiseDate(columns[headerIndex.Date] ?? ""),
      description,
      category: mapCategory(category),
      total_amount: totalAmount,
      currency: (columns[headerIndex.Currency] ?? "USD").trim() || "USD",
      your_share: 0,
      type: "owe",
      person_balances: personBalances,
      your_net: 0,
      payer_name: payerName,
      is_payment: isPayment
    });
  }

  return { rows, member_names: memberNames, format: "group" };
}

function parsePersonalFormat(
  lines: string[],
  headerIndex: Record<string, number>
): SplitwiseParseResult {
  const rows: SplitwiseImportRow[] = [];

  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    const totalAmount = Math.abs(normalizeAmount(columns[headerIndex.Cost] ?? ""));

    if (!totalAmount) {
      continue;
    }

    const oweAmount = Math.abs(normalizeAmount(columns[headerIndex["You owe"]] ?? ""));
    const owedAmount = Math.abs(normalizeAmount(columns[headerIndex["You are owed"]] ?? ""));
    const yourShare = owedAmount > 0 ? owedAmount : oweAmount;
    const type = owedAmount > 0 ? "owed" : "owe";
    const yourNet = type === "owed" ? yourShare : -yourShare;

    rows.push({
      date: parseSplitwiseDate(columns[headerIndex.Date] ?? ""),
      description: columns[headerIndex.Description] ?? "",
      category: mapCategory(columns[headerIndex.Category] ?? ""),
      total_amount: totalAmount,
      currency: (columns[headerIndex.Currency] ?? "USD").trim() || "USD",
      your_share: yourShare,
      type,
      person_balances: [],
      your_net: yourNet,
      payer_name: type === "owed" ? "You" : null,
      is_payment: false
    });
  }

  return { rows, member_names: [], format: "personal" };
}

export function parseSplitwiseCsv(csvText: string): SplitwiseParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return { rows: [], member_names: [], format: "personal" };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

  const hasPersonalColumns = "You owe" in headerIndex || "You are owed" in headerIndex;
  const hasGroupColumns = headers.some((header) => header && !STANDARD_COLUMNS.has(header.toLowerCase()));

  if (hasGroupColumns && !hasPersonalColumns) {
    return parseGroupFormat(lines, headerIndex, headers);
  }

  return parsePersonalFormat(lines, headerIndex);
}

export function resolveYourName(memberNames: string[], profileName?: string | null) {
  if (!memberNames.length) {
    return profileName?.trim() || "";
  }

  if (profileName) {
    const normalizedProfile = profileName.trim().toLowerCase();
    const exactMatch = memberNames.find((name) => name.toLowerCase() === normalizedProfile);
    if (exactMatch) {
      return exactMatch;
    }

    const partialMatch = memberNames.find(
      (name) =>
        name.toLowerCase().includes(normalizedProfile) || normalizedProfile.includes(name.toLowerCase())
    );
    if (partialMatch) {
      return partialMatch;
    }
  }

  return memberNames[0] ?? "";
}

export function getMemberShare(row: SplitwiseImportRow, memberName: string) {
  if (!row.person_balances.length) {
    return {
      your_net: row.your_net,
      your_share: row.your_share,
      type: row.type
    };
  }

  const entry = row.person_balances.find((person) => person.name === memberName);
  const yourNet = entry?.net ?? 0;
  return {
    your_net: yourNet,
    your_share: Math.abs(yourNet),
    type: yourNet >= 0 ? ("owed" as const) : ("owe" as const)
  };
}

export function withMemberContext(
  rows: SplitwiseImportRow[],
  memberName: string
): SplitwiseImportRow[] {
  return rows.map((row) => {
    const share = getMemberShare(row, memberName);
    return {
      ...row,
      your_net: share.your_net,
      your_share: share.your_share,
      type: share.type
    };
  });
}
