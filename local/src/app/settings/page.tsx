"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/local-data-client";
import { CATEGORIES } from "@/lib/pipeline/prompts";
import type { ModelSettings, PipelineMode } from "@/lib/pipeline/types";

interface StatusResponse {
  settings: ModelSettings;
  resolved: { mode: string; extraction: string; categorization: string };
  ollama_models: string[];
}

export default function SettingsPage() {
  const db = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("auto");
  const [isPulling, setIsPulling] = useState(false);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [isSavingModels, setIsSavingModels] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExportingEncrypted, setIsExportingEncrypted] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [categoryRules, setCategoryRules] = useState<Array<Record<string, any>>>([]);
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("Other");
  const [ruleIsPayment, setRuleIsPayment] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);
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

  async function loadCategoryRules() {
    const {
      data: { user }
    } = await db.auth.getUser();
    const { data } = await db
      .from("category_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCategoryRules((data as Array<Record<string, any>>) ?? []);
  }

  useEffect(() => {
    loadStatus();
    loadCategoryRules();
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

  async function createBackup() {
    setIsBackingUp(true);
    setMessage(null);

    const response = await fetch("/api/local-backup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: backupPassword || undefined })
    });
    setIsBackingUp(false);

    if (response.ok) {
      const payload = (await response.json()) as { backupPath: string };
      setMessage(`Backup created: ${payload.backupPath}`);
    } else {
      setMessage("Backup failed.");
    }
  }

  async function exportEncryptedBackup() {
    if (backupPassword.length < 8) {
      setMessage("Use a backup password with at least 8 characters.");
      return;
    }

    setIsExportingEncrypted(true);
    setMessage(null);

    try {
      const response = await fetch("/api/local-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_encrypted", passphrase: backupPassword })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Encrypted export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `splitlens-backup-${new Date().toISOString().slice(0, 10)}.splitlens-backup`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Encrypted backup exported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Encrypted export failed.");
    } finally {
      setIsExportingEncrypted(false);
    }
  }

  async function restoreBackup() {
    if (!restoreFile) {
      setMessage("Choose a SplitLens backup file first.");
      return;
    }

    setIsRestoring(true);
    setMessage(null);

    try {
      const parsedBackup = JSON.parse(await restoreFile.text());
      const isEncryptedBackup = parsedBackup?.format === "splitlens.encrypted-backup";
      if (isEncryptedBackup && restorePassword.length < 8) {
        throw new Error("Enter the backup password for this encrypted backup.");
      }

      const response = await fetch("/api/local-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEncryptedBackup
            ? { backup: parsedBackup, passphrase: restorePassword }
            : { database: parsedBackup }
        )
      });

      if (!response.ok) {
        throw new Error("Restore failed.");
      }

      const payload = (await response.json()) as { previousBackupPath: string };
      setMessage(`Restored backup. Previous data saved at: ${payload.previousBackupPath}`);
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setIsRestoring(false);
    }
  }

  async function addCategoryRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rulePattern.trim()) {
      setMessage("Enter a merchant pattern first.");
      return;
    }

    setIsSavingRule(true);
    setMessage(null);
    const {
      data: { user }
    } = await db.auth.getUser();
    const { error } = await db
      .from("category_rules")
      .insert({
        user_id: user.id,
        merchant_pattern: rulePattern.trim(),
        category: ruleCategory,
        is_payment: ruleIsPayment
      })
      .select("*");
    setIsSavingRule(false);

    if (error) {
      setMessage(error.message ?? "Failed to save merchant rule.");
      return;
    }

    setRulePattern("");
    setRuleCategory("Other");
    setRuleIsPayment(false);
    setMessage("Merchant rule saved.");
    await loadCategoryRules();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-black">Models</h1>
      </div>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Local privacy</h2>
        <p className="mt-1 text-sm text-gray-700">
          No data leaves this device. SplitLens stores app data locally with owner-only file permissions and only calls local services.
        </p>
      </section>

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

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Merchant rules</h2>
        <p className="mt-1 text-sm text-gray-500">
          Local rules override model categories during statement imports.
        </p>
        <form onSubmit={addCategoryRule} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
          <input
            value={rulePattern}
            onChange={(event) => setRulePattern(event.target.value)}
            placeholder="Merchant contains..."
            className="w-full"
          />
          <select
            value={ruleCategory}
            onChange={(event) => setRuleCategory(event.target.value)}
            className="w-full"
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={ruleIsPayment}
              onChange={(event) => setRuleIsPayment(event.target.checked)}
              className="h-4 w-4"
            />
            Payment
          </label>
          <button
            type="submit"
            disabled={isSavingRule}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {isSavingRule ? "Saving..." : "Add rule"}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {categoryRules.length ? (
            categoryRules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span className="text-gray-700">{rule.merchant_pattern}</span>
                <span className="text-gray-500">
                  {rule.category}
                  {rule.is_payment ? " · payment" : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No merchant rules yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">Local data</h2>
        <p className="mt-1 text-sm text-gray-500">
          Export, back up, or restore the local SplitLens database. Encrypted backups use the password you choose.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Backup password</label>
            <input
              type="password"
              value={backupPassword}
              onChange={(event) => setBackupPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Restore password</label>
            <input
              type="password"
              value={restorePassword}
              onChange={(event) => setRestorePassword(event.target.value)}
              placeholder="Only needed for encrypted backups"
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="/api/local-backup"
            download
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-black hover:border-indigo-600"
          >
            Export JSON
          </a>
          <a
            href="/api/local-backup?format=csv"
            download
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-black hover:border-indigo-600"
          >
            Export CSV
          </a>
          <button
            type="button"
            onClick={exportEncryptedBackup}
            disabled={isExportingEncrypted}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-black hover:border-indigo-600"
          >
            {isExportingEncrypted ? "Exporting..." : "Export encrypted"}
          </button>
          <button
            type="button"
            onClick={createBackup}
            disabled={isBackingUp}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-black hover:border-indigo-600"
          >
            {isBackingUp ? "Backing up..." : backupPassword ? "Create encrypted backup" : "Create JSON backup"}
          </button>
          <input
            type="file"
            accept="application/json,.json,.splitlens-backup"
            onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            onClick={restoreBackup}
            disabled={isRestoring}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {isRestoring ? "Restoring..." : "Restore backup"}
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Plain JSON/CSV exports are readable by anyone with the file. Use encrypted backups for portable private copies.
        </p>
      </section>

      {message ? <p className="text-sm text-gray-600">{message}</p> : null}
    </div>
  );
}
