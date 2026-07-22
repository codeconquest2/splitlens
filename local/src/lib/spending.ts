import type { ManualExpense, Transaction } from "@/lib/types";

const paymentMerchantPatterns = [
  /\bpayment\b/i,
  /\bautopay\b/i,
  /\bauto[\s-]?pay\b/i,
  /\bthank you\b/i,
  /\bpayment received\b/i,
  /\bonline payment\b/i,
  /\bcard payment\b/i,
  /\btransfer from\b/i,
  /\brefund\b/i,
  /\breversal\b/i,
  /\bcredit adjustment\b/i,
  /\bminimum payment\b/i,
  /\bstatement credit\b/i
];

export function monthBounds(month: string) {
  const start = month;
  const date = new Date(start);
  date.setMonth(date.getMonth() + 1);
  const end = date.toISOString().slice(0, 10);
  return { start, end };
}

export function previousMonthStart(month: string) {
  const date = new Date(month);
  date.setMonth(date.getMonth() - 1);
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

export function getCurrentMonthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

export function looksLikePayment(merchant: string) {
  return paymentMerchantPatterns.some((pattern) => pattern.test(merchant));
}

type SpendRow = Pick<Transaction, "amount" | "merchant" | "is_payment" | "is_shared">;

export function isSpendTransaction(transaction: SpendRow) {
  if (transaction.is_payment) {
    return false;
  }

  if (looksLikePayment(transaction.merchant ?? "")) {
    return false;
  }

  return Number(transaction.amount ?? 0) > 0;
}

export function sumSpend(transactions: SpendRow[]) {
  return transactions.filter(isSpendTransaction).reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
}

export function manualExpenseAsTransaction(expense: ManualExpense): Transaction {
  return {
    id: `manual-${expense.id}`,
    statement_id: null,
    user_id: expense.user_id,
    date: expense.date,
    merchant: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    is_shared: false,
    is_payment: false,
    created_at: expense.created_at
  };
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
}
