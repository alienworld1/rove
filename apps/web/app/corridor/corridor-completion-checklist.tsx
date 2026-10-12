"use client";
import { useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { CorridorOperatingView } from "@rove/contracts";
import { readCompletion } from "./api";
import { useCompletionCommands } from "./use-completion-commands";
import { useCorridorSelection } from "./corridor-selection";
import { CompletionConfirmation } from "./completion-confirmation";
import { formatOperationalValue } from "./format-operational-value";
import { paymentAssetLabel } from "../payment-asset";
import { TempoTransactionLink } from "../tempo-transaction-link";

export function CorridorCompletionChecklist({
  view,
  connected,
  readOnly = false,
}: {
  view: CorridorOperatingView;
  connected: boolean;
  readOnly?: boolean;
}) {
  const trace = useCorridorSelection((state) => state.traceOffsetMs);
  const focusLane = useCorridorSelection((state) => state.setLane);
  const execute = useCompletionCommands();
  const [action, setAction] = useState<"complete" | "close" | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(false);
  const summaries = useQueries({
    queries: view.lanes.map((lane) => ({
      queryKey: ["completion", lane.projection.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        readCompletion(lane.projection.id, signal),
      refetchInterval: !readOnly && connected && trace === null ? 3000 : false,
    })),
  });
  const eligible = (kind: "complete" | "close") =>
    view.lanes.filter((_, index) => {
      const summary = summaries[index].data;
      return (
        !summaries[index].isError &&
        summary?.recovery.status === "ready" &&
        (kind === "close" ? summary.canClose : summary.canFinish)
      );
    });
  const available =
    !readOnly &&
    connected &&
    trace === null &&
    view.activeRun?.status === "completed" &&
    !busy;
  const closed = summaries.filter(
    (query) =>
      query.data?.completion?.status === "closed" &&
      query.data.completion.closure?.confirmedRefund !== null &&
      query.data.completion.closure?.confirmedRefund !== undefined,
  ).length;
  const totalsMatch =
    summaries.length > 0 &&
    summaries.every(
      (query) =>
        query.data?.completion?.comparison?.status === "MATCH" &&
        ["reconciled", "closing", "closed"].includes(
          query.data.completion.status,
        ),
    );
  const unit = paymentAssetLabel(
    view.corridor.tempoNetwork,
    view.corridor.settlementAssetId,
  );
  const submit = async (kind: "complete" | "close") => {
    if (inFlight.current) return;
    if (!available) {
      setNotice(
        "Current state changed while you were reviewing. Refresh the Corridor and review the action again.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setNotice(null);
    try {
      const lanes = eligible(kind);
      const results = await Promise.allSettled(
        lanes.map((lane) => execute(lane.projection.id, kind)),
      );
      const failures: Record<string, string> = {};
      results.forEach((result, index) => {
        if (result.status === "rejected")
          failures[lanes[index].projection.id] =
            result.reason instanceof Error
              ? result.reason.message
              : "This Lane needs attention. Check its saved state.";
      });
      setErrors(failures);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Corridor completion checklist"
      className="mt-6 border-y border-line-strong py-5 text-sm text-ink"
    >
      <h2 className="font-semibold">
        Session completion · {closed}/{view.lanes.length} channels closed
      </h2>
      <p role="status" className="mt-2 text-ink-secondary">
        {closed === view.lanes.length && closed > 0
          ? "All sessions reconciled, channels closed, and unused reserves accounted for."
          : totalsMatch
            ? "Session totals match and final payments are confirmed. Close eligible channels, then wait for confirmed reserve returns."
            : view.activeRun?.status === "completed"
              ? "Scenario events complete. Review each session’s final totals, payment, and reserve return below."
              : "Wait for the scenario events to finish before completing the sessions."}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {view.lanes.map((lane, index) => {
          const query = summaries[index];
          const completion = query.data?.completion;
          return (
            <li key={lane.projection.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="min-h-11 font-semibold underline focus-visible:outline-2 focus-visible:outline-info"
                  onClick={() => focusLane(lane.projection.id)}
                >
                  {lane.label} · Review
                </button>
                <span className="text-xs text-ink-secondary">
                  {query.isPending
                    ? "Loading completion…"
                    : query.isError
                      ? "Completion unavailable · check again"
                      : `Final reading: ${completion?.finalEvidenceHash ? "accepted" : "waiting"} · Accounting: ${completion?.comparison?.status === "MATCH" ? "totals match" : completion?.comparison?.status === "MISMATCH" ? "totals differ" : "waiting"} · Settlement: ${["reconciled", "closing", "closed"].includes(completion?.status ?? "") ? "confirmed" : "waiting"} · Channel: ${completion?.status === "closed" ? "closed" : completion?.status === "closing" ? "close pending" : "open"} · Reserve: ${completion?.closure?.confirmedRefund !== null && completion?.closure?.confirmedRefund !== undefined ? "returned" : completion?.closure ? "return pending" : "awaiting closure"}`}
                </span>
              </div>
              {completion?.closure ? (
                <p className="text-xs text-ink-secondary">
                  {completion.closure.confirmedRefund !== null
                    ? `Reserve returned: ${formatOperationalValue(completion.closure.confirmedRefund, view.corridor.tariff.assetDecimals)} ${unit}`
                    : `Expected reserve return: ${formatOperationalValue(completion.closure.expectedRefund, view.corridor.tariff.assetDecimals)} ${unit} · awaiting confirmation`}
                </p>
              ) : null}
              {query.data?.paymentSource === "tempo-adapter" &&
              completion?.closure?.transactionHash ? (
                <TempoTransactionLink
                  network={view.corridor.tempoNetwork}
                  hash={completion.closure.transactionHash}
                  operation="channel close"
                />
              ) : null}
              {errors[lane.projection.id] ? (
                <p role="alert" className="mt-1 text-xs text-critical">
                  {errors[lane.projection.id]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!readOnly ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {(["complete", "close"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={!available || eligible(kind).length === 0}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setAction(kind);
              }}
              className="min-h-11 rounded-sm bg-ink px-4 text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
            >
              {kind === "complete"
                ? "Finish sessions"
                : "Close eligible channels"}{" "}
              ({eligible(kind).length})
            </button>
          ))}
        </div>
      ) : null}
      {trace !== null ? (
        <p className="mt-2 text-xs text-info">
          Current completion records are separate from the historical trace.
          Return to live view to continue.
        </p>
      ) : null}
      {!connected ? (
        <p className="mt-2 text-xs text-risk-deep">
          Reconnect and refresh current state before continuing.
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-2">
          Checking each Lane’s saved progress…
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="mt-2 text-xs text-risk-deep">
          {notice}
        </p>
      ) : null}
      <CompletionConfirmation
        action={action}
        count={action ? eligible(action).length : undefined}
        onCancel={() => setAction(null)}
        onRestoreFocus={() => trigger.current?.focus()}
        onConfirm={() => {
          if (action) void submit(action);
          setAction(null);
        }}
      />
    </section>
  );
}
