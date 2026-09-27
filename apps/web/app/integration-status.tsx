"use client";

import { useEffect, useState } from "react";

type Status = {
  environment: "development";
  paymentConfigured: boolean;
  evidenceConfigured: boolean;
};

export function IntegrationStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [denied, setDenied] = useState(false);
  const [token, setToken] = useState("");

  async function load() {
    const response = await fetch("/api/integration-status", {
      cache: "no-store",
    });
    setDenied(!response.ok);
    if (response.ok) setStatus((await response.json()) as Status);
  }

  useEffect(() => {
    void fetch("/api/integration-status", { cache: "no-store" }).then(
      async (response) => {
        setDenied(!response.ok);
        if (response.ok) setStatus((await response.json()) as Status);
      },
    );
  }, []);

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch("/api/integration-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setToken("");
    await load();
  }

  return (
    <section
      aria-labelledby="integration-title"
      className="mt-8 border-t border-line pt-6"
    >
      <h2 id="integration-title" className="text-sm font-semibold text-ink">
        Integration status
      </h2>
      {status ? (
        <div className="mt-4 grid gap-2 text-sm text-ink-secondary sm:grid-cols-3">
          <p>Environment: local development</p>
          <p>
            Payment network:{" "}
            {status.paymentConfigured ? "configured" : "not configured"}
          </p>
          <p>
            Meter evidence profile:{" "}
            {status.evidenceConfigured ? "configured" : "not configured"}
          </p>
          <p className="sm:col-span-3">
            Run the documented proof commands in your terminal to verify each
            integration.
          </p>
        </div>
      ) : denied ? (
        <form
          onSubmit={(event) => void unlock(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="text-sm text-ink-secondary">
            This view isn&apos;t available in this session
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              aria-label="Local access key"
              autoComplete="off"
              className="mt-2 block rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
            />
          </label>
          <button className="rounded-sm border border-line-strong px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ink">
            Open status
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-secondary">
          Checking integration access.
        </p>
      )}
    </section>
  );
}
