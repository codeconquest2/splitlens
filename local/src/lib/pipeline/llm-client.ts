interface LlmGenerateOptions {
  provider: "ollama" | "custom";
  baseUrl: string;
  model: string;
  apiKey?: string;
  prompt: string;
}

interface LlmVisionOptions extends LlmGenerateOptions {
  imageBase64: string;
  mimeType: string;
}

function extractJsonBlock(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  return trimmed;
}

export async function generateJsonFromLlm<T>(options: LlmGenerateOptions): Promise<T> {
  if (options.provider === "ollama") {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        stream: false,
        format: "json"
      }),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status})`);
    }

    const payload = (await response.json()) as { response?: string };
    return JSON.parse(extractJsonBlock(payload.response ?? "{}")) as T;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: options.prompt }],
      response_format: { type: "json_object" },
      temperature: 0
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw new Error(`Custom LLM request failed (${response.status})`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(extractJsonBlock(content)) as T;
}

export async function generateJsonFromOllamaVision<T>(options: LlmVisionOptions): Promise<T> {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: "user",
          content: options.prompt,
          images: [options.imageBase64]
        }
      ],
      stream: false,
      format: "json"
    }),
    signal: AbortSignal.timeout(180000)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama vision request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  return JSON.parse(extractJsonBlock(payload.message?.content ?? "{}")) as T;
}

export async function generateJsonFromCustomVision<T>(options: LlmVisionOptions): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: options.prompt },
            {
              type: "image_url",
              image_url: { url: `data:${options.mimeType};base64,${options.imageBase64}` }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    }),
    signal: AbortSignal.timeout(180000)
  });

  if (!response.ok) {
    throw new Error(`Custom vision LLM request failed (${response.status})`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(extractJsonBlock(content)) as T;
}

export async function pullOllamaModel(baseUrl: string, model: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: false }),
    signal: AbortSignal.timeout(600000)
  });

  if (!response.ok) {
    throw new Error(`Failed to pull ${model}`);
  }

  return response.json();
}

export async function listOllamaModels(baseUrl: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { models?: Array<{ name: string }> };
  return (payload.models ?? []).map((entry) => entry.name);
}
