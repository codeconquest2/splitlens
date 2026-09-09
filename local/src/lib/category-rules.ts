import { createLocalDatabaseClient } from "@/lib/local-db";
import { CATEGORIES } from "@/lib/pipeline/prompts";

type TransactionWithCategory = {
  merchant: string;
  category: string;
  is_payment?: boolean;
};

export interface CategoryRule {
  id: string;
  user_id: string;
  merchant_pattern: string;
  category: string;
  is_payment: boolean;
  created_at: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeRuleCategory(category: string) {
  return CATEGORIES.find((candidate) => candidate.toLowerCase() === category.trim().toLowerCase()) ?? "Other";
}

export async function getCategoryRules(userId: string) {
  const db = createLocalDatabaseClient();
  const { data } = await db
    .from("category_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data as CategoryRule[]) ?? []).filter((rule) => rule.merchant_pattern);
}

export async function createCategoryRule(
  userId: string,
  rule: { merchant_pattern: string; category: string; is_payment?: boolean }
) {
  const merchantPattern = rule.merchant_pattern.trim();
  if (!merchantPattern) {
    throw new Error("Merchant pattern is required.");
  }

  const db = createLocalDatabaseClient();
  const { data } = await db
    .from("category_rules")
    .insert({
      user_id: userId,
      merchant_pattern: merchantPattern,
      category: normalizeRuleCategory(rule.category),
      is_payment: Boolean(rule.is_payment)
    })
    .select("*")
    .single();
  return data as CategoryRule;
}

export async function applyCategoryRules<T extends TransactionWithCategory>(userId: string, transactions: T[]) {
  const rules = await getCategoryRules(userId);
  if (!rules.length) return transactions;

  return transactions.map((transaction) => {
    const merchant = normalize(transaction.merchant);
    const match = rules.find((rule) => merchant.includes(normalize(rule.merchant_pattern)));
    if (!match) return transaction;
    return {
      ...transaction,
      category: normalizeRuleCategory(match.category),
      is_payment: match.is_payment || transaction.is_payment
    };
  });
}
