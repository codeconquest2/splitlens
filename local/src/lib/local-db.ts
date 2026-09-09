import { access, chmod, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { encryptBackupPayload } from "@/lib/local-backup-crypto";

type Row = Record<string, any>;
type FilterOperator = "eq" | "gte" | "lt" | "in";

export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: any;
}

export interface QueryOrder {
  column: string;
  ascending: boolean;
}

export interface LocalQuery {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  payload?: Row | Row[];
  filters?: QueryFilter[];
  orders?: QueryOrder[];
  single?: boolean;
  maybeSingle?: boolean;
  limit?: number;
}

interface LocalDatabase {
  profiles: Row[];
  contacts: Row[];
  groups: Row[];
  group_members: Row[];
  statements: Row[];
  transactions: Row[];
  budgets: Row[];
  manual_expenses: Row[];
  shared_expenses: Row[];
  expense_splits: Row[];
  model_settings: Row[];
  statement_parse_debug: Row[];
  security_settings: Row[];
  import_batches: Row[];
  category_rules: Row[];
}

const localUser = {
  id: "local-user",
  email: "local@splitlens.test",
  user_metadata: { name: "Local User" }
};

const dataDir = process.env.SPLITLENS_DATA_DIR || path.join(process.cwd(), "data");
const legacyJsonPath = path.join(dataDir, "splitlens.local.json");
const dbPath = path.join(dataDir, "splitlens.local.sqlite");
const backupDir = path.join(dataDir, "backups");
let writeQueue: Promise<{ data: any; error: any }> = Promise.resolve({ data: null, error: null });

const tableNames = [
  "profiles",
  "contacts",
  "groups",
  "group_members",
  "statements",
  "transactions",
  "budgets",
  "manual_expenses",
  "shared_expenses",
  "expense_splits",
  "model_settings",
  "statement_parse_debug",
  "security_settings",
  "import_batches",
  "category_rules"
] as const;

const actions = ["select", "insert", "update", "delete", "upsert"] as const;
const filterOperators = ["eq", "gte", "lt", "in"] as const;
const identifierPattern = /^[a-z_][a-z0-9_]*$/;

async function chmodOwnerOnly(filePath: string) {
  try {
    await chmod(filePath, 0o600);
  } catch {
    // Some filesystems do not support POSIX file modes.
  }
}

async function secureBackupDirectory() {
  await mkdir(backupDir, { recursive: true });
  const entries = await readdir(backupDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => chmodOwnerOnly(path.join(backupDir, entry.name)))
  );
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function emptyDatabase(): LocalDatabase {
  return {
    profiles: [
      {
        id: localUser.id,
        name: "Local User",
        email: localUser.email,
        preferred_currency: "USD",
        created_at: new Date().toISOString()
      }
    ],
    contacts: [],
    groups: [],
    group_members: [],
    statements: [],
    transactions: [],
    budgets: [],
    manual_expenses: [],
    shared_expenses: [],
    expense_splits: [],
    model_settings: [],
    statement_parse_debug: [],
    security_settings: [],
    import_batches: [],
    category_rules: []
  };
}

async function readDatabase(): Promise<LocalDatabase> {
  await mkdir(dataDir, { recursive: true });

  try {
    await ensureSqliteDatabase();
    return readSqliteDatabase();
  } catch {
    const database = emptyDatabase();
    await writeDatabase(database);
    return database;
  }
}

async function writeDatabase(database: LocalDatabase) {
  await mkdir(dataDir, { recursive: true });
  await ensureSqliteDatabase();
  const sqlite = openSqliteDatabase();
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.prepare("DELETE FROM local_records").run();
    const insert = sqlite.prepare(
      "INSERT INTO local_records (table_name, row_id, payload, updated_at) VALUES (?, ?, ?, ?)"
    );
    const now = new Date().toISOString();
    for (const tableName of tableNames) {
      for (const row of database[tableName]) {
        const rowId = String(row.id ?? crypto.randomUUID());
        insert.run(tableName, rowId, JSON.stringify({ ...row, id: rowId }), now);
      }
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
  }
  await chmodOwnerOnly(dbPath);
}

