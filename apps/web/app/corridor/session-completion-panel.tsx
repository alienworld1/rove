"use client";

import { DocsLink } from "../docs-link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CorridorOperatingView } from "@rove/contracts";
import { readCompletion, controlCompletion, CorridorApiError } from "./api";
import {
  retainCompletionIntent,
  type CompletionIntent,
} from "./completion-intent";
import {
  formatOperationalValue,
  formatOperationalDelta,
  formatEnergy,
} from "./format-operational-value";
import { paymentAssetLabel } from "../payment-asset";
import { TempoTransactionLink } from "../tempo-transaction-link";
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
  readOnly = false,
}: {
  view: CorridorOperatingView;
  connected: boolean;
  readOnly?: boolean;
}) {
  const focusedLaneId = useCorridorSelection((state) => state.focusedLaneId);
  const trace = useCorridorSelection((state) => state.traceOffsetMs);
  const setEvent = useCorridorSelection((state) => state.setEvent);
  const lane = view.lanes.find((lane) => lane.projection.id === focusedLaneId);
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const confirmationLane = useRef<string | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "close" | null>(null);
  const intents = useRef(new Map<string, CompletionIntent>());
  const summary = useQuery({
    queryKey: ["completion", focusedLaneId, lane?.projection.version],
    queryFn: ({ signal }) => readCompletion(focusedLaneId!, signal),
    enabled: Boolean(lane),
    refetchInterval: !readOnly && connected && trace === null ? 3000 : false,
  });
  const mutation = useMutation({
    mutationFn: (action: "complete" | "check" | "close") => {
      const key = `${focusedLaneId}:${action}`;
      const intent = retainCompletionIntent(
        intents.current.get(key),
        focusedLaneId!,
        summary.data!.version,
      );
      if (action !== "check") intents.current.set(key, intent);
      return controlCompletion(
        intent.laneId,
        intent.expectedVersion,
        action,
        intent,
      );
    },
    onSuccess: async (result, action) => {
      intents.current.delete(`${result.laneId}:${action}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["completion"] }),
        queryClient.invalidateQueries({ queryKey: ["corridor"] }),
        queryClient.invalidateQueries({ queryKey: ["run"] }),
      ]);
    },
    onError: (error, action) => {
      if (
        error instanceof CorridorApiError &&
        [400, 403, 404, 409, 422].includes(error.status)
      )
        intents.current.delete(`${focusedLaneId}:${action}`);
      void summary.refetch();
    },
  });
  if (!lane) return null;
  const completion = summary.data?.completion;
  const assetUnit = paymentAssetLabel(
    view.corridor.tempoNetwork,
    view.corridor.settlementAssetId,
  );
  const recovery = summary.data?.recovery;
  const amount = (value: string | null | undefined) =>
    value === null || value === undefined
      ? "Unavailable"
      : `${formatOperationalValue(value, view.corridor.tariff.assetDecimals)} ${assetUnit}`;
  const disabled =
    readOnly ||
    !connected ||
    trace !== null ||
    mutation.isPending ||
    !summary.data ||
    summary.isError ||
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
              {readOnly
                ? "Final reconciliation record, separate from the selected historical snapshot."
                : "Current completion record, outside the historical trace. Actions are unavailable during trace inspection."}
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
              {completion.finalTrustedEnergyWh === null
                ? "Unavailable"
                : formatEnergy(completion.finalTrustedEnergyWh)}
            </span>{" "}
            · Accounting energy:{" "}
            <span className="font-mono">
              {completion.cdr
                ? formatEnergy(completion.cdr.totalEnergyWh)
                : "Unavailable"}
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
                        {formatOperationalDelta(
                          delta,
                          key === "energyWh"
                            ? 0
                            : view.corridor.tariff.assetDecimals,
                        )}{" "}
                        {key === "energyWh" ? "Wh" : assetUnit}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          ) : null}
          {completion.closure?.confirmedRefund !== null &&
          completion.closure?.confirmedRefund !== undefined &&
          summary.data?.paymentSource === "tempo-adapter" ? (
            <TempoTransactionLink
              network={view.corridor.tempoNetwork}
              hash={completion.closure.transactionHash}
              operation="reserve return"
            />
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
        {!readOnly && !completion ? (
          <button
            type="button"
            disabled={
              disabled ||
              !summary.data?.canFinish ||
              view.activeRun?.status !== "completed"
            }
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              confirmationLane.current = lane.projection.id;
              setConfirm("complete");
            }}
            className="min-h-11 rounded-sm bg-ink px-3 py-2 text-xs text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
          >
            Finish session
          </button>
        ) : null}
        {!readOnly && completion?.status === "reconciled" ? (
          <button
            type="button"
            disabled={disabled || !summary.data?.canClose}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              confirmationLane.current = lane.projection.id;
              setConfirm("close");
            }}
            className="min-h-11 rounded-sm bg-ink px-3 py-2 text-xs text-pure focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
          >
            Close channel
          </button>
        ) : null}
        <button
          type="button"
          disabled={mutation.isPending || !connected || trace !== null}
          onClick={() =>
            summary.data && !readOnly
              ? mutation.mutate("check")
              : void summary.refetch()
          }
          className="min-h-11 rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info disabled:opacity-40"
        >
          Check again
        </button>
        {completion?.cdr ? (
          <AccountingRecordDialog
            laneId={lane.projection.id}
            assetUnit={assetUnit}
            assetDecimals={view.corridor.tariff.assetDecimals}
            normalizedTotal={completion.cdr.normalizedTotal}
          />
        ) : null}
        {summary.data?.evidenceEventId ? (
          <button
            type="button"
            onClick={() => inspect(summary.data!.evidenceEventId!)}
            className="min-h-11 rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info"
          >
            View evidence
          </button>
        ) : null}
        {summary.data?.paymentEventId ? (
          <button
            type="button"
            onClick={() => inspect(summary.data!.paymentEventId!)}
            className="min-h-11 rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info"
          >
            View payment
          </button>
        ) : null}
      </div>
      {trace !== null && !readOnly ? (
        <p className="mt-2 text-xs text-ink-secondary">
          Return to the live view to continue.
        </p>
      ) : mutation.isPending ? (
        <p role="status" className="mt-2 text-xs text-ink-secondary">
          Checking payment state
        </p>
      ) : !completion ? (
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
          if (
            confirm &&
            confirmationLane.current === focusedLaneId &&
            !disabled &&
            (confirm === "complete"
              ? summary.data?.canFinish &&
                view.activeRun?.status === "completed"
              : summary.data?.canClose)
          )
            mutation.mutate(confirm);
          setConfirm(null);
        }}
      />
    </section>
  );
}
