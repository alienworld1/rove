"use client";

import { DocsLink } from "../docs-link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CorridorOperatingView } from "@rove/contracts";
import { readCompletion, controlCompletion } from "./api";
import { formatOperationalValue } from "./format-operational-value";
import { useCorridorSelection } from "./corridor-selection";
import { CompletionConfirmation } from "./completion-confirmation";
import { AccountingRecordDialog } from "./accounting-record-dialog";

const labels = {
  awaiting_end_evidence: "Waiting for the final signed reading",
  awaiting_cdr: "Waiting for the final accounting record",
  awaiting_authorization: "Waiting for final payment authorization",
  awaiting_settlement: "Final settlement awaiting confirmation",
  mismatch: "Session totals don't match",
  reconciled: "Session totals match",
  closing: "Channel close awaiting confirmation",
  closed: "Channel closed",
};

export function SessionCompletionPanel({
  view,
  connected,
}: {
  view: CorridorOperatingView;
  connected: boolean;
}) {
  const focusedLaneId = useCorridorSelection((state) => state.focusedLaneId);
  const trace = useCorridorSelection((state) => state.traceOffsetMs);
  const setEvent = useCorridorSelection((state) => state.setEvent);
  const lane = view.lanes.find((lane) => lane.projection.id === focusedLaneId);
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "close" | null>(null);
  const summary = useQuery({
    queryKey: ["completion", focusedLaneId, lane?.projection.version],
    queryFn: () => readCompletion(focusedLaneId!),
    enabled: Boolean(lane),
    refetchInterval: connected && trace === null ? 3000 : false,
  });
  const mutation = useMutation({
    mutationFn: (action: "complete" | "check" | "close") =>
      controlCompletion(focusedLaneId!, summary.data!.version, action),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["completion"] }),
        queryClient.invalidateQueries({ queryKey: ["corridor"] }),
        queryClient.invalidateQueries({ queryKey: ["run"] }),
      ]);
    },
    onError: () => {
      void summary.refetch();
    },
  });
  if (!lane) return null;
  const completion = summary.data?.completion;
  const recovery = summary.data?.recovery;
  const amount = (value: string | null | undefined) =>
    value === null || value === undefined
      ? "Unavailable"
      : `${formatOperationalValue(value, view.corridor.tariff.assetDecimals)} ${completion?.cdr?.currency ?? "asset units"}`;
  const disabled =
    !connected ||
    trace !== null ||
    mutation.isPending ||
    !summary.data ||
    recovery?.status !== "ready";
  const rows = [
    [
      "Trusted service value",
      completion?.finalTrustedValue,
      "Final signed reading",
    ],
    [
      "Final authorized value",
      completion?.finalAuthorizedValue,
      "Verified cumulative voucher",
    ],
    [
      "Final settled value",
      completion?.finalSettledValue,
      summary.data?.paymentSource === "local-simulation"
        ? "Local deterministic payment"
        : "Tempo observation",
    ],
    [
      "Final accounting total",
      completion?.cdr?.normalizedTotal,
      completion?.cdr?.source === "controlled_fixture"
        ? "Controlled accounting fixture"
        : "Accounting record",
    ],
  ];
  const inspect = (eventId: string) => {
    setEvent(lane.projection.id, eventId);
    const url = new URL(window.location.href);
    url.searchParams.set("lane", lane.projection.id);
    url.searchParams.set("event", eventId);
    window.history.replaceState(null, "", url);
  };
  return (
    <section
      aria-label="Session completion"
      className="mt-5 border border-line bg-pure p-4 text-sm text-ink"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold">
          Reconciliation · {lane.projection.chargerId}
        </h2>
        <p
          role="status"
          aria-live="polite"
          className={
            completion?.status === "mismatch"
              ? "text-critical"
              : "text-ink-secondary"
          }
        >
          {summary.isLoading
            ? "Loading session completion…"
            : summary.error
              ? "Session completion couldn't load. Check again."
              : recovery?.status === "pending"
                ? "Restoring session state"
                : recovery?.status === "blocked"
                  ? "Payment state is unavailable. Check again."
                  : summary.data?.failedOperations.some(
                        (operation) => operation.operation === "close",
                      )
                    ? "The channel couldn’t be closed. Check again."
                    : summary.data?.failedOperations.some(
                          (operation) => operation.operation === "settle",
                        )
                      ? "Final settlement couldn’t be confirmed. Check again."
                      : completion
                        ? labels[completion.status]
                        : "This session has not finished yet."}
        </p>
      </div>
      <div className="mt-3">
        <DocsLink topic="completion">How session totals are checked</DocsLink>
      </div>
      {completion ? (
        <>
          {trace !== null ? (
            <p className="mt-3 text-info">
              Current completion record, outside the historical trace. Actions
              are unavailable during trace inspection.
            </p>
          ) : null}
          <dl className="mt-4 divide-y divide-line">
            {rows.map(([label, value, source]) => (
              <div key={label} className="grid gap-1 py-2 sm:grid-cols-2">
                <dt>
                  {label}
                  <span className="block text-xs text-ink-secondary">
                    {source}
                  </span>
                </dt>
                <dd className="font-mono text-sm tabular-nums sm:text-right">
                  {amount(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-ink-secondary">
            Accepted energy:{" "}
            <span className="font-mono">
              {completion.finalTrustedEnergyWh ?? "Unavailable"} Wh
            </span>{" "}
            · Accounting energy:{" "}
            <span className="font-mono">
              {completion.cdr?.totalEnergyWh ?? "Unavailable"} Wh
            </span>
          </p>
          {completion.comparison?.status === "MISMATCH" ? (
            <div className="mt-3 text-critical">
              <p>
                The accounting record or payment totals differ from accepted
                meter readings.
              </p>
              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                {Object.entries(completion.comparison.deltas).map(
                  ([key, delta]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt>
                        {key === "energyWh"
                          ? "Energy"
                          : key === "accounting"
                            ? "Accounting"
                            : key === "authorization"
                              ? "Authorization"
                              : "Settlement"}{" "}
                        difference
                      </dt>
                      <dd className="font-mono">
                        {BigInt(delta) > BigInt(0) ? "+" : ""}
                        {delta} {key === "energyWh" ? "Wh" : "base units"}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          ) : null}
          {completion.closure?.confirmedRefund !== null &&
          completion.closure?.confirmedRefund !== undefined ? (
            <p className="mt-3 font-medium">
              {completion.closure.confirmedRefund === "0"
                ? "No unused reserve remained."
                : `Unused reserve returned: ${amount(completion.closure.confirmedRefund)}`}
            </p>
          ) : null}
        </>
      ) : null}
      {mutation.error ? (
        <p role="alert" className="mt-3 text-critical">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "This session couldn't be updated. Check again."}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!completion ? (
          <button
            type="button"
            disabled={
              disabled ||
              !summary.data?.canFinish ||
              view.activeRun?.status !== "completed"
            }
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setConfirm("complete");
            }}
            className="rounded-sm bg-ink px-3 py-2 text-xs text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
          >
            Finish session
          </button>
        ) : null}
        {completion?.status === "reconciled" ? (
          <button
            type="button"
            disabled={disabled || !summary.data?.canClose}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setConfirm("close");
            }}
            className="rounded-sm bg-ink px-3 py-2 text-xs text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
          >
            Close channel
          </button>
        ) : null}
        <button
          type="button"
          disabled={mutation.isPending || !connected || trace !== null}
          onClick={() =>
            summary.data ? mutation.mutate("check") : void summary.refetch()
          }
          className="rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
        >
          Check again
        </button>
        {completion?.cdr ? (
          <AccountingRecordDialog laneId={lane.projection.id} />
        ) : null}
        {summary.data?.evidenceEventId ? (
          <button
            type="button"
            onClick={() => inspect(summary.data!.evidenceEventId!)}
            className="rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info"
          >
            View evidence
          </button>
        ) : null}
        {summary.data?.paymentEventId ? (
          <button
            type="button"
            onClick={() => inspect(summary.data!.paymentEventId!)}
            className="rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info"
          >
            View payment
          </button>
        ) : null}
      </div>
      {!completion ? (
        <p className="mt-2 text-xs text-ink-secondary">
          Available after the service trace has stopped.
        </p>
      ) : completion.status !== "closed" ? (
        <p className="mt-2 text-xs text-ink-secondary">
          Channel closure is available after session totals match and payment
          state is checked.
        </p>
      ) : null}
      {!connected ? (
        <p className="mt-2 text-xs text-risk-deep">
          Reconnect and load current session state before continuing.
        </p>
      ) : null}
      <CompletionConfirmation
        onRestoreFocus={() => triggerRef.current?.focus()}
        action={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) mutation.mutate(confirm);
          setConfirm(null);
        }}
      />
    </section>
  );
}
