import { createLocalDatabaseClient } from "@/lib/local-db";
import type { ModelSettings } from "@/lib/pipeline/types";

export const DEFAULT_MODEL_SETTINGS: Omit<ModelSettings, "id" | "user_id" | "updated_at"> = {
  pipeline_mode: "auto",
  extraction_provider: "auto",
  categorization_provider: "auto",
  ollama_base_url: "http://localhost:11434",
  ollama_extraction_model: "qwen2.5:0.5b",
  ollama_vision_model: "moondream",
  ollama_categorization_model: "qwen2.5:0.5b",
  random_forest_url: "http://localhost:8765",
  installed_bundles: ["core", "ollama", "random-forest"]
};

function normalizeModelSettings(row: any, userId: string, now = new Date().toISOString()): ModelSettings {
  return {
    id: row?.id ?? "default",
    user_id: row?.user_id ?? userId,
    pipeline_mode: row?.pipeline_mode ?? DEFAULT_MODEL_SETTINGS.pipeline_mode,
    extraction_provider: row?.extraction_provider ?? DEFAULT_MODEL_SETTINGS.extraction_provider,
    categorization_provider: row?.categorization_provider ?? DEFAULT_MODEL_SETTINGS.categorization_provider,
    ollama_base_url: row?.ollama_base_url ?? DEFAULT_MODEL_SETTINGS.ollama_base_url,
    ollama_extraction_model: row?.ollama_extraction_model ?? DEFAULT_MODEL_SETTINGS.ollama_extraction_model,
    ollama_vision_model: row?.ollama_vision_model ?? DEFAULT_MODEL_SETTINGS.ollama_vision_model,
    ollama_categorization_model:
      row?.ollama_categorization_model ?? DEFAULT_MODEL_SETTINGS.ollama_categorization_model,
    random_forest_url: row?.random_forest_url ?? DEFAULT_MODEL_SETTINGS.random_forest_url,
    installed_bundles: Array.isArray(row?.installed_bundles)
      ? row.installed_bundles.filter((bundle: string) => bundle !== "custom-llm")
      : DEFAULT_MODEL_SETTINGS.installed_bundles,
    updated_at: row?.updated_at ?? now
  };
}

export async function getModelSettings(userId: string): Promise<ModelSettings> {
  const admin = createLocalDatabaseClient();
  const { data } = await admin
    .from("model_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    return normalizeModelSettings(data, userId);
  }

  const now = new Date().toISOString();
  const { data: created } = await admin
    .from("model_settings")
    .insert({
      user_id: userId,
      ...DEFAULT_MODEL_SETTINGS,
      updated_at: now
    })
    .select("*")
    .single();

  return normalizeModelSettings(created, userId, now);
}

export async function saveModelSettings(
  userId: string,
  patch: Partial<Omit<ModelSettings, "id" | "user_id">>
): Promise<ModelSettings> {
  const current = await getModelSettings(userId);
  const admin = createLocalDatabaseClient();
  const next = normalizeModelSettings({
    ...current,
    ...patch,
    user_id: userId,
    updated_at: new Date().toISOString()
  }, userId);

  const { data } = await admin
    .from("model_settings")
    .upsert(next)
    .select("*")
    .single();

  return normalizeModelSettings(data ?? next, userId);
}
