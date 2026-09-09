"use client";

import type { LocalQuery } from "@/lib/local-db";

type Row = Record<string, any>;

const localUser = {
  id: "local-user",
  email: "local@splitlens.test",
  user_metadata: { name: "Local User" }
};

class BrowserLocalQueryBuilder {
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

  private async execute() {
    const response = await fetch("/api/local-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.query)
    });

    if (!response.ok) {
      return { data: null, error: { message: "Local database request failed" } };
    }

    return response.json();
  }

  then<TResult1 = Awaited<ReturnType<BrowserLocalQueryBuilder["execute"]>>, TResult2 = never>(
    onfulfilled?:
      | ((value: Awaited<ReturnType<BrowserLocalQueryBuilder["execute"]>>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createClient(): any {
  return {
    auth: {
      async getUser() {
        return { data: { user: localUser }, error: null };
      },
      async signInWithPassword(_credentials?: { email?: string; password?: string }) {
        return { data: { user: localUser }, error: null };
      },
      async signUp({ email, options }: { email?: string; options?: { data?: { name?: string } } }) {
        await fetch("/api/local-db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: "profiles",
            action: "upsert",
            payload: {
              id: localUser.id,
              email: email || localUser.email,
              name: options?.data?.name || "Local User",
              preferred_currency: "USD"
            }
          })
        });
        return { data: { user: { ...localUser, email: email || localUser.email } }, error: null };
      },
      async signOut() {
        await fetch("/api/local-security", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lock" })
        });
        return { error: null };
      }
    },
    from(table: string) {
      return new BrowserLocalQueryBuilder(table);
    }
  };
}
