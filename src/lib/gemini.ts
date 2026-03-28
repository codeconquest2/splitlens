import Groq from "groq-sdk";
import type { ParsedTransaction } from "@/lib/types";

const parserInstructions =
  "You are a bank statement parser. Extract all transactions from the following bank statement text. Return ONLY a valid JSON array, no markdown, no explanation. Each item must have: date (YYYY-MM-DD), merchant (string), amount (number, positive = debit/expense), currency (string). If currency is not found in the text use the provided default currency.";

function cleanJson(raw: string): string {
  return raw.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function parseStatement(text: string, currency: string): Promise<ParsedTransaction[]> {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: parserInstructions },
        { role: "user", content: `Default currency: ${currency}\n\nStatement text:\n${text}` }
      ],
    });
    const responseText = completion.choices[0]?.message?.content?.trim() ?? "";
    console.log("Groq raw response:", responseText.substring(0, 500));
    const parsed = JSON.parse(cleanJson(responseText));
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedTransaction[];
  } catch (error) {
    console.error("Failed to parse statement JSON", error);
    return [];
  }
}

export async function parseStatementImage(
  base64: string,
  mimeType: string,
  currency: string
): Promise<ParsedTransaction[]> {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: parserInstructions },
        {
          role: "user",
          content: [
            { type: "text", text: `Default currency: ${currency}` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
          ]
        }
      ],
    });
    const responseText = completion.choices[0]?.message?.content?.trim() ?? "";
    console.log("Groq image raw response:", responseText.substring(0, 500));
    const parsed = JSON.parse(cleanJson(responseText));
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedTransaction[];
  } catch (error) {
    console.error("Failed to parse statement image", error);
    return [];
  }
}
