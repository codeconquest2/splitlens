"use client";

import type { Transaction } from "@/lib/types";

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

interface TransactionTableProps {
  transactions: Transaction[];
  editable?: boolean;
  onChange?: (transactionId: string, patch: Partial<Transaction>) => void;
}

export default function TransactionTable({
  transactions,
  editable = false,
  onChange
}: TransactionTableProps) {
  if (!transactions.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No transactions yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Merchant</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Shared</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="align-top">
                <td className="px-4 py-3 text-gray-700">{transaction.date ?? "-"}</td>
                <td className="px-4 py-3">
                  {editable ? (
                    <input
                      value={transaction.merchant ?? ""}
                      onChange={(event) =>
                        onChange?.(transaction.id, { merchant: event.target.value })
                      }
                      className="w-full"
                    />
                  ) : (
                    <span className="text-gray-800">{transaction.merchant ?? "-"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editable ? (
                    <input
                      type="number"
                      step="0.01"
                      value={transaction.amount ?? ""}
                      onChange={(event) =>
                        onChange?.(transaction.id, { amount: Number(event.target.value) })
                      }
                      className="w-28"
                    />
                  ) : (
                    <span className="font-medium text-gray-900">
                      {Number(transaction.amount ?? 0).toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">{transaction.currency ?? "USD"}</td>
                <td className="px-4 py-3">
                  {editable ? (
                    <select
                      value={transaction.category ?? "Other"}
                      onChange={(event) =>
                        onChange?.(transaction.id, { category: event.target.value })
                      }
                      className="w-full"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-700">{transaction.category ?? "Other"}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editable ? (
                    <label className="flex items-center gap-2 text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(transaction.is_shared)}
                        onChange={(event) =>
                          onChange?.(transaction.id, { is_shared: event.target.checked })
                        }
                      />
                      Shared
                    </label>
                  ) : (
                    <span className="text-gray-700">
                      {transaction.is_shared ? "Yes" : "No"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
