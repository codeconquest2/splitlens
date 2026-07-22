import type { CategorizationProviderId, ModelSettings, ProviderAvailability } from "@/lib/pipeline/types";
import {
  checkOllamaCategorizationAvailability,
  safeCategorizeWithCustomLlm,
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
import { checkCustomExtractionAvailability } from "@/lib/pipeline/extract/llm";

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
  return checkCustomExtractionAvailability(settings.custom_llm_base_url, settings.custom_llm_model);
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

  if (provider === "custom") {
    return safeCategorizeWithCustomLlm(
      merchants,
      settings.custom_llm_base_url,
      settings.custom_llm_model,
      settings.custom_llm_api_key
    );
  }

  return categorizeBatchWithRegex(merchants);
}
