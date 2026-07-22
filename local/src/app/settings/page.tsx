"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import type { ModelSettings, PipelineMode } from "@/lib/pipeline/types";

interface StatusResponse {
  settings: ModelSettings;
  resolved: { mode: string; extraction: string; categorization: string };
  ollama_models: string[];
}

export default function SettingsPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("auto");
  const [isPulling, setIsPulling] = useState(false);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadStatus() {
    const response = await fetch("/api/models/status");
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as StatusResponse;
    setStatus(payload);
    setSettings(payload.settings);
  }

  useEffect(() => {
    loadStatus();
    return undefined;
  }, []);

  useEffect(() => {
    if (!status) return;
    if (!status.settings?.pipeline_mode) return;
    setPipelineMode(status.settings.pipeline_mode as PipelineMode);
  }, [status]);

  async function pullOllamaModels() {
    setIsPulling(true);
    setMessage(null);

    const response = await fetch("/api/models/ollama/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        models: ["qwen2.5:0.5b", "moondream"]
      })
    });

    setIsPulling(false);

    if (response.ok) {
      const payload = (await response.json()) as { pulled?: string[] };
      setMessage(`Pulled: ${payload.pulled?.join(", ") ?? "models"}`);
      await loadStatus();
    } else {
      setMessage("Pull failed. Run: ollama serve");
    }
  }

  if (!status || !settings) {
    return <p className="text-sm text-gray-500">Loading backends...</p>;
  }

  const installedModels = status.ollama_models.length
    ? status.ollama_models.join(", ")
    : "No models detected";

  async function saveMode() {
    setIsSavingMode(true);
    setMessage(null);

    const response = await fetch("/api/model-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_mode: pipelineMode })
    });

    setIsSavingMode(false);

    if (response.ok) {
      setMessage("Pipeline mode saved.");
      await loadStatus();
    } else {
      setMessage("Failed to save pipeline mode.");
    }
  }

  async function saveOllamaSettings() {
    if (!settings) {
      return;
    }

    setIsSavingModels(true);
    setMessage(null);

    const response = await fetch("/api/model-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ollama_extraction_model: settings.ollama_extraction_model,
        ollama_vision_model: settings.ollama_vision_model,
        ollama_categorization_model: settings.ollama_categorization_model
      })
    });

    setIsSavingModels(false);

    if (response.ok) {
      setMessage("Local model selection saved.");
      await loadStatus();
    } else {
      setMessage("Failed to save local model selection.");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-black">Models</h1>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Pipeline mode</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose PDF extraction + merchant categorization behavior.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={pipelineMode}
            onChange={(event) => setPipelineMode(event.target.value as PipelineMode)}
            className="w-full max-w-md rounded-lg border border-gray-200 p-2 text-sm"
          >
            <option value="auto">Auto</option>
            <option value="regex_only">Regex only</option>
            <option value="regex_random_forest">Regex + random forest</option>
            <option value="ollama_only">Ollama only</option>
            <option value="ollama_random_forest">Ollama + random forest</option>
          </select>
          <button
            type="button"
            onClick={saveMode}
            disabled={isSavingMode}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {isSavingMode ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          PNG/JPEG statements cannot be extracted with regex.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Ollama</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose which installed local models this app should use.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Text / PDF model</label>
            <select
              value={settings.ollama_extraction_model}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, ollama_extraction_model: event.target.value } : current
                )
              }
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            >
              {status.ollama_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
              {!status.ollama_models.includes(settings.ollama_extraction_model) ? (
                <option value={settings.ollama_extraction_model}>{settings.ollama_extraction_model}</option>
              ) : null}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Vision model</label>
            <select
              value={settings.ollama_vision_model}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, ollama_vision_model: event.target.value } : current
                )
              }
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            >
              {status.ollama_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
              {!status.ollama_models.includes(settings.ollama_vision_model) ? (
                <option value={settings.ollama_vision_model}>{settings.ollama_vision_model}</option>
              ) : null}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Categorization model</label>
            <select
              value={settings.ollama_categorization_model}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, ollama_categorization_model: event.target.value } : current
                )
              }
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            >
              {status.ollama_models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
              {!status.ollama_models.includes(settings.ollama_categorization_model) ? (
                <option value={settings.ollama_categorization_model}>{settings.ollama_categorization_model}</option>
              ) : null}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={pullOllamaModels}
            disabled={isPulling}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:border-indigo-600"
          >
            {isPulling ? "Pulling..." : "Pull Ollama models"}
          </button>
          <button
            type="button"
            onClick={saveOllamaSettings}
            disabled={isSavingModels}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {isSavingModels ? "Saving..." : "Save local models"}
          </button>
          <p className="text-sm text-gray-500">Installed: {installedModels}</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Random forest</h2>
        <p className="mt-1 text-sm text-gray-500">
          Started automatically with <code className="text-xs">npm run dev</code>. Manual start:{" "}
          <code className="text-xs">npm run sidecar</code>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Model: <code className="text-xs">packages/random-forest-sidecar/transaction_classifier.pkl</code>
        </p>
      </section>

      {message ? <p className="text-sm text-gray-600">{message}</p> : null}
    </div>
  );
}
