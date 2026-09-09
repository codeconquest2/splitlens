import type { ParsedTransaction } from "@/lib/types";

export type ExtractionProviderId = "auto" | "regex" | "ollama";
export type CategorizationProviderId = "auto" | "regex" | "ollama" | "random_forest";
export type PipelineMode =
  | "auto"
  | "regex_only"
  | "regex_random_forest"
  | "ollama_only"
  | "ollama_random_forest";

export interface ModelSettings {
  id: string;
  user_id: string;
  pipeline_mode: PipelineMode;
  extraction_provider: ExtractionProviderId;
  categorization_provider: CategorizationProviderId;
  ollama_base_url: string;
  ollama_extraction_model: string;
  ollama_vision_model: string;
  ollama_categorization_model: string;
  random_forest_url: string;
  installed_bundles: string[];
  updated_at: string;
}

export interface ProviderStatus {
  id: string;
  label: string;
  available: boolean;
  message: string;
  installed: boolean;
}

export interface ModelBundle {
  id: string;
  name: string;
  description: string;
  kind: "builtin" | "downloadable";
  enables: {
    extraction?: ExtractionProviderId[];
    categorization?: CategorizationProviderId[];
  };
  installHint?: string;
}

export interface ExtractionInput {
  text?: string;
  currency: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface CategorizationInput {
  merchants: string[];
}

export interface PipelineResult {
  transactions: Array<ParsedTransaction & { category: string }>;
  extraction_provider: ExtractionProviderId;
  categorization_provider: CategorizationProviderId;
}

export interface ProviderAvailability {
  available: boolean;
  message: string;
}
