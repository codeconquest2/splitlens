"use client";

import { useEffect, useState } from "react";
import type { Contact, Group, SharedExpensePayload } from "@/lib/types";

interface SharedExpenseFormProps {
  onSubmit: (payload: SharedExpensePayload) => Promise<void>;
  groupList: Group[];
  contactsList: Pick<Contact, "id" | "name" | "email">[];
  currentUserId: string;
}

export default function SharedExpenseForm({
  onSubmit,
  groupList,
  contactsList,
  currentUserId
}: SharedExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [payerMode, setPayerMode] = useState<"self" | "other" | "equal">("self");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [yourShare, setYourShare] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!participantIds.length || !amount) {
      setCustomAmounts({});
      setYourShare("");
      return;
    }

    if (payerMode === "self") {
      const share = Number(amount) / participantIds.length;
      const nextAmounts = participantIds.reduce<Record<string, number>>((accumulator, id) => {
        accumulator[id] = Number(share.toFixed(2));
        return accumulator;
      }, {});
      setCustomAmounts(nextAmounts);
      return;
    }

    const equalShare = Number(amount) / (participantIds.length + 1);
    setYourShare(equalShare.toFixed(2));
  }, [amount, participantIds, payerMode]);

  function toggleUser(userId: string) {
    setParticipantIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = Number(amount);
    const hasParticipants = participantIds.length > 0;

    if (!description || !total || !hasParticipants || !currentUserId) {
      setError("Fill in description, amount, payer, and split participants.");
      return;
    }

    if (payerMode === "self") {
      const sum = participantIds.reduce(
        (runningTotal, userId) => runningTotal + Number(customAmounts[userId] ?? 0),
        0
      );

      if (sum > total + 0.01) {
        setError("What others owe cannot exceed the total expense.");
        return;
      }
    }

    if ((payerMode === "other" || payerMode === "equal") && !yourShare) {
      setError("Enter how much you owe.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        description,
        amount: total,
        currency,
        date,
        paidBy: currentUserId,
        participantIds,
        payerMode,
        yourShare: payerMode === "self" ? undefined : Number(yourShare),
        selectionMode: "contacts",
        splitType: "custom",
        customAmounts
      });

      setDescription("");
      setAmount("");
      setParticipantIds([]);
      setCustomAmounts({});
      setYourShare("");
      setPayerMode("self");
    } catch (submissionError) {
      const message =
        submissionError instanceof Error ? submissionError.message : "Failed to add expense.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-black">Add shared expense</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Amount</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Currency</label>
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="w-full">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Date</label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Who paid?</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setPayerMode("self")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                payerMode === "self"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              I paid
            </button>
            <button
              type="button"
              onClick={() => setPayerMode("other")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                payerMode === "other"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              They paid
            </button>
            <button
              type="button"
              onClick={() => setPayerMode("equal")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                payerMode === "equal"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              Equal split
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4">
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {contactsList.map((contact) => (
            <label
              key={contact.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 text-sm"
            >
              <span>{contact.name ?? contact.email ?? "Unknown person"}</span>
              <input
                type="checkbox"
                checked={participantIds.includes(contact.id)}
                onChange={() => toggleUser(contact.id)}
              />
            </label>
          ))}
        </div>
      </div>

      {payerMode === "self" && participantIds.length ? (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">How much does each person owe you?</p>
            <p className="mt-1 text-sm text-gray-500">
              You keep: ${(Number(amount || 0) - participantIds.reduce((sum, id) => sum + Number(customAmounts[id] ?? 0), 0)).toFixed(2)}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {participantIds.map((participantId) => {
              const contact = contactsList.find((entry) => entry.id === participantId);
              return (
                <div key={participantId}>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {contact?.name ?? contact?.email ?? "Participant"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={customAmounts[participantId] ?? ""}
                    onChange={(event) =>
                      setCustomAmounts((current) => ({
                        ...current,
                        [participantId]: Number(event.target.value)
                      }))
                    }
                    className="w-full"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {(payerMode === "other" || payerMode === "equal") && participantIds.length ? (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">
              {payerMode === "equal" ? "Your equal share" : "How much do you owe?"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Total expense: ${Number(amount || 0).toFixed(2)}, Your share: ${Number(yourShare || 0).toFixed(2)}
            </p>
          </div>
          <div className="max-w-xs">
            <input
              type="number"
              step="0.01"
              value={yourShare}
              onChange={(event) => setYourShare(event.target.value)}
              className="w-full"
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
      >
        {isSubmitting ? "Saving..." : "Save shared expense"}
      </button>
    </form>
  );
}
