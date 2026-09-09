import { NextResponse } from "next/server";
import { getModelSettings, saveModelSettings } from "@/lib/pipeline/config";
import { pullOllamaModel } from "@/lib/pipeline/llm-client";
import { createLocalServerClient } from "@/lib/local-data-server";

export async function POST(request: Request) {
  const supabase = createLocalServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const settings = await getModelSettings(user.id);
  const models = Array.isArray(body.models)
    ? (body.models as string[])
    : [String(body.model ?? settings.ollama_extraction_model)];

  const uniqueModels = [...new Set(models.filter(Boolean))];
  const pulled: string[] = [];
  const failed: Array<{ model: string; error: string }> = [];

  for (const model of uniqueModels) {
    try {
      await pullOllamaModel(settings.ollama_base_url, model);
      pulled.push(model);
    } catch (error) {
      failed.push({
        model,
        error: error instanceof Error ? error.message : "Pull failed"
      });
    }
  }

  if (pulled.length) {
    const installed = new Set(settings.installed_bundles);
    installed.add("ollama");
    await saveModelSettings(user.id, { installed_bundles: [...installed] });
  }

  if (!pulled.length) {
    return NextResponse.json(
      { error: "Failed to pull models. Is Ollama running?", failed },
      { status: 500 }
    );
  }

  return NextResponse.json({ pulled, failed });
}
