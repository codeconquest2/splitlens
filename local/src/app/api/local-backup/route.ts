import { NextResponse } from "next/server";
import { backupLocalDatabase, exportLocalDatabase, restoreLocalDatabase } from "@/lib/local-db";
import { decryptBackupPayload, encryptBackupPayload, isEncryptedBackup } from "@/lib/local-backup-crypto";
import { requireLocalUnlock } from "@/lib/local-security";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function databaseToCsv(database: object) {
  const rows = ["table,id,payload_json"];
  for (const [table, records] of Object.entries(database) as Array<[string, any[]]>) {
    for (const record of records) {
      rows.push([csvCell(table), csvCell(record.id), csvCell(JSON.stringify(record))].join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

export async function GET(request: Request) {
  await requireLocalUnlock();
  const database = await exportLocalDatabase();
  const format = new URL(request.url).searchParams.get("format");
  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    return new NextResponse(databaseToCsv(database), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="splitlens-export-${date}.csv"`
      }
    });
  }

  return new NextResponse(JSON.stringify(database, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="splitlens-backup-${date}.json"`
    }
  });
}

export async function PUT(request: Request) {
  try {
    await requireLocalUnlock();
    const body = await request.json().catch(() => ({}));
    const backupPath = await backupLocalDatabase(body.passphrase);
    return NextResponse.json({ backupPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireLocalUnlock();
    const body = await request.json();
    if (body?.action === "export_encrypted") {
      const date = new Date().toISOString().slice(0, 10);
      const encrypted = encryptBackupPayload(await exportLocalDatabase(), body.passphrase);
      return new NextResponse(JSON.stringify(encrypted, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="splitlens-backup-${date}.splitlens-backup"`
        }
      });
    }

    const database = isEncryptedBackup(body.backup)
      ? decryptBackupPayload(body.backup, body.passphrase)
      : body.database ?? body;
    const backupPath = await restoreLocalDatabase(database);
    return NextResponse.json({ restored: true, previousBackupPath: backupPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
