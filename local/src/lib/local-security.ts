import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createLocalAdminClient } from "@/lib/local-data-server";

const settingsId = "app_lock";
const cookieName = "splitlens-unlocked";
const kdfOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let activeUnlockToken: string | null = null;

interface SecuritySettings {
  id: string;
  salt: string;
  password_hash: string;
  created_at?: string;
}

function requirePassword(password: string) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("App password must be at least 8 characters.");
  }
}

function hashPassword(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32, kdfOptions).toString("base64");
}

async function getSecuritySettings() {
  const db = createLocalAdminClient();
  const { data } = await db
    .from("security_settings")
    .select("*")
    .eq("id", settingsId)
    .maybeSingle();
  return (data as SecuritySettings | null) ?? null;
}

export async function getLocalSecurityStatus() {
  const settings = await getSecuritySettings();
  const cookieStore = await cookies();
  const unlocked = Boolean(settings && activeUnlockToken && cookieStore.get(cookieName)?.value === activeUnlockToken);
  return {
    configured: Boolean(settings),
    unlocked
  };
}

export async function requireLocalUnlock() {
  const status = await getLocalSecurityStatus();
  if (!status.unlocked) {
    throw new Error("SplitLens is locked.");
  }
}

export async function setupLocalPassword(password: string) {
  requirePassword(password);
  const existing = await getSecuritySettings();
  if (existing) {
    throw new Error("App password is already configured.");
  }

  const salt = randomBytes(16);
  const db = createLocalAdminClient();
  await db.from("security_settings").upsert({
    id: settingsId,
    salt: salt.toString("base64"),
    password_hash: hashPassword(password, salt)
  });
  await unlockLocalApp(password);
}

export async function unlockLocalApp(password: string) {
  requirePassword(password);
  const settings = await getSecuritySettings();
  if (!settings) {
    await setupLocalPassword(password);
    return;
  }

  const expected = Buffer.from(settings.password_hash, "base64");
  const actual = Buffer.from(hashPassword(password, Buffer.from(settings.salt, "base64")), "base64");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Incorrect app password.");
  }

  activeUnlockToken = randomBytes(32).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(cookieName, activeUnlockToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/"
  });
}

export async function lockLocalApp() {
  activeUnlockToken = null;
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
