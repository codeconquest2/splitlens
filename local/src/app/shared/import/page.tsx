"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  parseSplitwiseCsv,
  resolveYourName,
  withMemberContext,
  type SplitwiseImportRow
} from "@/lib/splitwise";
import { createClient } from "@/lib/supabase";

export default function SplitwiseImportPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<SplitwiseImportRow[]>([]);
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [format, setFormat] = useState<"group" | "personal">("personal");
  const [yourName, setYourName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.name && memberNames.length) {
        setYourName((current) => current || resolveYourName(memberNames, profile.name));
      }
    }

    loadProfile();
  }, [memberNames, supabase]);

  const displayRows = useMemo(() => {
    if (format === "group" && yourName) {
      return withMemberContext(rows, yourName);
    }
    return rows;
  }, [format, rows, yourName]);

  async function handlePreview() {
    if (!file) {
      setError("Select a CSV file first.");
      return;
    }

    const csvText = await file.text();
    const parsed = parseSplitwiseCsv(csvText);
    setRows(parsed.rows);
    setMemberNames(parsed.member_names);
    setFormat(parsed.format);
    setImportedCount(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();
    let profileName: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      profileName = profile?.name ?? null;
    }

    const resolvedName = resolveYourName(parsed.member_names, profileName);
    setYourName(resolvedName);
    setError(parsed.rows.length ? null : "No importable rows found in this CSV.");
  }

  async function handleImport() {
    if (!rows.length) {
      setError("Preview the CSV before importing.");
      return;
    }

    if (format === "group" && !yourName) {
      setError("Select which group member is you before importing.");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch("/api/import-splitwise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rows,
          yourName: format === "group" ? yourName : ""
        })
      });

      if (!response.ok) {
        throw new Error("Failed to import rows.");
      }

      const data = (await response.json()) as { count: number };
      setImportedCount(data.count);
      router.push("/shared");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">Import from Splitwise</h1>
          <p className="mt-1 text-sm text-gray-500">
            Export your expenses from Splitwise: go to splitwise.com → your group → Export as
            CSV. Then upload it here.
          </p>
        </div>
        <Link href="/shared" className="text-sm text-indigo-600 hover:text-indigo-700">
          Back to shared
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Splitwise CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full"
          />
        </div>

        {format === "group" && memberNames.length ? (
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Which member are you?</label>
            <select value={yourName} onChange={(event) => setYourName(event.target.value)} className="w-full max-w-md">
              {memberNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-500">
              Found {memberNames.length} group members in this export. Contacts will be created automatically for
              anyone not already in your list.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || rows.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            {isImporting ? "Importing..." : "Confirm import"}
          </button>
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {importedCount !== null ? (
          <p className="mt-4 text-sm text-gray-600">Imported {importedCount} expenses.</p>
        ) : null}
      </div>

      {displayRows.length ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Total Cost</th>
                  <th className="px-4 py-3 font-medium">Your share</th>
                  <th className="px-4 py-3 font-medium">Direction</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayRows.map((row, index) => (
                  <tr key={`${row.description}-${row.date}-${index}`}>
                    <td className="px-4 py-3 text-gray-700">{row.date}</td>
                    <td className="px-4 py-3 text-gray-900">{row.description}</td>
                    <td className="px-4 py-3 text-gray-900">{row.total_amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-900">{row.your_share.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.is_payment ? "Payment (skipped)" : row.type === "owed" ? "Owed to you" : "You owe"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.currency}</td>
                    <td className="px-4 py-3 text-gray-700">{row.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
