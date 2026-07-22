import { NextResponse } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const links = (body.links ?? []) as Array<{ transaction_id: string; expense_id: string }>;

    if (!Array.isArray(links) || links.length === 0) {
      return NextResponse.json({ error: "No links provided" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    let linkedCount = 0;

    for (const link of links) {
      const [{ data: transaction }, { data: expense }] = await Promise.all([
        admin.from("transactions").select("id,user_id").eq("id", link.transaction_id).single(),
        admin.from("shared_expenses").select("id,created_by").eq("id", link.expense_id).single()
      ]);

      if (!transaction || !expense || expense.created_by !== user.id) {
        continue;
      }

      await Promise.all([
        admin
          .from("shared_expenses")
          .update({ transaction_id: link.transaction_id })
          .eq("id", link.expense_id),
        admin
          .from("transactions")
          .update({ is_shared: true })
          .eq("id", link.transaction_id)
      ]);

      linkedCount += 1;
    }

    return NextResponse.json({ count: linkedCount });
  } catch (error) {
    console.error("Reconcile failed", error);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
