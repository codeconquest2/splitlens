import type { ExtractionInput, ExtractionProviderId, ModelSettings, ProviderAvailability } from "@/lib/pipeline/types";
import type { ParsedTransaction } from "@/lib/types";
import {
  checkCustomExtractionAvailability,
  checkOllamaExtractionAvailability,
  extractWithCustomLlm,
  extractWithCustomLlmVision,
  extractWithOllama,
  extractWithOllamaVision,
  isImageExtractionInput
} from "@/lib/pipeline/extract/llm";
import { checkRegexExtractionAvailability, extractWithRegex } from "@/lib/pipeline/extract/regex";

export async function checkExtractionAvailability(
  provider: ExtractionProviderId,
  settings: ModelSettings
): Promise<ProviderAvailability> {
  if (provider === "regex") {
    return checkRegexExtractionAvailability();
  }
  if (provider === "ollama") {
    return checkOllamaExtractionAvailability(
      settings.ollama_base_url,
      settings.ollama_extraction_model,
      settings.ollama_vision_model
    );
  }
  return checkCustomExtractionAvailability(settings.custom_llm_base_url, settings.custom_llm_model);
}

export async function extractTransactions(
  provider: ExtractionProviderId,
  settings: ModelSettings,
  input: ExtractionInput
): Promise<ParsedTransaction[]> {
  if (provider === "auto") {
    const { resolveProviders } = await import("@/lib/pipeline/resolve-providers");
    const resolved = await resolveProviders(settings, { isImage: isImageExtractionInput(input) });
    return extractTransactions(resolved.extraction, settings, input);
  }

  const imageInput = isImageExtractionInput(input);

  if (imageInput && provider === "regex") {
    throw new Error("Image statements require Ollama or a custom vision LLM. Change extraction in Settings → Models.");
  }

  if (provider === "ollama") {
    try {
      if (imageInput) {
        return await extractWithOllamaVision(input, settings.ollama_base_url, settings.ollama_vision_model);
      }
      return await extractWithOllama(input, settings.ollama_base_url, settings.ollama_extraction_model);
    } catch (error) {
      if (imageInput) {
        throw error;
      }
      console.warn("Ollama extraction failed, falling back to regex", error);
      return extractWithRegex(input);
    }
  }

  if (provider === "custom") {
    try {
      if (imageInput) {
        return await extractWithCustomLlmVision(
          input,
          settings.custom_llm_base_url,
          settings.custom_llm_model,
          settings.custom_llm_api_key
        );
      }
      return await extractWithCustomLlm(
        input,
        settings.custom_llm_base_url,
        settings.custom_llm_model,
        settings.custom_llm_api_key
      );
    } catch (error) {
      if (imageInput) {
        throw error;
      }
      console.warn("Custom LLM extraction failed, falling back to regex", error);
      return extractWithRegex(input);
    }
  }

  return extractWithRegex(input);
}
