"use client";

import { useEffect, useState } from "react";
import type { Readiness } from "@rove/contracts";

function messageFor(reasonCode?: string) {
  if (reasonCode === "ENGINE_UNAVAILABLE")
    return "The engine is unavailable. Start it, then check again.";
  if (reasonCode === "CONFIG_INVALID")
    return "Service settings need attention. Check the server configuration.";
  return "A service needs attention. Check its settings, then try again.";
}

export function ReadinessPanel() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [checking, setChecking] = useState(true);

  async function fetchReadiness(): Promise<Readiness> {
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("HEALTH_REQUEST_FAILED");
      return (await response.json()) as Readiness;
    } catch {
      return {
        status: "blocked",
        engineReachable: false,
        reasonCode: "ENGINE_UNAVAILABLE",
        checkedAt: new Date().toISOString(),
        dependencies: { web: "unavailable", engine: "unknown" },
      };
    }
  }

  async function check() {
    setChecking(true);
    setReadiness(await fetchReadiness());
    setChecking(false);
  }

  useEffect(() => {
    void fetchReadiness().then((result) => {
      setReadiness(result);
      setChecking(false);
    });
  }, []);

  const ready = !checking && readiness?.status === "ready";
  return (
    <section
      aria-labelledby="readiness-title"
      className="min-h-64 rounded-sm border border-line bg-pure p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-secondary">
          Service readiness
        </p>
        <span className="font-mono text-xs tabular-nums text-ink-tertiary">
          LIVE CHECK
        </span>
      </div>
      <div role="status" aria-live="polite" className="pt-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`inline-block size-3 rounded-full ${checking ? "bg-info" : ready ? "bg-protected" : "bg-risk"}`}
          />
          <h2
            id="readiness-title"
            className="text-2xl font-semibold tracking-tight text-ink"
          >
            {checking
              ? "Checking services"
              : ready
                ? "Services ready"
                : "Setup needed"}
          </h2>
        </div>
        <p className="mt-4 max-w-xl text-sm leading-6 text-ink-secondary">
          {checking
            ? "Checking the web and engine services."
            : ready
              ? "The web and engine services are responding. Charging protection is not active yet."
              : messageFor(readiness?.reasonCode)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void check()}
        disabled={checking}
        className="mt-6 rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm font-medium text-ink hover:bg-selection focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-50"
      >
        Check again
      </button>
    </section>
  );
}