function openSqliteDatabase() {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS local_records (
      table_name TEXT NOT NULL,
      row_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (table_name, row_id)
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_local_records_table ON local_records (table_name)");
  return sqlite;
}

async function ensureSqliteDatabase() {
  await mkdir(dataDir, { recursive: true });
  const sqliteAlreadyExists = await fileExists(dbPath);
  const sqlite = openSqliteDatabase();
  try {
    const countRow = sqlite.prepare("SELECT COUNT(*) AS count FROM local_records").get() as { count: number };
    const isEmpty = Number(countRow?.count ?? 0) === 0;
    if (!sqliteAlreadyExists || isEmpty) {
      let database: LocalDatabase | null = null;
      if (existsSync(legacyJsonPath)) {
        try {
          const raw = await readFile(legacyJsonPath, "utf8");
          database = normalizeDatabase(JSON.parse(raw) as Partial<LocalDatabase>);
          await chmodOwnerOnly(legacyJsonPath);
        } catch {
          database = null;
        }
      }
      if (!database) {
        database = emptyDatabase();
      }

      sqlite.exec("BEGIN IMMEDIATE");
      const insert = sqlite.prepare(
        "INSERT OR REPLACE INTO local_records (table_name, row_id, payload, updated_at) VALUES (?, ?, ?, ?)"
      );
      const now = new Date().toISOString();
      for (const tableName of tableNames) {
        for (const row of database[tableName]) {
          const rowId = String(row.id ?? crypto.randomUUID());
          insert.run(tableName, rowId, JSON.stringify({ ...row, id: rowId }), now);
        }
      }
      sqlite.exec("COMMIT");
    }
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
  }
  await chmodOwnerOnly(dbPath);
}

function readSqliteDatabase(): LocalDatabase {
  const sqlite = openSqliteDatabase();
  try {
    const database = emptyDatabase();
    for (const tableName of tableNames) {
      database[tableName] = [];
    }
    const rows = sqlite.prepare("SELECT table_name, payload FROM local_records").all() as Array<{
      table_name: keyof LocalDatabase;
      payload: string;
    }>;
    for (const row of rows) {
      if (tableNames.includes(row.table_name as any)) {
        database[row.table_name].push(JSON.parse(row.payload));
      }
    }
    return normalizeDatabase(database);
  } finally {
    sqlite.close();
  }
}

function normalizeDatabase(database: Partial<LocalDatabase>): LocalDatabase {
  const normalized = database as LocalDatabase;
  for (const tableName of tableNames) {
    if (!Array.isArray(normalized[tableName])) {
      normalized[tableName] = [];
    }
  }
  if (!normalized.profiles.some((profile) => profile.id === localUser.id)) {
    normalized.profiles.push(emptyDatabase().profiles[0]);
  }
  normalized.model_settings = normalized.model_settings.map((settings) => {
    const {
      custom_llm_base_url: _customLlmBaseUrl,
      custom_llm_model: _customLlmModel,
      custom_llm_api_key: _customLlmApiKey,
      ...localSettings
    } = settings;
    return localSettings;
  });
  return normalized;
}

function matchesFilter(row: Row, filter: QueryFilter) {
  const rowValue = row[filter.column];
  if (filter.operator === "eq") return rowValue === filter.value;
  if (filter.operator === "gte") return String(rowValue ?? "") >= String(filter.value ?? "");
  if (filter.operator === "lt") return String(rowValue ?? "") < String(filter.value ?? "");
  if (filter.operator === "in") {
    const values = Array.isArray(filter.value) ? filter.value : [];
    return values.includes(rowValue);
  }
  return true;
}

function applyFilters(rows: Row[], filters: QueryFilter[] = []) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

function applyOrders(rows: Row[], orders: QueryOrder[] = []) {
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const leftValue = left[order.column] ?? "";
      const rightValue = right[order.column] ?? "";
      if (leftValue < rightValue) return order.ascending ? -1 : 1;
      if (leftValue > rightValue) return order.ascending ? 1 : -1;
    }
    return 0;
  });
}

function applyColumns(rows: Row[], columns = "*") {
  if (columns === "*" || !columns.trim()) return rows;
  const selectedColumns = columns.split(",").map((column) => column.trim()).filter(Boolean);
  return rows.map((row) =>
    Object.fromEntries(selectedColumns.map((column) => [column, row[column]]))
  );
}

