"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TransactionTable from "@/components/TransactionTable";
import { createClient } from "@/lib/local-data-client";
import type { Statement, StatementParseDebug, Transaction } from "@/lib/types";

export default function StatementReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parseDebug, setParseDebug] = useState<StatementParseDebug | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: statementRow }, { data: transactionRows }, { data: debugRow }] = await Promise.all([
        supabase.from("statements").select("*").eq("id", params.id).single(),
        supabase.from("transactions").select("*").eq("statement_id", params.id).order("date"),
        supabase
          .from("statement_parse_debug")
          .select("*")
          .eq("statement_id", params.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      setStatement((statementRow as Statement) ?? null);
      setTransactions((transactionRows as Transaction[]) ?? []);
      setParseDebug((debugRow as StatementParseDebug) ?? null);
    }

    load();
  }, [params.id, supabase]);

  function updateTransaction(transactionId: string, patch: Partial<Transaction>) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId ? { ...transaction, ...patch } : transaction
      )
    );
  }

  async function saveAll(status?: "done") {
    setSaving(true);

    await Promise.all(
      transactions.map((transaction) =>
        supabase
          .from("transactions")
          .update({
            merchant: transaction.merchant,
            amount: transaction.amount,
            category: transaction.category,
            is_shared: transaction.is_shared,
            is_payment: transaction.is_payment
          })
          .eq("id", transaction.id)
      )
    );

    if (status === "done") {
      await supabase.from("statements").update({ status: "done" }).eq("id", params.id);
      router.push("/statements");
    } else {
      router.refresh();
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-black">Review statement</h1>
          <p className="mt-1 text-sm text-gray-500">
            {statement?.source_filename ?? "Statement"} · {statement?.status ?? "review"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => saveAll()}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-black"
          >
            Save edits
          </button>
          <button
            type="button"
            onClick={() => saveAll("done")}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Confirm all
          </button>
        </div>
      </div>

      <TransactionTable transactions={transactions} editable onChange={updateTransaction} />

      {parseDebug ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-black">Parser debug</h2>
              <p className="mt-1 text-sm text-gray-500">
                Extraction: {parseDebug.extraction_provider} · Categorization: {parseDebug.categorization_provider}
              </p>
            </div>
            {parseDebug.raw_text ? (
              <button
                type="button"
                onClick={() => setShowRawText((current) => !current)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-black"
              >
                {showRawText ? "Hide raw text" : "Show raw text"}
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Parsed</p>
              <p className="mt-1 text-2xl font-semibold text-black">{parseDebug.parsed_count}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Saved</p>
              <p className="mt-1 text-2xl font-semibold text-black">{parseDebug.saved_count}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Duplicates skipped</p>
              <p className="mt-1 text-2xl font-semibold text-black">{parseDebug.duplicate_count}</p>
            </div>
          </div>
          {parseDebug.warnings?.length ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {parseDebug.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          {parseDebug.duplicate_rows?.length ? (
            <details className="mt-4 rounded-lg border border-gray-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-black">
                Duplicate rows skipped ({parseDebug.duplicate_rows.length})
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto text-xs text-gray-600">
                {JSON.stringify(parseDebug.duplicate_rows, null, 2)}
              </pre>
            </details>
          ) : null}
          {parseDebug.skipped_rows?.length ? (
            <details className="mt-4 rounded-lg border border-gray-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-black">
                Unparseable rows skipped ({parseDebug.skipped_rows.length})
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto text-xs text-gray-600">
                {JSON.stringify(parseDebug.skipped_rows, null, 2)}
              </pre>
            </details>
          ) : null}
          {showRawText && parseDebug.raw_text ? (
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-gray-100">
              {parseDebug.raw_text}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
