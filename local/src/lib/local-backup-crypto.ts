import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const encryptedBackupFormat = "splitlens.encrypted-backup";
const encryptedBackupVersion = 1;
const kdfOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface EncryptedBackup {
  format: typeof encryptedBackupFormat;
  version: typeof encryptedBackupVersion;
  cipher: "aes-256-gcm";
  kdf: "scrypt";
  kdf_options: typeof kdfOptions;
  salt: string;
  iv: string;
  tag: string;
  payload: string;
  created_at: string;
}

function requirePassphrase(passphrase: string) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Backup password must be at least 8 characters.");
  }
}

function deriveKey(passphrase: string, salt: Buffer) {
  return scryptSync(passphrase, salt, 32, kdfOptions);
}

export function encryptBackupPayload(payload: unknown, passphrase: string): EncryptedBackup {
  requirePassphrase(passphrase);

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    format: encryptedBackupFormat,
    version: encryptedBackupVersion,
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    kdf_options: kdfOptions,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    payload: encrypted.toString("base64"),
    created_at: new Date().toISOString()
  };
}

export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as EncryptedBackup).format === encryptedBackupFormat &&
      (value as EncryptedBackup).version === encryptedBackupVersion
  );
}

export function decryptBackupPayload(backup: unknown, passphrase: string): unknown {
  requirePassphrase(passphrase);

  if (!isEncryptedBackup(backup)) {
    throw new Error("Not a SplitLens encrypted backup.");
  }

  try {
    const key = deriveKey(passphrase, Buffer.from(backup.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(backup.iv, "base64"));
    decipher.setAuthTag(Buffer.from(backup.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(backup.payload, "base64")),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    throw new Error("Could not decrypt backup. Check the password and file.");
  }
}
