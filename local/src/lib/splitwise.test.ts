import { describe, expect, it } from "vitest";
import { parseSplitwiseCsv, resolveYourName, withMemberContext } from "@/lib/splitwise";

describe("splitwise parser", () => {
  it("parses group exports and resolves member context", () => {
    const csv = [
      "Date,Description,Category,Cost,Currency,Alice,Bob",
      "2026-09-01,Dinner,Food,$60.00,USD,30,-30"
    ].join("\n");

    const parsed = parseSplitwiseCsv(csv);
    expect(parsed.format).toBe("group");
    expect(parsed.member_names).toEqual(["Alice", "Bob"]);
    expect(resolveYourName(parsed.member_names, "Bob")).toBe("Bob");
    expect(withMemberContext(parsed.rows, "Bob")[0].type).toBe("owe");
    expect(withMemberContext(parsed.rows, "Bob")[0].your_share).toBe(30);
  });
});
