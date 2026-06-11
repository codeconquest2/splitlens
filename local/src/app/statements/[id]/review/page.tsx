"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TransactionTable from "@/components/TransactionTable";
import { createClient } from "@/lib/supabase";
import type { Statement, Transaction } from "@/lib/types";

export default function StatementReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: statementRow }, { data: transactionRows }] = await Promise.all([
        supabase.from("statements").select("*").eq("id", params.id).single(),
        supabase.from("transactions").select("*").eq("statement_id", params.id).order("date")
      ]);

      setStatement((statementRow as Statement) ?? null);
      setTransactions((transactionRows as Transaction[]) ?? []);
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
            is_shared: transaction.is_shared
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
    </div>
  );
}
