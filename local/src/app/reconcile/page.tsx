"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { findReconcileMatches, yourShareForExpense, type ReconcileMatch } from "@/lib/reconciliation";
import { getCurrentMonthStart, isSpendTransaction, monthBounds } from "@/lib/spending";
import { createClient } from "@/lib/local-data-client";
import type { ExpenseSplit, SharedExpense, Transaction } from "@/lib/types";

export default function ReconcilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(getCurrentMonthStart());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [matches, setMatches] = useState<ReconcileMatch[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isLinking, setIsLinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      setCurrentUserId(user.id);
      const { start, end } = monthBounds(month);
      const [txResult, expenseResult, splitResult] = await Promise.all([
        supabase.from("transactions").select("*").gte("date", start).lt("date", end),
        supabase
          .from("shared_expenses")
          .select("*")
          .eq("created_by", user.id)
          .gte("date", start)
          .lt("date", end),
        supabase.from("expense_splits").select("*")
      ]);

      const nextTransactions = (txResult.data as Transaction[]) ?? [];
      const nextExpenses = (expenseResult.data as SharedExpense[]) ?? [];
      const nextSplits = (splitResult.data as ExpenseSplit[]) ?? [];
      setTransactions(nextTransactions);
      setExpenses(nextExpenses);
      setSplits(nextSplits);

      const suggested = findReconcileMatches(
        nextTransactions.filter((transaction) => isSpendTransaction(transaction) && !transaction.is_shared),
        nextExpenses.filter((expense) => !expense.transaction_id)
      );
      setMatches(suggested);
      setSelected(Object.fromEntries(suggested.map((match) => [`${match.transaction_id}:${match.expense_id}`, true])));
    }

    loadData();
  }, [month, supabase]);

  const linkedExpenses = expenses.filter((expense) => expense.transaction_id);
  const unlinkedTransactions = transactions.filter(
    (transaction) => isSpendTransaction(transaction) && !transaction.is_shared
  );
  const unlinkedExpenses = expenses.filter((expense) => !expense.transaction_id);

  async function applyMatches() {
    const links = matches
      .filter((match) => selected[`${match.transaction_id}:${match.expense_id}`])
      .map((match) => ({
        transaction_id: match.transaction_id,
        expense_id: match.expense_id
      }));

    if (!links.length) {
      setMessage("Select at least one match to link.");
      return;
    }

    setIsLinking(true);
    setMessage(null);

    try {
      const response = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links })
      });

      if (!response.ok) {
        throw new Error("Failed to link matches.");
      }

      const data = (await response.json()) as { count: number };
      setMessage(`Linked ${data.count} transaction${data.count === 1 ? "" : "s"} to shared expenses.`);
      const { start, end } = monthBounds(month);
      const [txResult, expenseResult] = await Promise.all([
        supabase.from("transactions").select("*").gte("date", start).lt("date", end),
        supabase
          .from("shared_expenses")
          .select("*")
          .eq("created_by", currentUserId)
          .gte("date", start)
          .lt("date", end)
      ]);
      const nextTransactions = (txResult.data as Transaction[]) ?? [];
      const nextExpenses = (expenseResult.data as SharedExpense[]) ?? [];
      setTransactions(nextTransactions);
      setExpenses(nextExpenses);
      const suggested = findReconcileMatches(
        nextTransactions.filter((transaction) => isSpendTransaction(transaction) && !transaction.is_shared),
        nextExpenses.filter((expense) => !expense.transaction_id)
      );
      setMatches(suggested);
      setSelected(Object.fromEntries(suggested.map((match) => [`${match.transaction_id}:${match.expense_id}`, true])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Linking failed.");
    } finally {
      setIsLinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">Reconcile</h1>
          <p className="mt-1 text-sm text-gray-500">
            Match credit card charges to Splitwise shared expenses and see your true out-of-pocket.
          </p>
        </div>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(event) => setMonth(`${event.target.value}-01`)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Unlinked CC charges</p>
          <p className="mt-2 text-3xl font-semibold text-black">{unlinkedTransactions.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Unlinked shared expenses</p>
          <p className="mt-2 text-3xl font-semibold text-black">{unlinkedExpenses.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Suggested matches</p>
          <p className="mt-2 text-3xl font-semibold text-black">{matches.length}</p>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-black">Suggested matches</h2>
          <button
            type="button"
            onClick={applyMatches}
            disabled={isLinking || !matches.length}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            {isLinking ? "Linking..." : "Link selected"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-gray-600">{message}</p> : null}
        <div className="mt-4 space-y-3">
          {matches.map((match) => {
            const key = `${match.transaction_id}:${match.expense_id}`;
            const expense = expenses.find((entry) => entry.id === match.expense_id);
            if (!expense) {
              return null;
            }
            const yourShare = yourShareForExpense(expense, splits, currentUserId);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[key])}
                  onChange={(event) =>
                    setSelected((current) => ({ ...current, [key]: event.target.checked }))
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-black">{match.transaction.merchant}</p>
                    <span className="text-sm text-indigo-600">{match.score}% match</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    CC {match.transaction.date} · USD {Number(match.transaction.amount ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Shared {match.expense.description} · {match.expense.date} · USD{" "}
                    {Number(match.expense.total_amount ?? 0).toFixed(2)}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    {match.reason} · Your true out-of-pocket after link: USD {yourShare.toFixed(2)}
                  </p>
                </div>
              </label>
            );
          }).filter(Boolean)}
          {!matches.length ? (
            <p className="text-sm text-gray-500">No strong matches found for this month.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Already linked</h2>
        <div className="mt-4 space-y-3">
          {linkedExpenses.map((expense) => {
            const transaction = transactions.find((entry) => entry.id === expense.transaction_id);
            const yourShare = yourShareForExpense(expense, splits, currentUserId);
            return (
              <div key={expense.id} className="rounded-lg border border-gray-200 p-4">
                <p className="font-medium text-black">{transaction?.merchant ?? "Linked transaction"}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {expense.description} · CC USD {Number(transaction?.amount ?? 0).toFixed(2)} · Your share USD{" "}
                  {yourShare.toFixed(2)}
                </p>
              </div>
            );
          })}
          {!linkedExpenses.length ? (
            <p className="text-sm text-gray-500">No linked items yet. Use suggested matches above.</p>
          ) : null}
        </div>
      </section>

      <p className="text-sm text-gray-500">
        Need to import Splitwise first?{" "}
        <Link href="/shared/import" className="text-indigo-600 hover:text-indigo-700">
          Import CSV
        </Link>
      </p>
    </div>
  );
}
