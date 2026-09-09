import { NextResponse } from "next/server";
import { runLocalQuery, validateLocalQuery, type LocalQuery } from "@/lib/local-db";
import { requireLocalUnlock } from "@/lib/local-security";

export async function POST(request: Request) {
  try {
    await requireLocalUnlock();
    const query = (await request.json()) as LocalQuery;
    if (query.table === "security_settings") {
      return NextResponse.json(
        { data: null, error: { message: "Security settings are not exposed to the browser." } },
        { status: 403 }
      );
    }
    validateLocalQuery(query);
    const result = await runLocalQuery(query);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local database query failed";
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 400 }
    );
  }
}
