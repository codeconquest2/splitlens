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
  custom_llm_base_url: "",
  custom_llm_model: "",
  custom_llm_api_key: "",
  random_forest_url: "http://localhost:8765",
  installed_bundles: ["core", "ollama", "random-forest"]
};

export async function getModelSettings(userId: string): Promise<ModelSettings> {
  const admin = createLocalDatabaseClient();
  const { data } = await admin
    .from("model_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    const merged = {
      ...DEFAULT_MODEL_SETTINGS,
      ...data,
      id: data.id,
      user_id: data.user_id,
      updated_at: data.updated_at
    } as ModelSettings;
    return merged;
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

  return (created as ModelSettings) ?? {
    id: "default",
    user_id: userId,
    ...DEFAULT_MODEL_SETTINGS,
    updated_at: now
  };
}

export async function saveModelSettings(
  userId: string,
  patch: Partial<Omit<ModelSettings, "id" | "user_id">>
): Promise<ModelSettings> {
  const current = await getModelSettings(userId);
  const admin = createLocalDatabaseClient();
  const next = {
    ...current,
    ...patch,
    user_id: userId,
    updated_at: new Date().toISOString()
  };

  const { data } = await admin
    .from("model_settings")
    .upsert(next)
    .select("*")
    .single();

  return (data as ModelSettings) ?? next;
}
