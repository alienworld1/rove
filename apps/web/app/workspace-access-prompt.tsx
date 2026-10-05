"use client";

import Link from "next/link";
import { InviteAccessForm } from "./invite-access-form";

export function WorkspaceAccessPrompt({
  scenarioBuilder = false,
  loading = false,
  error,
  retry,
}: {
  scenarioBuilder?: boolean;
  loading?: boolean;
  error?: Error | null;
  retry: () => void;
}) {
  return (
    <section className="py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        {scenarioBuilder
          ? "Build your own charging scenario"
          : "Your private workspace"}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-secondary">
        {scenarioBuilder
          ? "Change signed readings and payment conditions, then follow their effect on charging protection. An invite opens the scenario builder on Tempo testnet."
          : "Use an invite to run charging scenarios on Tempo testnet and return to your private examples."}{" "}
        {scenarioBuilder
          ? "After you enter an invite, we’ll open this scenario."
          : "After you enter an invite, we’ll return you to this workspace."}
      </p>
      <Link
        href="/#published-runs"
        className="mt-4 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2 focus-visible:outline-info"
      >
        Explore a recorded example without an invite →
      </Link>
      {loading ? (
        <p role="status" className="mt-4 text-sm text-ink-secondary">
          Checking workspace access…
        </p>
      ) : error ? (
        <div role="alert" className="mt-4 text-sm text-ink-secondary">
          <p>
            We couldn’t check your workspace access. Please try again or use an
            invite.
          </p>
          <button
            onClick={retry}
            className="min-h-11 underline focus-visible:outline-2 focus-visible:outline-info"
          >
            Check access again
          </button>
        </div>
      ) : null}
      <div className="mt-8">
        <InviteAccessForm />
      </div>
    </section>
  );
}
