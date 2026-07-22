import { categorizeMerchants } from "@/lib/pipeline/categorize";
import { extractTransactions } from "@/lib/pipeline/extract";
import { resolveProviders } from "@/lib/pipeline/resolve-providers";
import type { ExtractionInput, ModelSettings, PipelineResult } from "@/lib/pipeline/types";
import { isImageExtractionInput } from "@/lib/pipeline/extract/llm";

export async function runStatementPipeline(
  settings: ModelSettings,
  input: ExtractionInput
): Promise<PipelineResult> {
  const { extraction, categorization } = await resolveProviders(settings, {
    isImage: isImageExtractionInput(input)
  });

  const transactions = await extractTransactions(extraction, settings, input);
  const merchants = transactions.map((transaction) => transaction.merchant);
  const categories = await categorizeMerchants(categorization, settings, merchants);

  const enriched = transactions.map((transaction, index) => ({
    ...transaction,
    category: categories[index] ?? "Other"
  }));

  return {
    transactions: enriched,
    extraction_provider: extraction,
    categorization_provider: categorization
  };
}
