"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MonthSummaryCard from "@/components/MonthSummaryCard";
import SimplePieChart from "@/components/SimplePieChart";
import { createClient } from "@/lib/supabase";
import type { Contact, ExpenseSplit, ManualExpense, SharedExpense, Transaction } from "@/lib/types";

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

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(getCurrentMonthStart());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [hasInitializedMonth, setHasInitializedMonth] = useState(false);

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

    async function loadData() {
      const { start, end } = monthBounds(month);
      const [txResult, manualResult, expensesResult, splitsResult, contactsResult] = await Promise.all([
        supabase.from("transactions").select("*").gte("date", start).lt("date", end),
        supabase.from("manual_expenses").select("*").gte("date", start).lt("date", end),
        supabase.from("shared_expenses").select("*").eq("created_by", currentUserId || "00000000-0000-0000-0000-000000000000"),
        supabase.from("expense_splits").select("*"),
        supabase.from("contacts").select("*")
      ]);

      setTransactions((txResult.data as Transaction[]) ?? []);
      setManualExpenses((manualResult.data as ManualExpense[]) ?? []);
      setExpenses((expensesResult.data as SharedExpense[]) ?? []);
      setSplits((splitsResult.data as ExpenseSplit[]) ?? []);
      setContacts((contactsResult.data as Contact[]) ?? []);
    }

    loadData();
  }, [currentUserId, hasInitializedMonth, month, supabase]);

  const { start, end } = monthBounds(month);
  const monthlyExpenses = expenses.filter((expense) => expense.date && expense.date >= start && expense.date < end);
  const combinedTransactions = [
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
  const cardSpend = combinedTransactions.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
  const runningBalances = splits.reduce<
    Record<string, { label: string; amount: number }>
  >((accumulator, split) => {
    const expense = expenses.find((entry) => entry.id === split.expense_id);
    if (!expense || split.paid) {
      return accumulator;
    }

    if (split.contact_id) {
      const contact = contacts.find((entry) => entry.id === split.contact_id);
      const key = `contact:${split.contact_id}`;
      const current = accumulator[key] ?? {
        label: contact?.name ?? contact?.email ?? "Unknown person",
        amount: 0
      };
      current.amount += expense.created_by === currentUserId
        ? Number(split.amount_owed ?? 0)
        : -Number(split.amount_owed ?? 0);
      accumulator[key] = current;
      return accumulator;
    }

    if (split.user_id === currentUserId) {
      const isImportOwed = expense.created_by === currentUserId && expense.description?.includes("others owe you");
      const key = isImportOwed ? `import:${expense.id}` : `you-owe:${expense.id}`;
      const current = accumulator[key] ?? {
        label: isImportOwed ? "Splitwise import" : "You owe",
        amount: 0
      };
      current.amount += isImportOwed
        ? Number(split.amount_owed ?? 0)
        : -Number(split.amount_owed ?? 0);
      accumulator[key] = current;
    }

    return accumulator;
  }, {});

  const reimbursable = Object.values(runningBalances).reduce(
    (sum, entry) => sum + entry.amount,
    0
  );
  const netSpend = cardSpend - reimbursable;
  const totalOwedToMe = Object.values(runningBalances).reduce(
    (sum, entry) => sum + (entry.amount > 0 ? entry.amount : 0),
    0
  );
  const totalIOwe = Object.values(runningBalances).reduce(
    (sum, entry) => sum + (entry.amount < 0 ? Math.abs(entry.amount) : 0),
    0
  );
  const splitwiseOwedToMe = splits.reduce((sum, split) => {
    const expense = expenses.find((entry) => entry.id === split.expense_id);
    if (
      !expense ||
      split.paid ||
      !expense.description?.includes("Imported from Splitwise") ||
      !expense.description?.includes("others owe you")
    ) {
      return sum;
    }
    return sum + Number(split.amount_owed ?? 0);
  }, 0);
  const splitwiseIOwe = splits.reduce((sum, split) => {
    const expense = expenses.find((entry) => entry.id === split.expense_id);
    if (
      !expense ||
      split.paid ||
      !expense.description?.includes("Imported from Splitwise") ||
      !expense.description?.includes("you owe someone else")
    ) {
      return sum;
    }
    return sum + Number(split.amount_owed ?? 0);
  }, 0);

  const personalByCategory = Object.entries(
    combinedTransactions
      .filter((transaction) => !transaction.is_shared)
      .reduce<Record<string, number>>((totals, transaction) => {
        const category = transaction.category ?? "Other";
        totals[category] = (totals[category] ?? 0) + Number(transaction.amount ?? 0);
        return totals;
      }, {})
  ).sort((a, b) => b[1] - a[1]);

  const maxCategorySpend = personalByCategory[0]?.[1] ?? 1;
  const categoryPieItems = personalByCategory.map(([label, value], index) => ({
    label,
    value,
    color: ["#4f46e5", "#0f766e", "#ea580c", "#dc2626", "#0891b2", "#7c3aed", "#65a30d", "#ca8a04", "#475569"][index % 9]
  }));
  const totalPieItems = [
    { label: "Credit card", value: cardSpend, color: "#4f46e5" },
    { label: "Owed to me", value: totalOwedToMe, color: "#0f766e" },
    { label: "I owe", value: totalIOwe, color: "#dc2626" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-black">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of card spend and shared balances.</p>
        </div>
        <input
          type="month"
          value={month.slice(0, 7)}
          onChange={(event) => setMonth(`${event.target.value}-01`)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/personal" className="block">
          <MonthSummaryCard title="Card spend" amount={cardSpend} currency="USD" subtitle={`For ${month.slice(0, 7)}`} />
        </Link>
        <Link href="/shared" className="block">
          <MonthSummaryCard
            title="Reimbursable"
            amount={reimbursable}
            currency="USD"
            subtitle="Net running balance"
          />
        </Link>
        <MonthSummaryCard title="Net spend" amount={netSpend} currency="USD" subtitle="Card spend minus reimbursable" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/shared"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-600"
        >
          <p className="text-sm font-medium text-gray-500">Splitwise owed to me</p>
          <p className="mt-2 text-3xl font-semibold text-black">USD {splitwiseOwedToMe.toFixed(2)}</p>
          <p className="mt-2 text-sm text-gray-500">Open Shared expenses</p>
        </Link>
        <Link
          href="/shared"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-600"
        >
          <p className="text-sm font-medium text-gray-500">Splitwise I owe</p>
          <p className="mt-2 text-3xl font-semibold text-black">USD {splitwiseIOwe.toFixed(2)}</p>
          <p className="mt-2 text-sm text-gray-500">Open Shared expenses</p>
        </Link>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Spending by category</h2>
        <div className="mt-6 overflow-x-auto">
          <svg
            viewBox={`0 0 ${Math.max(620, personalByCategory.length * 80 + Math.max(0, personalByCategory.length - 1) * 20 + 80)} 260`}
            className="h-[260px]"
            style={{
              minWidth: `${Math.max(620, personalByCategory.length * 80 + Math.max(0, personalByCategory.length - 1) * 20 + 80)}px`
            }}
          >
            {personalByCategory.map(([category, amount], index) => {
              const barHeight = (amount / maxCategorySpend) * 160;
              const x = 40 + index * 100;
            const y = 210 - barHeight;
            return (
              <g key={category}>
                <rect x={x} y={y} width="60" height={barHeight} rx="10" fill="#4f46e5" />
                <text x={x + 30} y="238" textAnchor="middle" fontSize="12" fill="#374151">
                  {category}
                </text>
                <text x={x + 30} y={y - 8} textAnchor="middle" fontSize="12" fill="#111827">
                  {amount.toFixed(0)}
                </text>
              </g>
            );
            })}
          </svg>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SimplePieChart title="Spending pie chart" items={categoryPieItems} />
        <SimplePieChart title="Total spend split" items={totalPieItems} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Shared balances</h2>
        <div className="mt-4 space-y-3">
          {Object.entries(runningBalances).map(([personKey, entry]) => {
            return (
              <div key={personKey} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <span className="text-gray-700">{entry.label}</span>
                <span className="font-medium text-black">
                  USD {entry.amount >= 0 ? entry.amount.toFixed(2) : `-${Math.abs(entry.amount).toFixed(2)}`}
                </span>
              </div>
            );
          })}
          {!Object.keys(runningBalances).length ? <p className="text-sm text-gray-500">No shared balances yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
