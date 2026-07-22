import { checkCategorizationAvailability } from "@/lib/pipeline/categorize";
import { checkExtractionAvailability } from "@/lib/pipeline/extract";
import type {
  CategorizationProviderId,
  ExtractionProviderId,
  ModelSettings,
  ProviderAvailability
} from "@/lib/pipeline/types";

export interface BackendStatus {
  regex: ProviderAvailability;
  ollama_extraction: ProviderAvailability;
  ollama_categorization: ProviderAvailability;
  random_forest: ProviderAvailability;
}

export interface ResolvedProviders {
  extraction: ExtractionProviderId;
  categorization: CategorizationProviderId;
  backends: BackendStatus;
}

export async function probeBackends(settings: ModelSettings): Promise<BackendStatus> {
  const [regex, ollamaExtraction, ollamaCategorization, randomForest] = await Promise.all([
    checkExtractionAvailability("regex", settings),
    checkExtractionAvailability("ollama", settings),
    checkCategorizationAvailability("ollama", settings),
    checkCategorizationAvailability("random_forest", settings)
  ]);

  return {
    regex,
    ollama_extraction: ollamaExtraction,
    ollama_categorization: ollamaCategorization,
    random_forest: randomForest
  };
}

export async function resolveProviders(
  settings: ModelSettings,
  options: { isImage?: boolean } = {}
): Promise<ResolvedProviders> {
  const backends = await probeBackends(settings);
  const extraction = resolveExtractionProvider(settings, backends, options.isImage);
  const categorization = resolveCategorizationProvider(settings, backends, options.isImage);

  return { extraction, categorization, backends };
}

function resolveExtractionProvider(
  settings: ModelSettings,
  backends: BackendStatus,
  isImage?: boolean
): ExtractionProviderId {
  if (settings.pipeline_mode === "regex_only" || settings.pipeline_mode === "regex_random_forest") {
    if (isImage) {
      throw new Error("Regex-only modes do not support image statements. Use an Ollama mode for PNG/JPEG uploads.");
    }
    return "regex";
  }

  if (settings.pipeline_mode === "ollama_only" || settings.pipeline_mode === "ollama_random_forest") {
    if (!backends.ollama_extraction.available) {
      throw new Error("Ollama extraction is not available. Start Ollama and pull the configured models.");
    }
    return "ollama";
  }

  if (settings.extraction_provider !== "auto") {
    return settings.extraction_provider;
  }

  if (isImage) {
    if (backends.ollama_extraction.available) {
      return "ollama";
    }
    throw new Error(
      "Image statements need Ollama with a vision model. Run: ollama serve && ollama pull moondream"
    );
  }

  if (backends.ollama_extraction.available) {
    return "ollama";
  }

  return "regex";
}

function resolveCategorizationProvider(
  settings: ModelSettings,
  backends: BackendStatus,
  isImage?: boolean
): CategorizationProviderId {
  if (settings.pipeline_mode === "regex_only") {
    return "regex";
  }

  if (settings.pipeline_mode === "regex_random_forest") {
    return backends.random_forest.available ? "random_forest" : "regex";
  }

  if (settings.pipeline_mode === "ollama_only") {
    return backends.ollama_categorization.available ? "ollama" : "regex";
  }

  if (settings.pipeline_mode === "ollama_random_forest") {
    if (backends.random_forest.available) {
      return "random_forest";
    }
    if (backends.ollama_categorization.available) {
      return "ollama";
    }
    if (isImage) {
      return "regex";
    }
    return "regex";
  }

  if (settings.categorization_provider !== "auto") {
    return settings.categorization_provider;
  }

  if (backends.random_forest.available) {
    return "random_forest";
  }

  if (backends.ollama_categorization.available) {
    return "ollama";
  }

  return "regex";
}
