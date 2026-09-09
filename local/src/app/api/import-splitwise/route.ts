import { NextResponse } from "next/server";
import { createLocalAdminClient, createLocalServerClient } from "@/lib/local-data-server";
import { getMemberShare, type SplitwiseImportRow } from "@/lib/splitwise";

async function getOrCreateContact(
  admin: ReturnType<typeof createLocalAdminClient>,
  userId: string,
  name: string,
  cache: Map<string, string>
) {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const { data: existing } = await admin
    .from("contacts")
    .select("id")
    .eq("created_by", userId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.id) {
    cache.set(name, existing.id);
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("contacts")
    .insert({
      created_by: userId,
      name,
      email: null,
      note: "Imported from Splitwise"
    })
    .select("id")
    .single();

  if (error || !created) {
    throw error ?? new Error(`Failed to create contact for ${name}`);
  }

  cache.set(name, created.id);
  return created.id;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = (body.rows ?? []) as SplitwiseImportRow[];
    const yourName = String(body.yourName ?? "").trim();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const supabase = createLocalServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createLocalAdminClient();
    const contactCache = new Map<string, string>();
    let importedCount = 0;

    for (const row of rows) {
      if (row.is_payment) {
        continue;
      }

      const share = getMemberShare(row, yourName);
      if (share.your_share < 0.01) {
        continue;
      }

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

      const splits: Array<{
        expense_id: string;
        user_id: string | null;
        contact_id: string | null;
        amount_owed: number;
        paid: boolean;
        paid_at: string | null;
      }> = [];

      if (row.person_balances.length > 0 && yourName) {
        const youArePayer = row.payer_name === yourName && share.your_net > 0;

        if (youArePayer) {
          for (const person of row.person_balances) {
            if (person.name === yourName || person.net >= -0.01) {
              continue;
            }

            const contactId = await getOrCreateContact(admin, user.id, person.name, contactCache);
            splits.push({
              expense_id: expense.id,
              user_id: null,
              contact_id: contactId,
              amount_owed: Math.abs(person.net),
              paid: false,
              paid_at: null
            });
          }
        } else if (share.your_net < 0) {
          splits.push({
            expense_id: expense.id,
            user_id: user.id,
            contact_id: null,
            amount_owed: share.your_share,
            paid: false,
            paid_at: null
          });
        }
      } else {
        const importNote =
          share.type === "owed"
            ? "Imported from Splitwise: others owe you, counterparty unknown."
            : "Imported from Splitwise: you owe someone else, counterparty unknown.";

        splits.push({
          expense_id: expense.id,
          user_id: user.id,
          contact_id: null,
          amount_owed: share.your_share,
          paid: false,
          paid_at: null
        });

        await admin
          .from("shared_expenses")
          .update({
            description: `${row.description} (${importNote})`
          })
          .eq("id", expense.id);
      }

      if (!splits.length) {
        await admin.from("shared_expenses").delete().eq("id", expense.id);
        continue;
      }

      const { error: splitError } = await admin.from("expense_splits").insert(splits);
      if (splitError) {
        throw splitError;
      }

      if (row.person_balances.length > 0 && row.payer_name && row.payer_name !== yourName) {
        await admin
          .from("shared_expenses")
          .update({
            description: `${row.description} (Imported from Splitwise · paid by ${row.payer_name})`
          })
          .eq("id", expense.id);
      } else if (row.person_balances.length > 0) {
        await admin
          .from("shared_expenses")
          .update({
            description: `${row.description} (Imported from Splitwise)`
          })
          .eq("id", expense.id);
      }

      importedCount += 1;
    }

    return NextResponse.json({ count: importedCount });
  } catch (error) {
    console.error("Splitwise import failed", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
