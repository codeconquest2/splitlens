import { NextResponse } from "next/server";
import {
  getLocalSecurityStatus,
  lockLocalApp,
  setupLocalPassword,
  unlockLocalApp
} from "@/lib/local-security";

export async function GET() {
  return NextResponse.json(await getLocalSecurityStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "setup") {
      await setupLocalPassword(body.password);
      return NextResponse.json(await getLocalSecurityStatus());
    }
    if (body.action === "unlock") {
      await unlockLocalApp(body.password);
      return NextResponse.json(await getLocalSecurityStatus());
    }
    if (body.action === "lock") {
      await lockLocalApp();
      return NextResponse.json(await getLocalSecurityStatus());
    }
    return NextResponse.json({ error: "Unsupported security action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Security request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
