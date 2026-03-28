import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import type { SplitwiseImportRow } from "@/lib/splitwise";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = (body.rows ?? []) as SplitwiseImportRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {}
        }
      }
    );

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    let importedCount = 0;

    for (const row of rows) {
      const { data: expense, error: expenseError } = await admin
        .from("shared_expenses")
        .insert({
          created_by: user.id,
          description: row.description,
          total_amount: row.total_amount,
          currency: row.currency,
          date: row.date
        })
        .select("id")
        .single();

      if (expenseError || !expense) {
        throw expenseError ?? new Error("Failed to create shared expense");
      }

      const importNote =
        row.type === "owed"
          ? "Imported from Splitwise: others owe you, counterparty unknown."
          : "Imported from Splitwise: you owe someone else, counterparty unknown.";

      const { error: splitError } = await admin.from("expense_splits").insert({
        expense_id: expense.id,
        user_id: user.id,
        amount_owed: row.your_share,
        paid: false,
        paid_at: null
      });

      if (splitError) {
        throw splitError;
      }

      await admin
        .from("shared_expenses")
        .update({
          description: `${row.description} (${importNote})`
        })
        .eq("id", expense.id);

      importedCount += 1;
    }

    return NextResponse.json({ count: importedCount });
  } catch (error) {
    console.error("Splitwise import failed", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
