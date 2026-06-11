"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SharedExpenseForm from "@/components/SharedExpenseForm";
import SplitSummaryCard from "@/components/SplitSummaryCard";
import { createClient } from "@/lib/supabase";
import type {
  Contact,
  ExpenseSplit,
  Group,
  GroupMember,
  Profile,
  SharedExpense,
  SharedExpensePayload
} from "@/lib/types";

interface ExpenseWithSplits {
  expense: SharedExpense;
  splits: ExpenseSplit[];
}

export default function SharedPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [memberships, setMemberships] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "high" | "low">("newest");

  const loadData = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      setCurrentUserId(user.id);
    }

    const [profilesResult, contactsResult, groupsResult, membersResult, expensesResult, splitsResult] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("groups").select("*"),
      supabase.from("group_members").select("*"),
      supabase
        .from("shared_expenses")
        .select("*")
        .eq("created_by", user?.id ?? "")
        .order("date", { ascending: false }),
      supabase.from("expense_splits").select("*")
    ]);

    const splitMap = ((splitsResult.data as ExpenseSplit[]) ?? []).reduce<Record<string, ExpenseSplit[]>>(
      (accumulator, split) => {
        const key = split.expense_id ?? "";
        accumulator[key] = [...(accumulator[key] ?? []), split];
        return accumulator;
      },
      {}
    );

    setProfiles((profilesResult.data as Profile[]) ?? []);
    setContacts((contactsResult.data as Contact[]) ?? []);
    setGroups((groupsResult.data as Group[]) ?? []);
    setMemberships((membersResult.data as GroupMember[]) ?? []);
    setExpenses(
      ((expensesResult.data as SharedExpense[]) ?? []).map((expense) => ({
        expense,
        splits: splitMap[expense.id] ?? []
      }))
    );
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateExpense(payload: SharedExpensePayload) {
    const { data: expense, error: expenseError } = await supabase
      .from("shared_expenses")
      .insert({
        created_by: payload.paidBy,
        description: payload.description,
        total_amount: payload.amount,
        currency: payload.currency,
        date: payload.date
      })
      .select("*")
      .single();

    if (expenseError || !expense) {
      throw expenseError ?? new Error("Failed to create expense.");
    }

    const splits =
      payload.payerMode === "self"
        ? payload.participantIds.map((participantId) => ({
            expense_id: expense.id,
            user_id: null,
            contact_id: participantId,
            amount_owed: payload.customAmounts?.[participantId] ?? 0,
            paid: false
          }))
        : [
            {
              expense_id: expense.id,
              user_id: currentUserId,
              contact_id: null,
              amount_owed: payload.yourShare ?? 0,
              paid: false
            }
          ];

    const { error: splitError } = await supabase.from("expense_splits").insert(splits);

    if (splitError) {
      throw splitError;
    }

    await loadData();
  }

  const runningBalances = expenses.reduce<
    Record<string, { amount: number; currency: string; splitIds: string[]; label: string; latestAt: string }>
  >((accumulator, item) => {
    item.splits
      .filter((split) => !split.paid)
      .forEach((split) => {
        if (split.contact_id) {
          const contact = contacts.find((entry) => entry.id === split.contact_id);
          const key = `contact:${split.contact_id}`;
          const current = accumulator[key] ?? {
            amount: 0,
            currency: item.expense.currency ?? "USD",
            splitIds: [],
            label: contact?.name ?? contact?.email ?? "Unknown person",
            latestAt: item.expense.created_at
          };
          current.amount += item.expense.created_by === currentUserId
            ? Number(split.amount_owed ?? 0)
            : -Number(split.amount_owed ?? 0);
          current.splitIds.push(split.id);
          current.latestAt = current.latestAt > item.expense.created_at ? current.latestAt : item.expense.created_at;
          accumulator[key] = current;
          return;
        }

        if (split.user_id === currentUserId) {
          const key = item.expense.description?.includes("others owe you")
            ? `import:${item.expense.id}`
            : `you-owe:${item.expense.id}`;
          const label = item.expense.description?.includes("others owe you")
            ? "Splitwise import"
            : "You owe";
          const current = accumulator[key] ?? {
            amount: 0,
            currency: item.expense.currency ?? "USD",
            splitIds: [],
            label,
            latestAt: item.expense.created_at
          };
          current.amount += item.expense.description?.includes("others owe you")
            ? Number(split.amount_owed ?? 0)
            : -Number(split.amount_owed ?? 0);
          current.splitIds.push(split.id);
          current.latestAt = current.latestAt > item.expense.created_at ? current.latestAt : item.expense.created_at;
          accumulator[key] = current;
        }
      });

    return accumulator;
  }, {});

  const youOweEntries = expenses.flatMap((item) =>
    item.splits
      .filter(
        (split) =>
          !split.paid &&
          split.user_id === currentUserId &&
          !item.expense.description?.includes("others owe you")
      )
      .map((split) => ({
        id: split.id,
        description: item.expense.description ?? "Shared expense",
        currency: item.expense.currency ?? "USD",
        amount: Number(split.amount_owed ?? 0)
      }))
  );
  const sortedRunningBalances = Object.entries(runningBalances)
    .filter(([personKey]) => !personKey.startsWith("you-owe:"))
    .sort((a, b) => {
      if (sortBy === "high") {
        return b[1].amount - a[1].amount;
      }
      if (sortBy === "low") {
        return a[1].amount - b[1].amount;
      }
      return b[1].latestAt.localeCompare(a[1].latestAt);
    });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black">Shared expenses</h1>
        <Link
          href="/shared/import"
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-black hover:border-indigo-600"
        >
          Import from Splitwise
        </Link>
      </div>

      <div className="space-y-6">
        <SharedExpenseForm
          onSubmit={handleCreateExpense}
          groupList={groups}
          contactsList={contacts}
          currentUserId={currentUserId}
        />

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-black">Running balances</h2>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "newest" | "high" | "low")}
              className="w-40"
            >
              <option value="newest">Newest</option>
              <option value="high">High to low</option>
              <option value="low">Low to high</option>
            </select>
          </div>
          <div className="mt-4 space-y-4">
            {sortedRunningBalances.map(([personKey, summary]) => {
              return (
                <SplitSummaryCard
                  key={personKey}
                  personName={summary.label}
                  amountOwed={summary.amount}
                  currency={summary.currency}
                  splitIds={summary.splitIds}
                  onSettled={loadData}
                />
              );
            })}
            {!sortedRunningBalances.length ? (
              <p className="text-sm text-gray-500">No outstanding balances right now.</p>
            ) : null}
            {youOweEntries.length ? (
              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-black">You owe</h3>
                <div className="mt-3 space-y-2">
                  {youOweEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
                    >
                      <span>{entry.description}</span>
                      <span>
                        {entry.currency} {entry.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-black">All shared expenses</h2>
        <div className="mt-4 space-y-3">
          {expenses.map(({ expense, splits }) => (
            <div key={expense.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-black">{expense.description}</p>
                  <p className="text-sm text-gray-500">
                    {expense.date} · {expense.currency} {Number(expense.total_amount ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                {splits.map((split) => {
                  const person = split.contact_id
                    ? contacts.find((contact) => contact.id === split.contact_id)
                    : profiles.find((profile) => profile.id === split.user_id);
                  return (
                    <div key={split.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <span>{person?.name ?? person?.email ?? "Unknown person"}</span>
                      <span>
                        {expense.currency} {Number(split.amount_owed ?? 0).toFixed(2)} ·{" "}
                        {split.paid ? "Settled" : "Outstanding"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!expenses.length ? <p className="text-sm text-gray-500">No shared expenses yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
