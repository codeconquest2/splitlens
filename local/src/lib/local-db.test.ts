import { describe, expect, it } from "vitest";
import { runLocalQuery, validateLocalQuery } from "@/lib/local-db";

describe("local query validation", () => {
  it("accepts expected local query shapes", () => {
    expect(() =>
      validateLocalQuery({
        table: "transactions",
        action: "select",
        filters: [{ column: "user_id", operator: "eq", value: "local-user" }],
        orders: [{ column: "date", ascending: false }],
        limit: 100
      })
    ).not.toThrow();
  });

  it("rejects unknown tables and unsafe column names", () => {
    expect(() => validateLocalQuery({ table: "secrets", action: "select" })).toThrow();
    expect(() =>
      validateLocalQuery({
        table: "transactions",
        action: "select",
        filters: [{ column: "date;DROP", operator: "eq", value: "x" }]
      })
    ).toThrow();
  });

  it("persists rows through the SQLite-backed adapter", async () => {
    const marker = `test-${Date.now()}`;
    const { data: inserted } = await runLocalQuery({
      table: "category_rules",
      action: "insert",
      payload: {
        user_id: "local-user",
        merchant_pattern: marker,
        category: "Dining",
        is_payment: false
      },
      single: true
    });

    const { data: selected } = await runLocalQuery({
      table: "category_rules",
      action: "select",
      filters: [{ column: "id", operator: "eq", value: inserted.id }],
      maybeSingle: true
    });

    expect(selected).toMatchObject({ merchant_pattern: marker, category: "Dining" });
  });
});
