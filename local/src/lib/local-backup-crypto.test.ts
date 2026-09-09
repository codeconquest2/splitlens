import { describe, expect, it } from "vitest";
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackup } from "@/lib/local-backup-crypto";

describe("encrypted local backups", () => {
  it("round-trips backup payloads with a user password", () => {
    const database = {
      transactions: [{ id: "txn-1", amount: 42.25, merchant: "Cafe" }]
    };

    const encrypted = encryptBackupPayload(database, "password8");

    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain("Cafe");
    expect(decryptBackupPayload(encrypted, "password8")).toEqual(database);
  });

  it("rejects weak or wrong passwords", () => {
    expect(() => encryptBackupPayload({}, "short")).toThrow();

    const encrypted = encryptBackupPayload({ ok: true }, "password8");
    expect(() => decryptBackupPayload(encrypted, "wrongpass")).toThrow();
  });
});
