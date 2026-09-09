import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { applyCategoryRules } from "@/lib/category-rules";
import { getModelSettings } from "@/lib/pipeline/config";
import { categorizeMerchants } from "@/lib/pipeline/categorize";
import { runStatementPipeline } from "@/lib/pipeline/orchestrator";
import { resolveProviders } from "@/lib/pipeline/resolve-providers";
import { createLocalAdminClient, createLocalServerClient } from "@/lib/local-data-server";
import { parseStructuredStatement } from "@/lib/statement-import";

function transactionKey(transaction: { date?: string | null; merchant?: string | null; amount?: number | string | null }) {
  return [
    transaction.date ?? "",
    String(transaction.merchant ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    Number(transaction.amount ?? 0).toFixed(2)
  ].join("|");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const statementId = formData.get("statement_id");
    const currency = String(formData.get("currency") ?? "USD");

    if (!(file instanceof File) || typeof statementId !== "string") {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const supabase = createLocalServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getModelSettings(user.id);
    const buffer = Buffer.from(await file.arrayBuffer());
    let pipeline:
      | Awaited<ReturnType<typeof runStatementPipeline>>
      | {
          transactions: Array<{ date: string; merchant: string; amount: number; currency: string; is_payment: boolean; category: string }>;
          extraction_provider: "structured_import";
          categorization_provider: string;
        }
      | null = null;
    let pipelineInput: Parameters<typeof runStatementPipeline>[1] | null = null;
    let rawText: string | null = null;
    let skippedRows: Array<Record<string, unknown>> = [];
    const structured = parseStructuredStatement(buffer, file.name, file.type, currency);

    if (structured) {
      rawText = structured.rawText;
      skippedRows = structured.skippedRows.map((row) => ({ ...row }));
      const { categorization } = await resolveProviders(settings, { isImage: false });
      const categories = await categorizeMerchants(categorization, settings, structured.transactions.map((row) => row.merchant));
      pipeline = {
        transactions: await applyCategoryRules(
          user.id,
          structured.transactions.map((transaction, index) => ({
            ...transaction,
            category: categories[index] ?? "Other"
          }))
        ),
        extraction_provider: "structured_import",
        categorization_provider: categorization
      };
    } else if (file.type === "application/pdf") {
      const pdf = await pdfParse(buffer);
      rawText = pdf.text;
      pipelineInput = {
        text: pdf.text,
        currency
      };
    } else if (file.type === "image/png" || file.type === "image/jpeg") {
      pipelineInput = {
        currency,
        imageBase64: buffer.toString("base64"),
        mimeType: file.type
      };
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    if (!pipeline && pipelineInput) {
      const pipelineResult = await runStatementPipeline(settings, pipelineInput);
      pipeline = {
        ...pipelineResult,
        transactions: await applyCategoryRules(user.id, pipelineResult.transactions)
      };
    }

    if (!pipeline) {
      return NextResponse.json({ error: "Unsupported statement import." }, { status: 400 });
    }

    const admin = createLocalAdminClient();
    const { data: statement, error: statementError } = await admin
      .from("statements")
      .select("id,user_id,month")
      .eq("id", statementId)
      .single();

    if (statementError || !statement) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404 });
    }

    const rows = pipeline.transactions.map((transaction) => ({
      statement_id: statementId,
      user_id: statement.user_id,
      date: transaction.date,
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency ?? currency,
      category: transaction.category,
      is_shared: false,
      is_payment: transaction.is_payment
    }));

    const monthStart = String(statement.month);
    const monthEndDate = new Date(monthStart);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const { data: existingTransactions } = await admin
      .from("transactions")
      .select("date,merchant,amount")
      .eq("user_id", statement.user_id)
      .gte("date", monthStart)
      .lt("date", monthEnd);

    const existingKeys = new Set(((existingTransactions as typeof rows) ?? []).map(transactionKey));
    const seenKeys = new Set<string>();
    const duplicateRows: Array<Record<string, unknown>> = [];
    const dedupedRows = rows.filter((row) => {
      const key = transactionKey(row);
      if (existingKeys.has(key) || seenKeys.has(key)) {
        duplicateRows.push(row);
        return false;
      }
      seenKeys.add(key);
      return true;
    });
    const duplicateCount = rows.length - dedupedRows.length;

    const { data: savedTransactions, error: insertError } = dedupedRows.length
      ? await admin.from("transactions").insert(dedupedRows).select("*")
      : { data: [], error: null };

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await admin.from("statements").update({ status: "review" }).eq("id", statementId);
    await admin.from("statement_parse_debug").insert({
      statement_id: statementId,
      extraction_provider: pipeline.extraction_provider,
      categorization_provider: pipeline.categorization_provider,
      raw_text: rawText,
      parsed_count: rows.length,
      saved_count: savedTransactions?.length ?? 0,
      duplicate_count: duplicateCount,
      duplicate_rows: duplicateRows,
      skipped_rows: skippedRows,
      warnings: [
        ...(rows.length === 0 ? ["No transactions were parsed from this statement."] : []),
        ...(duplicateCount > 0 ? [`Skipped ${duplicateCount} duplicate transaction(s).`] : []),
        ...(skippedRows.length > 0 ? [`Skipped ${skippedRows.length} unparseable row(s).`] : []),
        ...(!rawText ? ["Raw text is not stored for image uploads."] : [])
      ]
    });

    return NextResponse.json({
      transactions: savedTransactions ?? [],
      pipeline: {
        extraction_provider: pipeline.extraction_provider,
        categorization_provider: pipeline.categorization_provider
      },
      duplicate_count: duplicateCount
    });
  } catch (error) {
    console.error("Statement upload failed", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
