import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { getModelSettings } from "@/lib/pipeline/config";
import { runStatementPipeline } from "@/lib/pipeline/orchestrator";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const statementId = formData.get("statement_id");
    const currency = String(formData.get("currency") ?? "USD");

    if (!(file instanceof File) || typeof statementId !== "string") {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getModelSettings(user.id);
    const buffer = Buffer.from(await file.arrayBuffer());
    let pipelineInput: Parameters<typeof runStatementPipeline>[1];

    if (file.type === "application/pdf") {
      const pdf = await pdfParse(buffer);
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

    const pipeline = await runStatementPipeline(settings, pipelineInput);

    const admin = createAdminSupabaseClient();
    const { data: statement, error: statementError } = await admin
      .from("statements")
      .select("id,user_id")
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

    const { data: savedTransactions, error: insertError } = await admin
      .from("transactions")
      .insert(rows)
      .select("*");

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await admin.from("statements").update({ status: "review" }).eq("id", statementId);

    return NextResponse.json({
      transactions: savedTransactions ?? [],
      pipeline: {
        extraction_provider: pipeline.extraction_provider,
        categorization_provider: pipeline.categorization_provider
      }
    });
  } catch (error) {
    console.error("Statement upload failed", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
