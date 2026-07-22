/** @deprecated Use @/lib/pipeline/extract/regex instead */
export { extractWithRegex as parseStatement } from "@/lib/pipeline/extract/regex";

export async function parseStatementImage(
  _base64: string,
  _mimeType: string,
  _currency: string
) {
  return [];
}
