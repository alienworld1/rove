"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import type { CorridorOperatingView } from "@rove/contracts";
import { readCorridor, readInspector } from "./api";
import { AttachedInspector } from "./attached-inspector";
import { CorridorAggregateBand } from "./corridor-aggregate-band";
import { CorridorLane } from "./corridor-lane";
import { CounterpartyAnchor } from "./counterparty-anchor";
import { TraceScrubber } from "./trace-scrubber";
import { useCorridorSelection } from "./corridor-selection";
import { validateSelection } from "./selection-validation";
import { paymentAssetLabel, paymentNetworkLabel } from "../payment-asset";
import { LanePaymentHistory } from "./lane-payment-history";

function replaceSelectionUrl(
  corridorId: string,
  laneId: string | null,
  eventId: string | null,
  traceOffsetMs: number | null,
) {
  const url = new URL(window.location.href);
  url.searchParams.set("corridor", corridorId);
  for (const [key, value] of [
    ["lane", laneId],
    ["event", eventId],
    ["trace", traceOffsetMs === null ? null : String(traceOffsetMs)],
  ] as const)
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
}

export function CorridorViewport({
  view: liveView,
  current,
  recorded = false,
}: {
  view: CorridorOperatingView;
  current: boolean;
  recorded?: boolean;
}) {
  const selection = useCorridorSelection();
  const historical = useQuery({
    queryKey: [
      "corridor-trace",
      liveView.corridor.id,
      selection.traceOffsetMs,
      liveView.projectionVersion,
    ],
    queryFn: ({ signal }) =>
      readCorridor(liveView.corridor.id, signal, selection.traceOffsetMs),
    enabled: selection.traceOffsetMs !== null,
    retry: 1,
  });
  const view =
    selection.traceOffsetMs === null ? liveView : (historical.data ?? liveView);
  const assetUnit = paymentAssetLabel(
    view.corridor.tempoNetwork,
    view.corridor.settlementAssetId,
  );
  const focusedLane = view.lanes.find(
    (lane) => lane.projection.id === selection.focusedLaneId,
  );
  const [selectionMessage, setSelectionMessage] = useState("");
  const previousStates = useRef(new Map<string, string>());
  const eventTrigger = useRef<Element | null>(null);
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const operatingSurface = useRef<HTMLDivElement>(null);
  const { refs, floatingStyles, middlewareData } = useFloating({
    open: selection.focusedEventId !== null,
    placement: "right-start",
    strategy: "fixed",
    middleware: [
      offset(12),
      flip(),
      shift({ padding: 16 }),
      {
        name: "avoidOperatingSurface",
        fn: ({ x, y, rects }) => {
          const core = operatingSurface.current?.getBoundingClientRect();
          if (!core) return { data: { dock: true } };
          const top =
            operatingSurface.current
              ?.closest("section")
              ?.getBoundingClientRect().top ?? core.top;
          return {
            data: {
              dock:
                x < core.right &&
                x + rects.floating.width > core.left &&
                y < core.bottom &&
                y + rects.floating.height > top,
            },
          };
        },
      },
    ],
    whileElementsMounted: autoUpdate,
  });
  const inspector = useQuery({
    queryKey: ["inspector", selection.focusedLaneId, selection.focusedEventId],
    queryFn: ({ signal }) =>
      readInspector(
        selection.focusedLaneId!,
        selection.focusedEventId!,
        signal,
      ),
    enabled:
      selection.focusedLaneId !== null && selection.focusedEventId !== null,
    retry: 1,
  });
  useEffect(() => {
    const valid = validateSelection(
      liveView,
      selection.focusedLaneId,
      selection.focusedEventId,
      selection.traceOffsetMs,
    );
    if (!valid.changed) return;
    selection.replace(valid.laneId, valid.eventId, valid.traceOffsetMs);
    replaceSelectionUrl(
      view.corridor.id,
      valid.laneId,
      valid.eventId,
      valid.traceOffsetMs,
    );
    queueMicrotask(() =>
      setSelectionMessage("That selection is no longer available."),
    );
  }, [selection, liveView, view.corridor.id]);
  useEffect(() => {
    for (const lane of liveView.lanes) {
      const previous = previousStates.current.get(lane.projection.id);
      if (
        previous !== "PAUSE_REQUIRED" &&
        lane.projection.state === "PAUSE_REQUIRED"
      )
        setAssertiveAnnouncement(
          "Charging should pause until protection is restored.",
        );
      if (
        previous === "PAUSE_REQUIRED" &&
        lane.projection.state !== "PAUSE_REQUIRED"
      )
        setAssertiveAnnouncement("");
      if (
        previous &&
        ["AT_RISK", "PAUSE_REQUIRED", "RECOVERING"].includes(previous) &&
        lane.projection.state === "PROTECTED"
      )
        setSelectionMessage("Protection restored");
      previousStates.current.set(lane.projection.id, lane.projection.state);
    }
  }, [liveView.lanes]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (selection.focusedEventId) closeInspector();
      else if (selection.focusedLaneId) selectLane(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  });

  function selectLane(laneId: string | null) {
    setSelectionMessage("");
    const next = laneId === selection.focusedLaneId ? null : laneId;
    selection.setLane(next);
    replaceSelectionUrl(view.corridor.id, next, null, null);
  }
  function selectEvent(laneId: string, eventId: string) {
    setSelectionMessage("");
    eventTrigger.current = document.activeElement;
    selection.setEvent(laneId, eventId);
    replaceSelectionUrl(
      view.corridor.id,
      laneId,
      eventId,
      selection.traceOffsetMs,
    );
  }
  function closeInspector() {
    const eventId = selection.focusedEventId;
    selection.replace(selection.focusedLaneId, null, selection.traceOffsetMs);
    replaceSelectionUrl(
      view.corridor.id,
      selection.focusedLaneId,
      null,
      selection.traceOffsetMs,
    );
    window.requestAnimationFrame(() => {
      const trigger = eventTrigger.current;
      if (
        trigger?.isConnected &&
        (trigger instanceof HTMLElement || trigger instanceof SVGElement)
      ) {
        trigger.focus();
        return;
      }
      if (eventId)
        document
          .querySelector<HTMLElement>(
            `[data-event-id="${CSS.escape(eventId)}"]`,
          )
          ?.focus();
      if (document.activeElement === document.body)
        document
          .getElementById(`lane-control-${selection.focusedLaneId}`)
          ?.focus();
    });
  }
  function selectTrace(offsetMs: number | null) {
    selection.setTrace(offsetMs);
    replaceSelectionUrl(
      view.corridor.id,
      selection.focusedLaneId,
      selection.focusedEventId,
      offsetMs,
    );
  }
  return (
    <section aria-labelledby="corridor-title" className="mt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
            Protected charging Corridor
          </p>
          <h1
            id="corridor-title"
            className="mt-1 text-3xl font-semibold tracking-tight text-ink"
          >
            {view.corridor.payerEmsp} ↔ {view.corridor.payeeCpo}
          </h1>
        </div>
        <p className="text-sm text-ink-secondary">
          {view.aggregate.activeLaneCount} active{" "}
          {view.aggregate.activeLaneCount === 1 ? "Lane" : "Lanes"} ·{" "}
          {view.aggregate.attentionLaneIds.length
            ? `${view.aggregate.attentionLaneIds.length} need attention`
            : current
              ? "All protection ready"
              : "Last checked protection state"}
        </p>
      </div>
      <CorridorAggregateBand
        assetUnit={assetUnit}
        assetDecimals={view.corridor.tariff.assetDecimals}
        aggregate={view.aggregate}
        attentionLaneLabels={view.lanes
          .filter((lane) =>
            view.aggregate.attentionLaneIds.includes(lane.projection.id),
          )
          .map((lane) => lane.label)}
      />
      <p className="mt-2 text-xs text-ink-secondary">
        {paymentNetworkLabel(view.corridor.tempoNetwork)} · {assetUnit}
        {recorded ? " · Recorded" : ""}
      </p>
      {!current ? (
        <p className="mt-2 text-sm text-ink-secondary">
          Values and exposure bounds reflect the last checked state.
        </p>
      ) : null}
      {selection.traceOffsetMs !== null ? (
        <p
          role="status"
          className="border-b border-line py-3 text-sm text-ink-secondary"
        >
          {historical.isPending
            ? "Loading the recorded snapshot. Current values remain visible."
            : historical.isError
              ? "That recorded snapshot couldn't be loaded. Current values remain visible."
              : recorded
                ? "Recorded snapshot · Lane values and totals reflect committed history."
                : "Recorded snapshot · Lane values and totals reflect committed history. Playback stays at its current position."}
          {historical.isError ? (
            <button
              className="ml-2 underline"
              onClick={() => void historical.refetch()}
            >
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
      {view.activeRun ? (
        <TraceScrubber
          recorded={recorded}
          run={view.activeRun}
          committedOffsets={[
            ...new Set(
              view.lanes.flatMap((lane) =>
                lane.trace.flatMap((event) =>
                  event.traceOffsetMs === null || !event.snapshot
                    ? []
                    : [event.traceOffsetMs],
                ),
              ),
            ),
          ].sort((a, b) => a - b)}
          selectedOffsetMs={selection.traceOffsetMs}
          onChange={selectTrace}
        />
      ) : null}
      <div
        className={
          selection.focusedEventId
            ? "mt-5 min-[1800px]:grid min-[1800px]:grid-cols-[minmax(1040px,1fr)_440px] min-[1800px]:items-start min-[1800px]:gap-5"
            : "mt-5"
        }
      >
        <div
          ref={operatingSurface}
          className="overflow-x-auto border-y border-line-strong bg-raised"
          role="region"
          aria-label="Charging Corridor. Scroll horizontally for full detail on smaller screens."
          tabIndex={0}
        >
          <div className="flex min-w-[1040px] items-stretch">
            <CounterpartyAnchor
              name={view.corridor.payerEmsp}
              role="eMSP"
              align="origin"
            />
            <div className="min-w-0 flex-1 px-4 py-2">
              {view.lanes.length === 0 ? (
                <p className="py-16 text-center text-sm text-ink-secondary">
                  No active charging Lanes.
                </p>
              ) : (
                view.lanes.map((lane) => (
                  <CorridorLane
                    key={lane.projection.id}
                    lane={lane}
                    assetDecimals={view.corridor.tariff.assetDecimals}
                    assetUnit={assetUnit}
                    tariff={view.corridor.tariff}
                    focused={selection.focusedLaneId === lane.projection.id}
                    selectedEventId={selection.focusedEventId}
                    selectedTraceOffsetMs={selection.traceOffsetMs}
                    onSelectLane={() => selectLane(lane.projection.id)}
                    onSelectEvent={(eventId) =>
                      selectEvent(lane.projection.id, eventId)
                    }
                    setSelectedEventAnchor={refs.setReference}
                    causalTrace={inspector.data ?? null}
                    current={current}
                  />
                ))
              )}
            </div>
            <CounterpartyAnchor
              name={view.corridor.payeeCpo}
              role="CPO"
              align="destination"
            />
          </div>
        </div>
        {selection.focusedEventId ? (
          <AttachedInspector
            trace={inspector.data ?? null}
            loading={inspector.isLoading}
            error={
              inspector.error instanceof Error ? inspector.error.message : null
            }
            assetDecimals={view.corridor.tariff.assetDecimals}
            assetUnit={assetUnit}
            floatingRef={refs.setFloating}
            floatingStyle={floatingStyles}
            docked={middlewareData.avoidOperatingSurface?.dock !== false}
            onClose={closeInspector}
            onRetry={() => void inspector.refetch()}
            current={current}
          />
        ) : null}
      </div>
      {focusedLane ? (
        <LanePaymentHistory lane={focusedLane} corridor={view.corridor} />
      ) : null}
      <div
        className="mt-3 text-sm text-ink-secondary"
        role="status"
        aria-live="polite"
      >
        {selectionMessage}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {assertiveAnnouncement}
      </div>
      <noscript>
        <p className="mt-4 text-sm text-ink-secondary">
          This Corridor requires scripting for live inspection. Current Lane
          state remains available through the protected read interface.
        </p>
      </noscript>
    </section>
  );
}
