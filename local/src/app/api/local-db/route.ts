import { NextResponse } from "next/server";
import { runLocalQuery, type LocalQuery } from "@/lib/local-db";

export async function POST(request: Request) {
  try {
    const query = (await request.json()) as LocalQuery;
    const result = await runLocalQuery(query);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Local database query failed", error);
    return NextResponse.json(
      { data: null, error: { message: "Local database query failed" } },
      { status: 500 }
    );
  }
}
