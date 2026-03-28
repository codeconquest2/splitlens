"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

interface SplitSummaryCardProps {
  personName: string;
  amountOwed: number;
  currency: string;
  splitIds: string[];
  onSettled: () => void;
}

export default function SplitSummaryCard({
  personName,
  amountOwed,
  currency,
  splitIds,
  onSettled
}: SplitSummaryCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [isSaving, setIsSaving] = useState(false);

  async function markSettled() {
    setIsSaving(true);
    const { error } = await supabase
      .from("expense_splits")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .in("id", splitIds);

    setIsSaving(false);

    if (!error) {
      onSettled();
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{personName}</p>
      <p className={`mt-2 text-2xl font-semibold ${amountOwed < 0 ? "text-red-600" : "text-black"}`}>
        {currency} {amountOwed < 0 ? `-${Math.abs(amountOwed).toFixed(2)}` : amountOwed.toFixed(2)}
      </p>
      <button
        type="button"
        onClick={markSettled}
        disabled={isSaving || splitIds.length === 0}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
      >
        {isSaving ? "Updating..." : "Mark settled"}
      </button>
    </div>
  );
}
