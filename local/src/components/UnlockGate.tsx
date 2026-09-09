"use client";

import { useEffect, useState } from "react";

interface SecurityStatus {
  configured: boolean;
  unlocked: boolean;
}

export default function UnlockGate() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadStatus() {
    const response = await fetch("/api/local-security");
    if (response.ok) {
      setStatus((await response.json()) as SecurityStatus);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) return;
    if (!status.configured && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const response = await fetch("/api/local-security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: status.configured ? "unlock" : "setup",
        password
      })
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not unlock SplitLens.");
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setStatus((await response.json()) as SecurityStatus);
    window.location.reload();
  }

  if (!status || status.unlocked) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-950 p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-white">
          {status.configured ? "Unlock SplitLens" : "Create app password"}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {status.configured
            ? "Enter your app password to open local data for this session."
            : "Use a password you can remember. This protects app access on this device."}
        </p>
        <div className="mt-5 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            className="w-full border-zinc-700 bg-black text-white"
          />
          {!status.configured ? (
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className="w-full border-zinc-700 bg-black text-white"
            />
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-black hover:bg-white"
        >
          {isSubmitting ? "Please wait..." : status.configured ? "Unlock" : "Save password"}
        </button>
      </form>
    </div>
  );
}
