import { describe, expect, it } from "vitest";
import { findReconcileMatches, scoreReconcileMatch } from "@/lib/reconciliation";
import type { SharedExpense, Transaction } from "@/lib/types";

const transaction: Transaction = {
  id: "tx-1",
  statement_id: "statement-1",
  user_id: "local-user",
  date: "2026-09-02",
  merchant: "Trader Joes Market",
  amount: 42.5,
  currency: "USD",
  category: "Groceries",
  is_shared: false,
  is_payment: false,
  created_at: "2026-09-03T00:00:00.000Z"
};

const expense: SharedExpense = {
  id: "expense-1",
  created_by: "local-user",
  group_id: null,
  transaction_id: null,
  paid_by_contact_id: null,
  description: "Trader Joes groceries",
  total_amount: 42.5,
  currency: "USD",
  date: "2026-09-02",
  created_at: "2026-09-03T00:00:00.000Z"
};

describe("reconciliation", () => {
  it("scores matching shared expenses using amount, date, and description", () => {
    const result = scoreReconcileMatch(transaction, expense);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("returns one best match per transaction and expense", () => {
    expect(findReconcileMatches([transaction], [expense])).toHaveLength(1);
  });
});
