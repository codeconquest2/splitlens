import type { ParsedTransaction } from "@/lib/types";
import { looksLikePayment } from "@/lib/spending";
import { buildExtractionPrompt, buildImageExtractionPrompt } from "@/lib/pipeline/prompts";
import type { ExtractionInput, ProviderAvailability } from "@/lib/pipeline/types";
import {
  generateJsonFromLlm,
  generateJsonFromOllamaVision
} from "@/lib/pipeline/llm-client";

interface LlmTransactionRow {
  date?: string;
  merchant?: string;
  amount?: number;
  is_payment?: boolean;
}

function modelIsInstalled(names: string[], model: string) {
  return names.some((name) => name === model || name.startsWith(`${model}:`));
}

function mapLlmRowsToTransactions(rows: LlmTransactionRow[], currency: string): ParsedTransaction[] {
  return rows
    .map((row) => ({
      date: String(row.date ?? "").slice(0, 10),
      merchant: String(row.merchant ?? "").trim(),
      amount: Math.abs(Number(row.amount ?? 0)),
      currency,
      is_payment: Boolean(row.is_payment) || looksLikePayment(String(row.merchant ?? ""))
    }))
    .filter((row) => row.date && row.merchant && row.amount > 0);
}

export async function checkOllamaExtractionAvailability(
  baseUrl: string,
  model: string,
  visionModel?: string
): Promise<ProviderAvailability> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) {
      return { available: false, message: "Ollama is not reachable." };
    }

    const payload = (await response.json()) as { models?: Array<{ name: string }> };
    const names = (payload.models ?? []).map((entry) => entry.name);
    const hasTextModel = modelIsInstalled(names, model);
    const hasVisionModel = visionModel ? modelIsInstalled(names, visionModel) : true;

    if (!hasTextModel && !hasVisionModel) {
      return {
        available: false,
        message: `Pull text model (${model}) or vision model (${visionModel}).`
      };
    }

    if (!hasTextModel && visionModel) {
      return {
        available: true,
        message: `Vision model ${visionModel} ready. Text model ${model} missing for PDFs.`
      };
    }

    if (!hasVisionModel && visionModel) {
      return {
        available: true,
        message: `Text model ${model} ready. Vision model ${visionModel} missing for images.`
      };
    }

    return { available: true, message: `Ollama ready (${model}${visionModel ? ` + ${visionModel}` : ""}).` };
  } catch {
    return { available: false, message: "Ollama is not running on the configured URL." };
  }
}

export async function extractWithOllama(
  input: ExtractionInput,
  baseUrl: string,
  model: string
): Promise<ParsedTransaction[]> {
  const prompt = buildExtractionPrompt(input.text ?? "", input.currency);
  const payload = await generateJsonFromLlm<{ transactions?: LlmTransactionRow[] }>({
    provider: "ollama",
    baseUrl,
    model,
    prompt
  });

  return mapLlmRowsToTransactions(payload.transactions ?? [], input.currency);
}

export async function extractWithOllamaVision(
  input: ExtractionInput,
  baseUrl: string,
  model: string
): Promise<ParsedTransaction[]> {
  if (!input.imageBase64 || !input.mimeType) {
    throw new Error("Image data is required for vision extraction.");
  }

  const prompt = buildImageExtractionPrompt(input.currency);
  const payload = await generateJsonFromOllamaVision<{ transactions?: LlmTransactionRow[] }>({
    provider: "ollama",
    baseUrl,
    model,
    prompt,
    imageBase64: input.imageBase64,
    mimeType: input.mimeType
  });

  return mapLlmRowsToTransactions(payload.transactions ?? [], input.currency);
}

export function isImageExtractionInput(input: ExtractionInput) {
  return Boolean(input.imageBase64 && input.mimeType);
}
