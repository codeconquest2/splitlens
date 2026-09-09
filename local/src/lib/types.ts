export type StatementStatus = "processing" | "review" | "done";
export type SplitType = "equal" | "custom";

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  preferred_currency: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  created_by: string | null;
  name: string;
  email: string | null;
  note: string | null;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Statement {
  id: string;
  user_id: string | null;
  month: string;
  source_filename: string | null;
  status: StatementStatus;
  created_at: string;
}

export interface Transaction {
  id: string;
  statement_id: string | null;
  user_id: string | null;
  date: string | null;
  merchant: string | null;
  amount: number | string | null;
  currency: string | null;
  category: string | null;
  is_shared: boolean | null;
  is_payment: boolean | null;
  created_at: string;
}

export interface StatementParseDebug {
  id: string;
  statement_id: string | null;
  extraction_provider: string;
  categorization_provider: string;
  raw_text: string | null;
  parsed_count: number;
  saved_count: number;
  duplicate_count: number;
  warnings: string[];
  duplicate_rows?: Array<Record<string, unknown>>;
  skipped_rows?: Array<Record<string, unknown>>;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string | null;
  month: string;
  category: string;
  planned_amount: number | string;
  currency: string | null;
  created_at: string;
}

export interface ManualExpense {
  id: string;
  user_id: string | null;
  date: string;
  description: string;
  amount: number | string;
  currency: string | null;
  category: string;
  created_at: string;
}

export interface SharedExpense {
  id: string;
  created_by: string | null;
  group_id: string | null;
  transaction_id: string | null;
  paid_by_contact_id: string | null;
  description: string | null;
  total_amount: number | string | null;
  currency: string | null;
  date: string | null;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string | null;
  user_id: string | null;
  contact_id: string | null;
  amount_owed: number | string | null;
  paid: boolean | null;
  paid_at: string | null;
  created_at: string;
}

export interface ParsedTransaction {
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  is_payment: boolean;
}

export interface SharedExpensePayload {
  description: string;
  amount: number;
  currency: string;
  date: string;
  paidBy: string;
  payingContactId?: string;
  groupId?: string;
  participantIds: string[];
  payerMode: "self" | "other" | "equal";
  yourShare?: number;
  selectionMode: "contacts" | "group";
  splitType: SplitType;
  customAmounts?: Record<string, number>;
}
