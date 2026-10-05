"use client";
import { displayLabDecimal } from "@rove/contracts";
import { DocsLink } from "../docs-link";
import { navigateLab } from "./lab-navigation";
import type { LoadedLabModel } from "./use-lab-workspace-model";
export function LabWorkspaceToolbar({
  model,
  hosted,
  remainingRuns,
}: {
  model: LoadedLabModel;
  hosted: boolean;
  remainingRuns?: number;
}) {
  const {
    navigation,
    busy,
    persist,
    savedDigest,
    pending,
    message,
    issues,
    draft,
    setEventId,
    setSection,
    setLaneKey,
    laneKey,
    quote,
    setBusy,
    launch,
    report,
  } = model;
  return (
    <>
      {" "}
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-line-strong pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-tertiary">
            Rove Lab · {hosted ? "Private workspace" : "Engineering workspace"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Instrument the Corridor.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            Build reproducible charging traces. Follow evidence failure through
            to payment protection and recovery.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {navigation.runId ? (
            <button
              onClick={() => navigateLab("corridor", { copy: null })}
              className="min-h-11 border border-line-strong px-4 text-sm"
            >
              Return to run
            </button>
          ) : null}
          <button
            disabled={busy}
            onClick={() => void persist(false)}
            className="min-h-11 border border-line-strong bg-pure px-4 text-sm font-semibold disabled:opacity-50"
          >
            Save scenario
          </button>
          <button
            disabled={busy || (hosted && remainingRuns === 0)}
            onClick={() => void persist(true)}
            className="min-h-11 bg-ink px-4 text-sm font-semibold text-pure disabled:opacity-50"
          >
            {busy ? "Checking…" : "Save and run"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs">
        <p role="status" className="text-ink-secondary">
          {savedDigest && !Object.keys(pending).length
            ? "Saved · Server validated"
            : "Unsaved draft"}
          {hosted ? ` · ${remainingRuns ?? "…"} runs remaining` : ""}
        </p>
        <DocsLink topic="scenario">Scenario guide</DocsLink>
      </div>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 border-l-2 border-info bg-info-soft px-3 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}
      {issues.length ? (
        <div
          role="alert"
          className="mb-4 border-l-2 border-critical bg-pure p-4 text-sm text-critical"
        >
          <p className="font-semibold">Review these settings</p>
          <ul className="mt-2 space-y-2">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <button
                  className="text-left underline"
                  onClick={() => {
                    const match = /^events\.(\d+)/.exec(issue.path);
                    const target =
                      issue.eventId ??
                      (match ? draft.events[Number(match[1])]?.id : null);
                    if (target) {
                      setEventId(target);
                      const event = draft.events.find(
                        (event) => event.id === target,
                      );
                      if (event) setLaneKey(event.laneKey);
                      setSection("lane");
                    } else if (issue.path.startsWith("corridor")) {
                      setSection("corridor");
                      setEventId(null);
                    } else {
                      const laneIndex = /^lanes\.(\d+)/.exec(issue.path);
                      if (laneIndex)
                        setLaneKey(
                          draft.lanes[Number(laneIndex[1])]?.key ?? laneKey,
                        );
                      setSection("lane");
                      setEventId(null);
                    }
                    const fieldPath = issue.path
                      .replace(
                        /^events\.(\d+)/,
                        (_, index) =>
                          `events.${draft.events[Number(index)]?.id}`,
                      )
                      .replace(
                        /^lanes\.(\d+)/,
                        (_, index) =>
                          `lanes.${draft.lanes[Number(index)]?.key}`,
                      );
                    requestAnimationFrame(() =>
                      document.getElementById(`field-${fieldPath}`)?.focus(),
                    );
                  }}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {quote && savedDigest && !Object.keys(pending).length ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border border-protected bg-protected-faint p-4">
          <div>
            <p className="text-sm font-semibold">Ready for Tempo testnet</p>
            <p className="mt-1 text-sm">
              Reserve up to{" "}
              {displayLabDecimal(quote.funding, quote.assetDecimals)} asset
              units · Fee allowance {quote.fees} wei · {quote.maxTransactions}{" "}
              transactions maximum
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              Uses one of {quote.remainingRuns} remaining runs. Admission
              rechecks available funding.
            </p>
          </div>
          <button
            disabled={busy || quote.remainingRuns === 0}
            className="min-h-11 bg-protected px-4 text-sm font-semibold text-pure disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              try {
                await launch(draft, savedDigest);
              } catch (error) {
                report(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            Start quoted run
          </button>
        </div>
      ) : null}
    </>
  );
}
