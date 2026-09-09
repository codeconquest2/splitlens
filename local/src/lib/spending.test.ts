import { describe, expect, it } from "vitest";
import { isSpendTransaction, monthBounds, percentChange, sumSpend } from "@/lib/spending";

describe("spending helpers", () => {
  it("excludes payments and refunds from spend totals", () => {
    const transactions = [
      { amount: 25, merchant: "Whole Foods", is_payment: false, is_shared: false },
      { amount: 100, merchant: "Online Payment Thank You", is_payment: false, is_shared: false },
      { amount: 12, merchant: "Refund adjustment", is_payment: false, is_shared: false },
      { amount: 5, merchant: "Coffee", is_payment: true, is_shared: false }
    ];

    expect(sumSpend(transactions)).toBe(25);
    expect(isSpendTransaction(transactions[0])).toBe(true);
    expect(isSpendTransaction(transactions[1])).toBe(false);
  });

  it("calculates month bounds and percent change", () => {
    expect(monthBounds("2026-09-01")).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 0)).toBe(100);
  });
});
