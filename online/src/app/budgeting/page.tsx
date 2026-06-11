"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import SimplePieChart from "@/components/SimplePieChart";
import { createClient } from "@/lib/supabase";
import type { Budget, ManualExpense, SharedExpense, Transaction } from "@/lib/types";

const categories = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Utilities",
  "Health",
  "Travel",
  "Entertainment",
  "Other"
];

function getCurrentMonthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

function monthBounds(month: string) {
  const start = month;
  const date = new Date(start);
  date.setMonth(date.getMonth() + 1);
  const end = date.toISOString().slice(0, 10);
  return { start, end };
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BudgetingPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(getCurrentMonthStart());
  const [currentUserId, setCurrentUserId] = useState("");
  const [hasInitializedMonth, setHasInitializedMonth] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [draftBudgets, setDraftBudgets] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeMonth() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user) {
        setCurrentUserId(user.id);
      }

      const { data: latestStatement } = await supabase
        .from("statements")
        .select("month")
        .eq("user_id", user?.id ?? "")
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();

      setMonth(latestStatement?.month ?? getCurrentMonthStart());
      setHasInitializedMonth(true);
    }

    initializeMonth();
  }, [supabase]);

  useEffect(() => {
    if (!hasInitializedMonth || !currentUserId) {
      return;
    }

    async function loadData() {
      const { start, end } = monthBounds(month);
      const [budgetResult, transactionResult, manualResult, sharedResult] = await Promise.all([
        supabase.from("budgets").select("*").eq("month", month).order("category"),
        supabase
          .from("transactions")
          .select("*")
          .eq("is_shared", false)
          .gte("date", start)
          .lt("date", end),
        supabase
          .from("manual_expenses")
          .select("*")
          .gte("date", start)
          .lt("date", end),
        supabase
          .from("shared_expenses")
          .select("*")
          .eq("created_by", currentUserId)
          .gte("date", start)
          .lt("date", end)
      ]);

      const nextBudgets = (budgetResult.data as Budget[]) ?? [];
      const nextTransactions = (transactionResult.data as Transaction[]) ?? [];
      const nextManualExpenses = (manualResult.data as ManualExpense[]) ?? [];
      setBudgets(nextBudgets);
      setTransactions(nextTransactions);
      setManualExpenses(nextManualExpenses);
      setSharedExpenses((sharedResult.data as SharedExpense[]) ?? []);
      setCurrency(nextBudgets[0]?.currency ?? nextTransactions[0]?.currency ?? "USD");
      setDraftBudgets(
        Object.fromEntries(
          categories.map((category) => [
            category,
            String(Number(nextBudgets.find((budget) => budget.category === category)?.planned_amount ?? 0))
          ])
        )
      );
    }

    loadData();
  }, [currentUserId, hasInitializedMonth, month, supabase]);

  const spendByCategory = [
    ...transactions.map((transaction) => ({
      category: transaction.category,
      amount: transaction.amount
    })),
    ...manualExpenses.map((expense) => ({
      category: expense.category,
      amount: expense.amount
    }))
  ].reduce<Record<string, number>>((totals, transaction) => {
    const key = transaction.category?.trim() || "Other";
    totals[key] = (totals[key] ?? 0) + Number(transaction.amount ?? 0);
    return totals;
  }, {});

  const budgetMap = budgets.reduce<Record<string, Budget>>((accumulator, budget) => {
    accumulator[budget.category] = budget;
    return accumulator;
  }, {});

  const rows = categories.map((category) => {
    const planned = Number(draftBudgets[category] ?? budgetMap[category]?.planned_amount ?? 0);
    const spent = Number(spendByCategory[category] ?? 0);
    return {
      category,
      planned,
      spent,
      remaining: planned - spent
    };
  });

  async function saveBudgets() {
    if (!currentUserId) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      for (const category of categories) {
        const plannedAmount = Number(draftBudgets[category] ?? 0);
        const existingBudget = budgetMap[category];
        const payload = {
          user_id: currentUserId,
          month,
          category,
          planned_amount: plannedAmount,
          currency
        };

        if (existingBudget) {
          const { error } = await supabase.from("budgets").update(payload).eq("id", existingBudget.id);
          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase.from("budgets").insert(payload);
          if (error) {
            throw error;
          }
        }
      }

      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("month", month)
        .order("category");

      if (error) {
        throw error;
      }

      setBudgets((data as Budget[]) ?? []);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save budgets.");
    } finally {
      setIsSaving(false);
    }
  }

  const totalPlanned = rows.reduce((sum, row) => sum + row.planned, 0);
  const spentPieItems = rows.map((row, index) => ({
    label: row.category,
    value: row.spent,
    color: ["#4f46e5", "#0f766e", "#ea580c", "#dc2626", "#0891b2", "#7c3aed", "#65a30d", "#ca8a04", "#475569"][index % 9]
  }));

  function exportCsv() {
    const budgetRows = rows.map((row) =>
      [
        "budget",
        month,
        row.category,
        row.planned.toFixed(2),
        row.spent.toFixed(2),
        row.remaining.toFixed(2),
        currency
      ].join(",")
    );

    const transactionRows = transactions.map((transaction) =>
      [
        "transaction",
        transaction.date ?? "",
        `"${(transaction.merchant ?? "").replace(/"/g, '""')}"`,
        transaction.category ?? "Other",
        Number(transaction.amount ?? 0).toFixed(2),
        transaction.currency ?? currency
      ].join(",")
    );

    const manualRows = manualExpenses.map((expense) =>
      [
        "manual_expense",
        expense.date,
        `"${expense.description.replace(/"/g, '""')}"`,
        expense.category,
        Number(expense.amount ?? 0).toFixed(2),
        expense.currency ?? currency
      ].join(",")
    );

    const sharedRows = sharedExpenses.map((expense) =>
      [
        "shared_expense",
        expense.date ?? "",
        `"${(expense.description ?? "").replace(/"/g, '""')}"`,
        Number(expense.total_amount ?? 0).toFixed(2),
        expense.currency ?? currency
      ].join(",")
    );

    const content = [
      "type,date_or_month,name_or_category,planned_or_amount,spent_or_total,remaining,currency",
      ...budgetRows,
      ...transactionRows,
      ...manualRows,
      ...sharedRows
    ].join("\n");

    downloadFile(`splitlens-${month}-combined.csv`, content, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    const reportRows = rows
      .map(
        (row) =>
          `<tr><td>${row.category}</td><td>${currency} ${row.planned.toFixed(2)}</td><td>${currency} ${row.spent.toFixed(2)}</td><td>${currency} ${row.remaining.toFixed(2)}</td></tr>`
      )
      .join("");

    const transactionItems = transactions
      .map(
        (transaction) =>
          `<tr><td>${transaction.date ?? ""}</td><td>${transaction.merchant ?? ""}</td><td>${transaction.category ?? "Other"}</td><td>${currency} ${Number(transaction.amount ?? 0).toFixed(2)}</td></tr>`
      )
      .join("");

    const manualItems = manualExpenses
      .map(
        (expense) =>
          `<tr><td>${expense.date}</td><td>${expense.description}</td><td>${expense.category}</td><td>${currency} ${Number(expense.amount ?? 0).toFixed(2)}</td></tr>`
      )
      .join("");

    const sharedItems = sharedExpenses
      .map(
        (expense) =>
          `<tr><td>${expense.date ?? ""}</td><td>${expense.description ?? ""}</td><td>${currency} ${Number(expense.total_amount ?? 0).toFixed(2)}</td></tr>`
      )
      .join("");

    const popup = window.open("", "_blank", "width=960,height=720");
    if (!popup) {
      return;
    }

    popup.document.write(`
      <html>
        <head>
          <title>SplitLens ${month} Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1, h2 { margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 14px; }
            th { background: #f9fafb; }
          </style>
        </head>
        <body>
          <h1>SplitLens Combined Report</h1>
          <p>Month: ${month}</p>
          <h2>Budget vs Statement Spend</h2>
          <table>
            <thead><tr><th>Category</th><th>Planned</th><th>Spent</th><th>Remaining</th></tr></thead>
            <tbody>${reportRows}</tbody>
          </table>
          <h2>Personal Transactions</h2>
          <table>
            <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>${transactionItems}</tbody>
          </table>
          <h2>Manual Expenses</h2>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>${manualItems}</tbody>
          </table>
          <h2>Shared Expenses</h2>
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Total</th></tr></thead>
            <tbody>${sharedItems}</tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Budgeting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Plan monthly category budgets and compare them against your statement spend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(event) => setMonth(`${event.target.value}-01`)}
          />
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Export PDF
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Monthly budget plan</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Planned</th>
                <th className="px-4 py-3 font-medium">Spent</th>
                <th className="px-4 py-3 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.category}>
                  <td className="px-4 py-3 font-medium text-black">{row.category}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draftBudgets[row.category] ?? String(row.planned)}
                      onChange={(event) =>
                        setDraftBudgets((current) => ({
                          ...current,
                          [row.category]: event.target.value.replace(/[^0-9.]/g, "")
                        }))
                      }
                      className="w-32"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {currency} {row.spent.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 ${row.remaining < 0 ? "text-red-600" : "text-gray-700"}`}>
                    {currency} {row.remaining.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-600">
            Total planned: <span className="font-medium text-black">{currency} {totalPlanned.toFixed(2)}</span>
          </p>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={saveBudgets}
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
              {isSaving ? "Saving..." : "Save budget"}
            </button>
            {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black">Budget performance</h2>
          <div className="mt-5 space-y-4">
            {rows.map((row) => {
              const spentRatio = row.planned > 0 ? Math.min((row.spent / row.planned) * 100, 100) : 0;
              const overspent = row.remaining < 0 ? Math.abs(row.remaining) : 0;
              const underspent = row.remaining > 0 ? row.remaining : 0;

              return (
                <div key={row.category} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-black">{row.category}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        Planned {currency} {row.planned.toFixed(2)} · Spent {currency} {row.spent.toFixed(2)}
                      </p>
                    </div>
                    <p className={`text-sm font-medium ${row.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {row.remaining < 0 ? "Overspent" : "Underspent"} {currency} {Math.abs(row.remaining).toFixed(2)}
                    </p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`${row.remaining < 0 ? "bg-red-500" : "bg-indigo-600"} h-full`}
                      style={{ width: `${spentRatio}%` }}
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                      Spent: {currency} {row.spent.toFixed(2)}
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-emerald-600">
                      Underspent: {currency} {underspent.toFixed(2)}
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-red-600">
                      Overspent: {currency} {overspent.toFixed(2)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <SimplePieChart title="Spent by category pie chart" items={spentPieItems} />
      </div>
    </div>
  );
}
