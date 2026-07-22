import type { ProviderAvailability } from "@/lib/pipeline/types";
import { categorizeBatchWithRegex } from "@/lib/pipeline/categorize/regex";

export async function checkRandomForestAvailability(url: string): Promise<ProviderAvailability> {
  if (!url.trim()) {
    return { available: false, message: "Set random forest sidecar URL in Settings." };
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) {
      return { available: false, message: "Random forest sidecar is not healthy." };
    }

    const payload = (await response.json()) as { status?: string; model?: string };
    return {
      available: true,
      message: payload.model ? `RF model loaded: ${payload.model}` : "Random forest sidecar ready."
    };
  } catch {
    return {
      available: false,
      message: "Random forest sidecar not running. Download the bundle and start it on port 8765."
    };
  }
}

export async function categorizeBatchWithRandomForest(merchants: string[], url: string) {
  if (!merchants.length) {
    return [];
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/categorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchants }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Random forest request failed (${response.status})`);
  }

  const payload = (await response.json()) as { categories?: string[] };
  const categories = payload.categories ?? [];
  if (categories.length !== merchants.length) {
    throw new Error("Random forest returned the wrong number of categories.");
  }

  return categories;
}

export async function safeCategorizeWithRandomForest(merchants: string[], url: string) {
  try {
    return await categorizeBatchWithRandomForest(merchants, url);
  } catch (error) {
    console.warn("Random forest categorization failed, falling back to regex", error);
    return categorizeBatchWithRegex(merchants);
  }
}
