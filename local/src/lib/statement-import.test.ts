import { describe, expect, it } from "vitest";
import { parseStructuredStatement } from "@/lib/statement-import";

describe("structured statement imports", () => {
  it("parses common credit card CSV exports", () => {
    const csv = [
      "Transaction Date,Description,Amount",
      "2026-01-05,Trader Joe's,23.45",
      "01/06/2026,Autopay Payment,-100.00",
      "bad,row,"
    ].join("\n");

    const result = parseStructuredStatement(Buffer.from(csv), "card.csv", "text/csv", "USD");

    expect(result?.format).toBe("csv");
    expect(result?.transactions).toMatchObject([
      { date: "2026-01-05", merchant: "Trader Joe's", amount: 23.45, is_payment: false },
      { date: "2026-01-06", merchant: "Autopay Payment", amount: 100, is_payment: true }
    ]);
    expect(result?.skippedRows).toHaveLength(1);
  });

  it("parses OFX/QFX transaction blocks", () => {
    const ofx = `<OFX><STMTTRN><DTPOSTED>20260107120000<TRNAMT>-42.50<NAME>Refund</STMTTRN></OFX>`;

    const result = parseStructuredStatement(Buffer.from(ofx), "card.qfx", "application/octet-stream", "USD");

    expect(result?.format).toBe("ofx");
    expect(result?.transactions).toMatchObject([
      { date: "2026-01-07", merchant: "Refund", amount: 42.5, is_payment: true }
    ]);
  });
});
