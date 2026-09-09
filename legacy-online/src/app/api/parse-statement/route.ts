import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { parseStatement, parseStatementImage } from "@/lib/gemini";

function inferCategory(merchant: string): string {
  const normalizedMerchant = merchant.toLowerCase();
  const categoryRules: Record<string, string[]> = {
    Groceries: [
      "whole foods",
      "trader joe",
      "costco",
      "walmart",
      "kroger",
      "safeway",
      "aldi",
      "publix"
    ],
    Dining: [
      "chipotle",
      "starbucks",
      "mcdonald",
      "burger king",
      "subway",
      "dunkin",
      "chick-fil",
      "taco bell",
      "pizza",
      "sushi",
      "restaurant",
      "cafe",
      "grill",
      "diner",
      "kitchen",
      "eatery",
      "sweetgreen",
      "pret",
      "cheesecake",
      "uber eats",
      "seamless",
      "doordash",
      "grubhub"
    ],
    Transport: [
      "uber",
      "lyft",
      "taxi",
      "metro",
      "transit",
      "shell",
      "exxon",
      "chevron",
      "bp",
      "gas station",
      "parking"
    ],
    Shopping: [
      "amazon",
      "target",
      "walmart",
      "zara",
      "h&m",
      "gap",
      "nike",
      "apple store",
      "best buy",
      "home depot",
      "ikea",
      "barnes"
    ],
    Entertainment: [
      "netflix",
      "spotify",
      "hulu",
      "disney",
      "apple tv",
      "youtube",
      "amc",
      "cinema",
      "theatre",
      "ticketmaster"
    ],
    Health: [
      "cvs",
      "walgreens",
      "rite aid",
      "pharmacy",
      "doctor",
      "dental",
      "gym",
      "planet fitness",
      "hospital"
    ],
    Travel: [
      "delta",
      "united",
      "american airlines",
      "southwest",
      "airbnb",
      "hotel",
      "marriott",
      "hilton",
      "expedia"
    ],
    Utilities: [
      "electric",
      "water",
      "gas bill",
      "internet",
      "verizon",
      "at&t",
      "t-mobile",
      "con edison",
      "comcast"
    ]
  };

  for (const [category, keywords] of Object.entries(categoryRules)) {
    if (keywords.some((keyword) => normalizedMerchant.includes(keyword))) {
      return category;
    }
  }

  return "Other";
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

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsedTransactions: Awaited<ReturnType<typeof parseStatement>> = [];

    if (file.type === "application/pdf") {
      const pdf = await pdfParse(buffer);
      parsedTransactions = await parseStatement(pdf.text, currency);
    } else if (file.type === "image/png" || file.type === "image/jpeg") {
      parsedTransactions = await parseStatementImage(buffer.toString("base64"), file.type, currency);
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();
    const { data: statement, error: statementError } = await supabase
      .from("statements")
      .select("id,user_id")
      .eq("id", statementId)
      .single();

    if (statementError || !statement) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404 });
    }

    const rows = parsedTransactions.map((transaction) => ({
      statement_id: statementId,
      user_id: statement.user_id,
      date: transaction.date,
      merchant: transaction.merchant,
      amount: transaction.amount,
      currency: transaction.currency ?? currency,
      category: inferCategory(transaction.merchant),
      is_shared: false
    }));

    const { data: savedTransactions, error: insertError } = await supabase
      .from("transactions")
      .insert(rows)
      .select("*");

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await supabase.from("statements").update({ status: "review" }).eq("id", statementId);

    return NextResponse.json(savedTransactions ?? []);
  } catch (error) {
    console.error("Statement upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