function addDefaults(table: string, row: Row) {
  const now = new Date().toISOString();
  const next = { ...row };
  next.id ??= crypto.randomUUID();
  next.created_at ??= now;

  if (table === "profiles") next.id ??= localUser.id;
  if (table === "statements") next.status ??= "processing";
  if (table === "transactions") {
    next.currency ??= "USD";
    next.is_shared ??= false;
    next.is_payment ??= false;
  }
  if (table === "budgets") {
    next.planned_amount ??= 0;
    next.currency ??= "USD";
  }
  if (table === "manual_expenses") next.currency ??= "USD";
  if (table === "shared_expenses") {
    next.currency ??= "USD";
    next.paid_by_contact_id ??= null;
  }
  if (table === "expense_splits") next.paid ??= false;

  return next;
}

function tableFor(database: LocalDatabase, table: string): Row[] {
  if (!tableNames.includes(table as any)) {
    throw new Error(`Unknown local table: ${table}`);
  }
  return database[table as keyof LocalDatabase];
}

function validateColumnName(column: unknown, label: string) {
  if (typeof column !== "string" || !identifierPattern.test(column)) {
    throw new Error(`Invalid local query ${label}`);
  }
}

function validatePayload(payload: unknown) {
  if (payload === undefined) return;
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid local query payload");
    }
  }
}

export function validateLocalQuery(query: LocalQuery) {
  if (!query || typeof query !== "object") {
    throw new Error("Invalid local query");
  }
  if (!tableNames.includes(query.table as any)) {
    throw new Error(`Unknown local table: ${query.table}`);
  }
  if (!actions.includes(query.action as any)) {
    throw new Error(`Unsupported local action: ${query.action}`);
  }
  if (query.columns && query.columns !== "*") {
    query.columns.split(",").forEach((column) => validateColumnName(column.trim(), "column"));
  }
  for (const filter of query.filters ?? []) {
    validateColumnName(filter.column, "filter column");
    if (!filterOperators.includes(filter.operator as any)) {
      throw new Error(`Unsupported local filter: ${filter.operator}`);
    }
  }
  for (const order of query.orders ?? []) {
    validateColumnName(order.column, "order column");
    if (typeof order.ascending !== "boolean") {
      throw new Error("Invalid local query order");
    }
  }
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0 || query.limit > 10000)) {
    throw new Error("Invalid local query limit");
  }
  if (query.action !== "select") {
    validatePayload(query.payload);
  }
}

async function executeLocalQuery(query: LocalQuery): Promise<{ data: any; error: any }> {
  validateLocalQuery(query);
  const database = await readDatabase();
  const table = tableFor(database, query.table);
  let data: Row | Row[] | null = null;

  if (query.action === "select") {
    let rows = applyOrders(applyFilters(table, query.filters), query.orders);
    if (query.limit !== undefined && query.limit >= 0) {
      rows = rows.slice(0, query.limit);
    }
    rows = applyColumns(rows, query.columns);
    if (query.single || query.maybeSingle) {
      data = rows[0] ?? null;
    } else {
      data = rows;
    }
  }

  if (query.action === "insert") {
    const rows = (Array.isArray(query.payload) ? query.payload : [query.payload ?? {}]).map((row) =>
      addDefaults(query.table, row)
    );
    table.push(...rows);
    await writeDatabase(database);
    const selected = applyColumns(rows, query.columns);
    data = query.single ? selected[0] ?? null : selected;
  }

  if (query.action === "update") {
    const updated: Row[] = [];
    for (const row of table) {
      if (applyFilters([row], query.filters).length) {
        Object.assign(row, query.payload ?? {});
        updated.push(row);
      }
    }
    await writeDatabase(database);
    const selected = applyColumns(updated, query.columns);
    data = query.single ? selected[0] ?? null : selected;
  }

  if (query.action === "delete") {
    const remaining = table.filter((row) => !applyFilters([row], query.filters).length);
    const deleted = table.filter((row) => applyFilters([row], query.filters).length);
    table.splice(0, table.length, ...remaining);
    await writeDatabase(database);
    data = query.single ? deleted[0] ?? null : deleted;
  }

  if (query.action === "upsert") {
    const rows = Array.isArray(query.payload) ? query.payload : [query.payload ?? {}];
    const saved: Row[] = [];
    for (const incoming of rows) {
      const existing = table.find((row) => row.id === incoming.id);
      if (existing) {
        Object.assign(existing, incoming);
        saved.push(existing);
      } else {
        const next = addDefaults(query.table, incoming);
        table.push(next);
        saved.push(next);
      }
    }
    await writeDatabase(database);
    const selected = applyColumns(saved, query.columns);
    data = query.single ? selected[0] ?? null : selected;
  }

  return { data, error: null };
}

