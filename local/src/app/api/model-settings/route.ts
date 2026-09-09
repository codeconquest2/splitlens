import { NextResponse } from "next/server";
import { getModelSettings, saveModelSettings } from "@/lib/pipeline/config";
import { createLocalServerClient } from "@/lib/local-data-server";

export async function GET() {
  const supabase = createLocalServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getModelSettings(user.id);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const supabase = createLocalServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const settings = await saveModelSettings(user.id, body);
  return NextResponse.json(settings);
}
