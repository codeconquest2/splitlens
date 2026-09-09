"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MonthSummaryCard from "@/components/MonthSummaryCard";
import SimplePieChart from "@/components/SimplePieChart";
import { createClient } from "@/lib/local-data-client";
import {
  getCurrentMonthStart,
  isSpendTransaction,
  manualExpenseAsTransaction,
  monthBounds,
  percentChange,
  previousMonthStart,
  sumSpend
} from "@/lib/spending";
import type { Contact, ExpenseSplit, ManualExpense, SharedExpense, Transaction } from "@/lib/types";

function formatDelta(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(getCurrentMonthStart());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [previousTransactions, setPreviousTransactions] = useState<Transaction[]>([]);
  const [previousManualExpenses, setPreviousManualExpenses] = useState<ManualExpense[]>([]);
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
      const previousMonth = previousMonthStart(month);
      const previousBounds = monthBounds(previousMonth);
      const [txResult, manualResult, expensesResult, splitsResult, contactsResult, prevTxResult, prevManualResult] =
        await Promise.all([
        supabase.from("transactions").select("*").gte("date", start).lt("date", end),
        supabase.from("manual_expenses").select("*").gte("date", start).lt("date", end),
        supabase.from("shared_expenses").select("*").eq("created_by", currentUserId || "00000000-0000-0000-0000-000000000000"),
        supabase.from("expense_splits").select("*"),
        supabase.from("contacts").select("*"),
        supabase
          .from("transactions")
          .select("*")
          .gte("date", previousBounds.start)
          .lt("date", previousBounds.end),
        supabase
          .from("manual_expenses")
          .select("*")
          .gte("date", previousBounds.start)
          .lt("date", previousBounds.end)
      ]);

      setTransactions((txResult.data as Transaction[]) ?? []);
      setManualExpenses((manualResult.data as ManualExpense[]) ?? []);
      setExpenses((expensesResult.data as SharedExpense[]) ?? []);
      setSplits((splitsResult.data as ExpenseSplit[]) ?? []);
      setContacts((contactsResult.data as Contact[]) ?? []);
      setPreviousTransactions((prevTxResult.data as Transaction[]) ?? []);
      setPreviousManualExpenses((prevManualResult.data as ManualExpense[]) ?? []);
    }

    loadData();
  }, [currentUserId, hasInitializedMonth, month, supabase]);

  const { start, end } = monthBounds(month);
  const monthlyExpenses = expenses.filter((expense) => expense.date && expense.date >= start && expense.date < end);
  const monthlyExpenseIds = new Set(monthlyExpenses.map((expense) => expense.id));
  const monthlySplits = splits.filter((split) => monthlyExpenseIds.has(split.expense_id ?? ""));
  const combinedTransactions = [
    ...transactions,
    ...manualExpenses.map(manualExpenseAsTransaction)
  ];
  const previousCombinedTransactions = [
    ...previousTransactions,
    ...previousManualExpenses.map(manualExpenseAsTransaction)
  ];
  const cardSpend = sumSpend(combinedTransactions);
  const previousCardSpend = sumSpend(previousCombinedTransactions);
  const spendDelta = percentChange(cardSpend, previousCardSpend);
  const runningBalances = monthlySplits.reduce<
    Record<string, { label: string; amount: number }>
  >((accumulator, split) => {
    const expense = monthlyExpenses.find((entry) => entry.id === split.expense_id);
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
      if (expense.paid_by_contact_id) {
        const contact = contacts.find((entry) => entry.id === expense.paid_by_contact_id);
        const key = `contact:${expense.paid_by_contact_id}`;
        const current = accumulator[key] ?? {
          label: contact?.name ?? contact?.email ?? "Unknown person",
          amount: 0
        };
        current.amount -= Number(split.amount_owed ?? 0);
        accumulator[key] = current;
        return accumulator;
      }

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
  const splitwiseOwedToMe = monthlySplits.reduce((sum, split) => {
    const expense = monthlyExpenses.find((entry) => entry.id === split.expense_id);
    if (!expense || split.paid || !split.contact_id) {
      return sum;
    }
    if (expense.created_by !== currentUserId) {
      return sum;
    }
    return sum + Number(split.amount_owed ?? 0);
  }, 0);
  const splitwiseIOwe = monthlySplits.reduce((sum, split) => {
    const expense = monthlyExpenses.find((entry) => entry.id === split.expense_id);
    if (!expense || split.paid || split.user_id !== currentUserId) {
      return sum;
    }
    return sum + Number(split.amount_owed ?? 0);
  }, 0);

  const personalByCategory = Object.entries(
    combinedTransactions
      .filter((transaction) => !transaction.is_shared && isSpendTransaction(transaction))
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
  const comparisonMax = Math.max(cardSpend, previousCardSpend, 1);
  const previousBarHeight = (previousCardSpend / comparisonMax) * 80;
  const currentBarHeight = (cardSpend / comparisonMax) * 80;

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
          <MonthSummaryCard
            title="Card spend"
            amount={cardSpend}
            currency="USD"
            subtitle={`For ${month.slice(0, 7)} · ${formatDelta(spendDelta)} vs last month`}
          />
        </Link>
        <Link href="/shared" className="block">
          <MonthSummaryCard
            title="Reimbursable"
            amount={reimbursable}
            currency="USD"
            subtitle={`Net balance for ${month.slice(0, 7)}`}
          />
        </Link>
        <MonthSummaryCard title="Net spend" amount={netSpend} currency="USD" subtitle="Card spend minus reimbursable" />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Month over month</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{month.slice(0, 7)}</p>
            <p className="mt-2 text-2xl font-semibold text-black">USD {cardSpend.toFixed(2)}</p>
            <p className="mt-1 text-sm text-gray-500">Excludes payments and refunds</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{previousMonthStart(month).slice(0, 7)}</p>
            <p className="mt-2 text-2xl font-semibold text-black">USD {previousCardSpend.toFixed(2)}</p>
            <p className={`mt-1 text-sm ${spendDelta > 0 ? "text-red-600" : spendDelta < 0 ? "text-emerald-600" : "text-gray-500"}`}>
              {formatDelta(spendDelta)} from previous month
            </p>
          </div>
        </div>
        <div className="mt-6">
          <svg viewBox="0 0 360 120" className="h-[120px] w-full max-w-md">
            <rect x="40" y={100 - previousBarHeight} width="100" height={Math.max(8, previousBarHeight)} rx="8" fill="#94a3b8" />
            <rect x="220" y={100 - currentBarHeight} width="100" height={Math.max(8, currentBarHeight)} rx="8" fill="#4f46e5" />
            <text x="90" y="115" textAnchor="middle" fontSize="12" fill="#6b7280">
              {previousMonthStart(month).slice(0, 7)}
            </text>
            <text x="270" y="115" textAnchor="middle" fontSize="12" fill="#6b7280">
              {month.slice(0, 7)}
            </text>
          </svg>
        </div>
      </section>

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
        <h2 className="text-lg font-semibold text-black">Shared balances ({month.slice(0, 7)})</h2>
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
