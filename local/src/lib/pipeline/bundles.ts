import type { ModelBundle } from "@/lib/pipeline/types";

export const MODEL_BUNDLES: ModelBundle[] = [
  {
    id: "core",
    name: "Core (regex)",
    description: "Built-in regex statement parser and keyword categorizer. No download required.",
    kind: "builtin",
    enables: {
      extraction: ["regex"],
      categorization: ["regex"]
    }
  },
  {
    id: "ollama",
    name: "Ollama local LLM",
    description: "Use a local Ollama model for extraction and/or categorization. Default: qwen2.5:0.5b.",
    kind: "downloadable",
    enables: {
      extraction: ["ollama"],
      categorization: ["ollama"]
    },
    installHint: "Install Ollama, then pull text + vision models: ollama pull qwen2.5:0.5b && ollama pull moondream"
  },
  {
    id: "random-forest",
    name: "Random forest categorizer",
    description: "Lightweight merchant classifier sidecar. Regex extraction still handles statements.",
    kind: "downloadable",
    enables: {
      categorization: ["random_forest"]
    },
    installHint: "Start the RF sidecar at http://localhost:8765 or set your own URL in Settings."
  }
];

export function bundleEnablesProvider(bundleId: string, provider: string) {
  const bundle = MODEL_BUNDLES.find((entry) => entry.id === bundleId);
  if (!bundle) {
    return false;
  }

  return (
    bundle.enables.extraction?.includes(provider as never) ||
    bundle.enables.categorization?.includes(provider as never) ||
    false
  );
}
