import { buildCategorizationPrompt } from "@/lib/pipeline/prompts";
import type { ProviderAvailability } from "@/lib/pipeline/types";
import { generateJsonFromLlm } from "@/lib/pipeline/llm-client";
import { categorizeBatchWithRegex, normalizeCategory } from "@/lib/pipeline/categorize/regex";
import { checkOllamaExtractionAvailability } from "@/lib/pipeline/extract/llm";

export async function checkOllamaCategorizationAvailability(
  baseUrl: string,
  model: string
): Promise<ProviderAvailability> {
  return checkOllamaExtractionAvailability(baseUrl, model);
}

export async function categorizeBatchWithOllama(merchants: string[], baseUrl: string, model: string) {
  if (!merchants.length) {
    return [];
  }

  const prompt = buildCategorizationPrompt(merchants);
  const payload = await generateJsonFromLlm<{ categories?: string[] }>({
    provider: "ollama",
    baseUrl,
    model,
    prompt
  });

  const categories = payload.categories ?? [];
  if (categories.length !== merchants.length) {
    throw new Error("Ollama returned the wrong number of categories.");
  }

  return categories.map(normalizeCategory);
}

export async function categorizeBatchWithCustomLlm(
  merchants: string[],
  baseUrl: string,
  model: string,
  apiKey: string
) {
  if (!merchants.length) {
    return [];
  }

  const prompt = buildCategorizationPrompt(merchants);
  const payload = await generateJsonFromLlm<{ categories?: string[] }>({
    provider: "custom",
    baseUrl,
    model,
    apiKey,
    prompt
  });

  const categories = payload.categories ?? [];
  if (categories.length !== merchants.length) {
    throw new Error("Custom LLM returned the wrong number of categories.");
  }

  return categories.map(normalizeCategory);
}

export async function safeCategorizeWithOllama(merchants: string[], baseUrl: string, model: string) {
  try {
    return await categorizeBatchWithOllama(merchants, baseUrl, model);
  } catch (error) {
    console.warn("Ollama categorization failed, falling back to regex", error);
    return categorizeBatchWithRegex(merchants);
  }
}

export async function safeCategorizeWithCustomLlm(
  merchants: string[],
  baseUrl: string,
  model: string,
  apiKey: string
) {
  try {
    return await categorizeBatchWithCustomLlm(merchants, baseUrl, model, apiKey);
  } catch (error) {
    console.warn("Custom LLM categorization failed, falling back to regex", error);
    return categorizeBatchWithRegex(merchants);
  }
}
