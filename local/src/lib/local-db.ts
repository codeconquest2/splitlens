import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

type Row = Record<string, any>;
type FilterOperator = "eq" | "gte" | "lt";

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
}

const localUser = {
  id: "local-user",
  email: "local@splitlens.test",
  user_metadata: { name: "Local User" }
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "splitlens.local.json");

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
  "expense_splits"
] as const;

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
    expense_splits: []
  };
}

async function readDatabase(): Promise<LocalDatabase> {
  await mkdir(dataDir, { recursive: true });

  try {
    const raw = await readFile(dbPath, "utf8");
    const database = JSON.parse(raw) as LocalDatabase;
    for (const tableName of tableNames) {
      database[tableName] ??= [];
    }
    if (!database.profiles.some((profile) => profile.id === localUser.id)) {
      database.profiles.push(emptyDatabase().profiles[0]);
    }
    return database;
  } catch {
    const database = emptyDatabase();
    await writeDatabase(database);
    return database;
  }
}

async function writeDatabase(database: LocalDatabase) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

function matchesFilter(row: Row, filter: QueryFilter) {
  const rowValue = row[filter.column];
  if (filter.operator === "eq") return rowValue === filter.value;
  if (filter.operator === "gte") return String(rowValue ?? "") >= String(filter.value ?? "");
  if (filter.operator === "lt") return String(rowValue ?? "") < String(filter.value ?? "");
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
  }
  if (table === "budgets") {
    next.planned_amount ??= 0;
    next.currency ??= "USD";
  }
  if (table === "manual_expenses") next.currency ??= "USD";
  if (table === "shared_expenses") next.currency ??= "USD";
  if (table === "expense_splits") next.paid ??= false;

  return next;
}

function tableFor(database: LocalDatabase, table: string): Row[] {
  if (!tableNames.includes(table as any)) {
    throw new Error(`Unknown local table: ${table}`);
  }
  return database[table as keyof LocalDatabase];
}

export async function runLocalQuery(query: LocalQuery): Promise<{ data: any; error: any }> {
  const database = await readDatabase();
  const table = tableFor(database, query.table);
  let data: Row | Row[] | null = null;

  if (query.action === "select") {
    const rows = applyColumns(applyOrders(applyFilters(table, query.filters), query.orders), query.columns);
    data = query.single ? rows[0] ?? null : rows;
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

  order(column: string, options: { ascending?: boolean } = {}) {
    this.query.orders?.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  single() {
    this.query.single = true;
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
        return { error: null };
      }
    },
    from(table: string) {
      return new LocalQueryBuilder(table);
    }
  };
}
