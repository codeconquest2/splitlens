import type { SharedExpense, Transaction } from "@/lib/types";
import { isSpendTransaction } from "@/lib/spending";

export interface ReconcileMatch {
  transaction_id: string;
  expense_id: string;
  score: number;
  reason: string;
  transaction: Pick<Transaction, "id" | "date" | "merchant" | "amount" | "currency">;
  expense: Pick<SharedExpense, "id" | "date" | "description" | "total_amount" | "currency" | "transaction_id">;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function descriptionOverlap(merchant: string, description: string) {
  const merchantTokens = new Set(tokenize(merchant));
  const descriptionTokens = tokenize(description);
  if (!merchantTokens.size || !descriptionTokens.length) {
    return 0;
  }

  const overlap = descriptionTokens.filter((token) => merchantTokens.has(token)).length;
  return overlap / Math.max(descriptionTokens.length, 1);
}

function daysBetween(left: string | null, right: string | null) {
  if (!left || !right) {
    return Number.POSITIVE_INFINITY;
  }

  const leftDate = new Date(left).getTime();
  const rightDate = new Date(right).getTime();
  if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(leftDate - rightDate) / (1000 * 60 * 60 * 24);
}

function amountDelta(left: number, right: number) {
  return Math.abs(left - right);
}

export function scoreReconcileMatch(transaction: Transaction, expense: SharedExpense) {
  const txAmount = Number(transaction.amount ?? 0);
  const expenseAmount = Number(expense.total_amount ?? 0);
  const dayGap = daysBetween(transaction.date, expense.date);
  const amountGap = amountDelta(txAmount, expenseAmount);
  const overlap = descriptionOverlap(transaction.merchant ?? "", expense.description ?? "");

  if (!isSpendTransaction(transaction)) {
    return { score: 0, reason: "Not a spend transaction" };
  }

  if (expense.transaction_id) {
    return { score: 0, reason: "Already linked" };
  }

  let score = 0;
  const reasons: string[] = [];

  if (amountGap <= 0.02) {
    score += 50;
    reasons.push("exact amount");
  } else if (amountGap <= 1) {
    score += 30;
    reasons.push("close amount");
  } else {
    return { score: 0, reason: "Amount mismatch" };
  }

  if (dayGap <= 1) {
    score += 35;
    reasons.push("same day");
  } else if (dayGap <= 3) {
    score += 25;
    reasons.push("within 3 days");
  } else if (dayGap <= 7) {
    score += 10;
    reasons.push("within 7 days");
  } else {
    return { score: 0, reason: "Date too far apart" };
  }

  if (overlap >= 0.5) {
    score += 15;
    reasons.push("description match");
  } else if (overlap > 0) {
    score += 8;
    reasons.push("partial description match");
  }

  return {
    score: Math.min(score, 100),
    reason: reasons.join(", ")
  };
}

export function findReconcileMatches(
  transactions: Transaction[],
  expenses: SharedExpense[],
  minScore = 60
): ReconcileMatch[] {
  const matches: ReconcileMatch[] = [];
  const usedTransactions = new Set<string>();
  const usedExpenses = new Set<string>();

  const candidates: ReconcileMatch[] = [];

  for (const transaction of transactions) {
    for (const expense of expenses) {
      const { score, reason } = scoreReconcileMatch(transaction, expense);
      if (score < minScore) {
        continue;
      }

      candidates.push({
        transaction_id: transaction.id,
        expense_id: expense.id,
        score,
        reason,
        transaction: {
          id: transaction.id,
          date: transaction.date,
          merchant: transaction.merchant,
          amount: transaction.amount,
          currency: transaction.currency
        },
        expense: {
          id: expense.id,
          date: expense.date,
          description: expense.description,
          total_amount: expense.total_amount,
          currency: expense.currency,
          transaction_id: expense.transaction_id
        }
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  for (const match of candidates) {
    if (usedTransactions.has(match.transaction_id) || usedExpenses.has(match.expense_id)) {
      continue;
    }

    usedTransactions.add(match.transaction_id);
    usedExpenses.add(match.expense_id);
    matches.push(match);
  }

  return matches;
}

export function yourShareForExpense(
  expense: Pick<SharedExpense, "id" | "created_by" | "total_amount">,
  splits: Array<{ expense_id: string | null; user_id: string | null; contact_id: string | null; amount_owed: number | string | null }>,
  currentUserId: string
) {
  const expenseSplits = splits.filter((split) => split.expense_id === expense.id);
  const youOwe = expenseSplits
    .filter((split) => split.user_id === currentUserId)
    .reduce((sum, split) => sum + Number(split.amount_owed ?? 0), 0);
  const owedToYou = expenseSplits
    .filter((split) => split.contact_id)
    .reduce((sum, split) => sum + Number(split.amount_owed ?? 0), 0);

  if (expense.created_by === currentUserId && owedToYou > 0) {
    return Number(expense.total_amount ?? 0) - owedToYou;
  }

  if (youOwe > 0) {
    return youOwe;
  }

  return Number(expense.total_amount ?? 0);
}
