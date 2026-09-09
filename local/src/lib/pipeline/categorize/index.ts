import type { CategorizationProviderId, ModelSettings, ProviderAvailability } from "@/lib/pipeline/types";
import {
  checkOllamaCategorizationAvailability,
  safeCategorizeWithOllama
} from "@/lib/pipeline/categorize/llm";
import {
  categorizeBatchWithRegex,
  checkRegexCategorizationAvailability
} from "@/lib/pipeline/categorize/regex";
import {
  checkRandomForestAvailability,
  safeCategorizeWithRandomForest
} from "@/lib/pipeline/categorize/random-forest";

export async function checkCategorizationAvailability(
  provider: CategorizationProviderId,
  settings: ModelSettings
): Promise<ProviderAvailability> {
  if (provider === "regex") {
    return checkRegexCategorizationAvailability();
  }
  if (provider === "ollama") {
    return checkOllamaCategorizationAvailability(settings.ollama_base_url, settings.ollama_categorization_model);
  }
  if (provider === "random_forest") {
    return checkRandomForestAvailability(settings.random_forest_url);
  }
  return checkRegexCategorizationAvailability();
}

export async function categorizeMerchants(
  provider: CategorizationProviderId,
  settings: ModelSettings,
  merchants: string[]
) {
  if (provider === "auto") {
    const { resolveProviders } = await import("@/lib/pipeline/resolve-providers");
    const resolved = await resolveProviders(settings);
    return categorizeMerchants(resolved.categorization, settings, merchants);
  }

  if (provider === "ollama") {
    return safeCategorizeWithOllama(merchants, settings.ollama_base_url, settings.ollama_categorization_model);
  }

  if (provider === "random_forest") {
    return safeCategorizeWithRandomForest(merchants, settings.random_forest_url);
  }

  return categorizeBatchWithRegex(merchants);
}
