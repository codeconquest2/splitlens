import { describe, expect, it } from "vitest";
import { extractWithRegex } from "@/lib/pipeline/extract/regex";

describe("regex statement extraction", () => {
  it("extracts dated merchant rows and marks payments", async () => {
    const rows = await extractWithRegex({
      currency: "USD",
      text: [
        "Date Description Amount",
        "09/01/2026 TRADER JOES MARKET $42.50",
        "09/02/2026 ONLINE PAYMENT THANK YOU ($100.00)"
      ].join("\n")
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "2026-09-01",
      merchant: "TRADER JOES MARKET",
      amount: 42.5,
      is_payment: false
    });
    expect(rows[1].is_payment).toBe(true);
  });
});