export async function runLocalQuery(query: LocalQuery): Promise<{ data: any; error: any }> {
  if (query.action === "select") {
    return executeLocalQuery(query);
  }

  const nextWrite = writeQueue.then(() => executeLocalQuery(query));
  writeQueue = nextWrite.catch(() => ({ data: null, error: null }));
  return nextWrite;
}

export async function exportLocalDatabase() {
  return readDatabase();
}

export async function backupLocalDatabase(passphrase?: string) {
  await secureBackupDirectory();
  const database = await readDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (passphrase) {
    const backupPath = path.join(backupDir, `splitlens-${timestamp}.splitlens-backup`);
    await writeFile(
      backupPath,
      `${JSON.stringify(encryptBackupPayload(database, passphrase), null, 2)}\n`,
      "utf8"
    );
    await chmodOwnerOnly(backupPath);
    return backupPath;
  }

  const backupPath = path.join(backupDir, `splitlens-${timestamp}.json`);
  await writeFile(backupPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  await chmodOwnerOnly(backupPath);
  return backupPath;
}

export async function restoreLocalDatabase(database: Partial<LocalDatabase>) {
  const backupPath = await backupLocalDatabase();
  await writeDatabase(normalizeDatabase(database));
  return backupPath;
}

class LocalQueryBuilder {
  private query: LocalQuery;

  constructor(table: string) {
    this.query = { table, action: "select", filters: [], orders: [] };
  }

  select(columns = "*") {
    this.query.columns = columns;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.query.action = "insert";
    this.query.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.query.action = "update";
    this.query.payload = payload;
    return this;
  }

  delete() {
    this.query.action = "delete";
    return this;
  }

  upsert(payload: Row | Row[]) {
    this.query.action = "upsert";
    this.query.payload = payload;
    return this;
  }

  eq(column: string, value: any) {
    this.query.filters?.push({ column, operator: "eq", value });
    return this;
  }

  gte(column: string, value: any) {
    this.query.filters?.push({ column, operator: "gte", value });
    return this;
  }

  lt(column: string, value: any) {
    this.query.filters?.push({ column, operator: "lt", value });
    return this;
  }

  in(column: string, values: any[]) {
    this.query.filters?.push({ column, operator: "in", value: values });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.query.orders?.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.query.limit = count;
    return this;
  }

  single() {
    this.query.single = true;
    return this;
  }

  maybeSingle() {
    this.query.maybeSingle = true;
    return this;
  }

  then<TResult1 = Awaited<ReturnType<typeof runLocalQuery>>, TResult2 = never>(
    onfulfilled?: ((value: Awaited<ReturnType<typeof runLocalQuery>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return runLocalQuery(this.query).then(onfulfilled, onrejected);
  }
}

export function createLocalDatabaseClient(): any {
  return {
    auth: {
      async getUser() {
        return { data: { user: localUser }, error: null };
      },
      async signInWithPassword(_credentials?: { email?: string; password?: string }) {
        return { data: { user: localUser }, error: null };
      },
      async signUp({ email, options }: { email?: string; options?: { data?: { name?: string } } }) {
        await runLocalQuery({
          table: "profiles",
          action: "upsert",
          payload: {
            id: localUser.id,
            email: email || localUser.email,
            name: options?.data?.name || "Local User",
            preferred_currency: "USD"
          }
        });
        return { data: { user: { ...localUser, email: email || localUser.email } }, error: null };
      },
      async signOut() {
        const { lockLocalApp } = await import("@/lib/local-security");
        await lockLocalApp();
        return { error: null };
      }
    },
    from(table: string) {
      return new LocalQueryBuilder(table);
    }
  };
}
