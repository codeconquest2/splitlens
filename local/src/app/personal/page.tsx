"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import MonthSummaryCard from "@/components/MonthSummaryCard";
import SimplePieChart from "@/components/SimplePieChart";
import TransactionTable from "@/components/TransactionTable";
import { createClient } from "@/lib/supabase";
import type { ManualExpense, Transaction } from "@/lib/types";

const manualExpenseCategories = [
  "Personal",
  "Car",
  "Insurance",
  "Home",
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

export default function PersonalPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(getCurrentMonthStart());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [hasInitializedMonth, setHasInitializedMonth] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Personal");
  const [isSaving, setIsSaving] = useState(false);

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
    if (!hasInitializedMonth) {
      return;
    }

    async function loadTransactions() {
      const { start, end } = monthBounds(month);
      const [transactionResult, manualResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("is_shared", false)
          .gte("date", start)
          .lt("date", end)
          .order("date", { ascending: false }),
        supabase
          .from("manual_expenses")
          .select("*")
          .gte("date", start)
          .lt("date", end)
          .order("date", { ascending: false })
      ]);

      setTransactions((transactionResult.data as Transaction[]) ?? []);
      setManualExpenses((manualResult.data as ManualExpense[]) ?? []);
    }

    loadTransactions();
  }, [hasInitializedMonth, month, supabase]);

  const combinedTransactions: Transaction[] = [
    ...transactions,
    ...manualExpenses.map((expense) => ({
      id: `manual-${expense.id}`,
      statement_id: null,
      user_id: expense.user_id,
      date: expense.date,
      merchant: expense.description,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      is_shared: false,
      created_at: expense.created_at
    }))
  ];

  const totalSpent = combinedTransactions.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
  const topCategoryTotals = Object.entries(
    combinedTransactions.reduce<Record<string, number>>((totals, transaction) => {
      const key = transaction.category?.trim() || "Other";
      totals[key] = (totals[key] ?? 0) + Number(transaction.amount ?? 0);
      return totals;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const topCategory = topCategoryTotals[0]?.[0] ?? (combinedTransactions.length ? "Other" : "None");
  const topCategoryAmount = topCategoryTotals[0]?.[1] ?? 0;
  const pieItems = topCategoryTotals.map(([label, value], index) => ({
    label,
    value,
    color: ["#4f46e5", "#0f766e", "#ea580c", "#dc2626", "#0891b2", "#7c3aed", "#65a30d", "#ca8a04", "#475569"][index % 9]
  }));

  async function addManualExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUserId || !description || !amount || !date) {
      return;
    }

    setIsSaving(true);
    await supabase.from("manual_expenses").insert({
      user_id: currentUserId,
      description,
      amount: Number(amount),
      date,
      category,
      currency: "USD"
    });

    setDescription("");
    setAmount("");
    setCategory("Personal");
    setIsSaving(false);
    setHasInitializedMonth(true);

    const { start, end } = monthBounds(month);
    const { data } = await supabase
      .from("manual_expenses")
      .select("*")
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false });
    setManualExpenses((data as ManualExpense[]) ?? []);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">Personal transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Shared transactions are excluded from every total on this page.
          </p>
        </div>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(event) => setMonth(`${event.target.value}-01`)}
        />
      </div>

      <form onSubmit={addManualExpense} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Add manual expense</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <input
            placeholder="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full"
          />
          <input
            placeholder="Amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
            className="w-full"
          />
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full">
            {manualExpenseCategories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            {isSaving ? "Saving..." : "Add expense"}
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <MonthSummaryCard
          title="Total spent"
          amount={totalSpent}
          currency="USD"
          subtitle={`For ${month.slice(0, 7)}`}
        />
        <MonthSummaryCard
          title="Top category"
          amount={topCategoryAmount}
          currency="USD"
          subtitle={topCategory}
        />
        <MonthSummaryCard
          title="Transactions"
          amount={combinedTransactions.length}
          currency=""
          subtitle="Personal only"
        />
      </div>

      <SimplePieChart title="Personal spending pie chart" items={pieItems} />

      <TransactionTable transactions={combinedTransactions} />
    </div>
  );
}
