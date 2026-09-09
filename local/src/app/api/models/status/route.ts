import { NextResponse } from "next/server";
import { getModelSettings } from "@/lib/pipeline/config";
import { listOllamaModels } from "@/lib/pipeline/llm-client";
import { probeBackends, resolveProviders } from "@/lib/pipeline/resolve-providers";
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
  const backends = await probeBackends(settings);
  const resolved = await resolveProviders(settings);
  const ollamaModels = await listOllamaModels(settings.ollama_base_url).catch(() => []);

  return NextResponse.json({
    settings,
    backends,
    resolved: {
      mode: settings.pipeline_mode,
      extraction: resolved.extraction,
      categorization: resolved.categorization
    },
    ollama_models: ollamaModels,
    providers: [
      {
        id: "regex",
        label: "Regex",
        role: "extraction + categorization fallback",
        available: backends.regex.available,
        message: backends.regex.message
      },
      {
        id: "ollama",
        label: "Ollama",
        role: "extraction + categorization",
        available: backends.ollama_extraction.available || backends.ollama_categorization.available,
        message: backends.ollama_extraction.available
          ? backends.ollama_extraction.message
          : backends.ollama_categorization.message
      },
      {
        id: "random-forest",
        label: "Random forest",
        role: "categorization (preferred when running)",
        available: backends.random_forest.available,
        message: backends.random_forest.message
      }
    ]
  });
}
