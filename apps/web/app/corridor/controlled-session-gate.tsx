"use client";

import { useState, type FormEvent } from "react";

export function ControlledSessionGate({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integration-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok)
        throw new Error("That access key didn't work. Please try again.");
      setToken("");
      onConnected();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md py-16">
      <h2 className="text-xl font-semibold text-ink">
        Open your local workspace
      </h2>
      <p className="mt-3 text-sm text-ink-secondary">
        Enter the local access key configured for your Rove services to explore
        simulated charging sessions. Hosted invite codes are used on the hosted
        app.
      </p>
      <form
        onSubmit={(event) => void connect(event)}
        className="mt-6 space-y-3"
      >
        <label
          className="block text-sm font-medium text-ink"
          htmlFor="session-key"
        >
          Local access key
        </label>
        <input
          id="session-key"
          type="password"
          autoComplete="off"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-info"
        />
        {error ? (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-sm bg-ink px-5 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Open workspace"}
        </button>
      </form>
    </section>
  );
}
