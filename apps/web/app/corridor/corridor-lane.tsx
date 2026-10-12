"use client";

import { animated, useSpring } from "@react-spring/web";
import { useState } from "react";
import {
  normalizeLaneGeometry,
  normalizeTracePosition,
  type CorridorOperatingView,
  type LaneTraceEvent,
  type CausalInspectorTrace,
} from "@rove/contracts";
import { motionPresets } from "./motion-presets";
import { useReducedMotion } from "./use-reduced-motion";
import {
  formatEnergy,
  formatOperationalValue,
} from "./format-operational-value";
import { LaneFocusDetails } from "./lane-focus-details";
import { CommittedEventMark } from "./committed-event-mark";
import { LaneEventPicker } from "./lane-event-picker";
import { CausalTraceHighlight } from "./causal-trace-highlight";
import { useLaneGeometryMotion } from "./use-lane-geometry-motion";
import { paymentBalances } from "./payment-balances";

const stateCopy = {
  INITIALIZING: "Preparing protection",
  PROTECTED: "Protection ready",
  WATCH: "Watch",
  AT_RISK: "At risk",
  PAUSE_REQUIRED: "Charging must pause",
  RECOVERING: "Restoring protection",
  COMPLETING: "Completing",
  RECONCILED: "Reconciled",
  CLOSED: "Closed",
} as const;

function markerX(event: LaneTraceEvent, traceEndMs: number) {
  const trace = normalizeTracePosition(
    event.traceOffsetMs,
    0,
    Math.max(traceEndMs, 1),
  );
  if (event.outcome === "rejected") return 45;
  if (event.eventType.startsWith("payment.")) return 76 + trace * 12;
  return 50 + trace * 22;
}

export function CorridorLane({
  lane,
  assetDecimals,
  assetUnit,
  tariff,
  focused,
  selectedEventId,
  selectedTraceOffsetMs,
  onSelectLane,
  onSelectEvent,
  setSelectedEventAnchor,
  causalTrace,
  current,
}: {
  lane: CorridorOperatingView["lanes"][number];
  assetDecimals: number;
  assetUnit: string;
  tariff: CorridorOperatingView["corridor"]["tariff"];
  focused: boolean;
  selectedEventId: string | null;
  selectedTraceOffsetMs: number | null;
  onSelectLane: () => void;
  onSelectEvent: (eventId: string) => void;
  setSelectedEventAnchor: (element: SVGElement | null) => void;
  causalTrace: CausalInspectorTrace | null;
  current: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [initialEventIds] = useState(
    () => new Set(lane.trace.map((event) => event.eventId)),
  );
  const projection = lane.projection;
  const anomalous = !["PROTECTED", "RECONCILED", "CLOSED"].includes(
    projection.state,
  );
  const normalizedGeometry = normalizeLaneGeometry({
    scale: lane.scale,
    protectedValue: projection.protectedValue,
    worstCaseDeliveredValue: projection.worstCaseDeliveredValue,
    maxUnprotectedExposure: projection.maxUnprotectedExposure,
    unprotectedExposureBound: projection.unprotectedExposureBound,
    pauseRequired: projection.state === "PAUSE_REQUIRED",
    settledValue: projection.settledValue,
    fundedCapacityValue: lane.fundedCapacityValue,
  });
  const geometry = {
    ...normalizedGeometry,
    frontier: 0.04 + normalizedGeometry.frontier * 0.92,
    physical: 0.04 + normalizedGeometry.physical * 0.92,
    riskStart: 0.04 + normalizedGeometry.riskStart * 0.92,
    riskWidth: normalizedGeometry.riskWidth * 0.92,
    protectionLimit: 0.04 + normalizedGeometry.protectionLimit * 0.92,
    settled: 0.04 + normalizedGeometry.settled * 0.92,
    fundedCapacity:
      normalizedGeometry.fundedCapacity === null
        ? null
        : 0.04 + normalizedGeometry.fundedCapacity * 0.92,
  };
  const height = focused ? 340 : anomalous ? 88 : 56;
  const preset =
    projection.state === "PAUSE_REQUIRED"
      ? motionPresets.interlock
      : projection.state === "RECOVERING"
        ? motionPresets.recover
        : motionPresets.structural;
  const structure = useSpring({
    height,
    config: preset,
    immediate: reducedMotion,
    delay: 0,
  });
  const spring = useLaneGeometryMotion(
    lane,
    geometry,
    reducedMotion,
    selectedTraceOffsetMs !== null || !current,
  );
  const summaryId = `lane-summary-${projection.id}`;
  return (
    <animated.section
      style={{ height: structure.height }}
      data-state={projection.state.toLowerCase()}
      data-focus={focused}
      className={`relative overflow-hidden border-y bg-raised transition-colors focus-within:bg-pure ${focused ? "my-6 border-line-authoritative" : anomalous ? "my-3 border-risk" : "my-2 border-line"}`}
      aria-labelledby={`lane-title-${projection.id}`}
    >
      <button
        id={`lane-control-${projection.id}`}
        type="button"
        onClick={onSelectLane}
        aria-expanded={focused}
        aria-describedby={summaryId}
        className="absolute inset-y-0 left-0 z-10 w-32 border-r border-line bg-raised px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-info max-[1279px]:w-28"
      >
        <span
          id={`lane-title-${projection.id}`}
          className="block text-sm font-semibold text-ink"
        >
          {lane.label}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-tertiary">
          {lane.powerClass}
        </span>
        <span
          className={`block text-[10px] leading-3 font-semibold ${projection.state === "PROTECTED" ? "text-protected" : projection.state === "PAUSE_REQUIRED" ? "text-critical" : "text-risk-deep"}`}
        >
          {stateCopy[projection.state]}
        </span>
      </button>
      <div className="absolute inset-y-0 left-32 right-0 max-[1279px]:left-28">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={`absolute w-full overflow-visible ${focused ? "top-44 h-24" : anomalous ? "top-3 h-10" : "top-0 h-7"}`}
          role="group"
          aria-label={`${lane.label} protection geometry`}
        >
          <g data-layer="structural">
            <line
              x1="4"
              y1="50"
              x2="96"
              y2="50"
              stroke="var(--color-line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="46"
              y1="18"
              x2="46"
              y2="82"
              stroke="var(--color-line-system)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <g data-layer="region">
            <animated.rect
              x="4"
              y="38"
              width={spring.frontier.to((value) => Math.max(0, value - 4))}
              height="24"
              fill="var(--color-protected-faint)"
            />
            <animated.rect
              x={spring.riskStart}
              y="34"
              width={spring.riskWidth}
              height="32"
              fill="var(--color-risk-soft)"
            />
          </g>
          <g data-layer="path">
            <animated.line
              x1="4"
              y1="70"
              x2={spring.frontier}
              y2="70"
              stroke="var(--color-protected)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="4"
              y1="70"
              x2={geometry.settled * 100}
              y2="70"
              stroke="var(--color-info)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            <animated.line
              x1="4"
              y1="50"
              x2={spring.physical}
              y2="50"
              stroke="var(--color-line-system)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="10"
              y1="30"
              x2="88"
              y2="30"
              stroke="var(--color-line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <g data-layer="boundary">
            {geometry.fundedCapacity !== null ? (
              <line
                x1={geometry.fundedCapacity * 100}
                y1="60"
                x2={geometry.fundedCapacity * 100}
                y2="82"
                stroke="var(--color-info)"
                strokeWidth="2"
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <animated.line
              x1={spring.frontier}
              y1="24"
              x2={spring.frontier}
              y2="76"
              stroke="var(--color-protected-deep)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            <animated.line
              x1={spring.protectionLimit}
              y1="18"
              x2={spring.protectionLimit}
              y2="82"
              stroke={
                projection.state === "PAUSE_REQUIRED"
                  ? "var(--color-critical-deep)"
                  : "var(--color-line-authoritative)"
              }
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
            />
          </g>
          {causalTrace && causalTrace.laneId === lane.projection.id ? (
            <CausalTraceHighlight trace={causalTrace} lane={lane} />
          ) : null}
          <g data-layer="event">
            {lane.trace
              .filter(
                (event) =>
                  [
                    "meter.evidence_accepted",
                    "meter.evidence_rejected",
                    "payment.top_up_completed",
                    "payment.settlement_completed",
                    "lane.pause_required",
                    "lane.protection_restored",
                  ].includes(event.eventType) ||
                  event.eventId === selectedEventId,
              )
              .map((event) => {
                const x = markerX(event, lane.scale.traceEndMs);
                const selected = event.eventId === selectedEventId;
                const beyondTrace =
                  selectedTraceOffsetMs !== null &&
                  event.traceOffsetMs !== null &&
                  event.traceOffsetMs > selectedTraceOffsetMs;
                return (
                  <CommittedEventMark
                    key={event.eventId}
                    event={event}
                    x={x}
                    selected={selected}
                    focused={focused}
                    anomalous={anomalous}
                    muted={beyondTrace}
                    animate={
                      current &&
                      selectedTraceOffsetMs === null &&
                      !initialEventIds.has(event.eventId)
                    }
                    reducedMotion={reducedMotion}
                    onSelect={() => onSelectEvent(event.eventId)}
                    setAnchor={setSelectedEventAnchor}
                  />
                );
              })}
          </g>
        </svg>
        {focused ? (
          <div className="pointer-events-none absolute inset-0 text-[10px] font-medium text-ink-secondary">
            <span className="absolute left-[43%] top-40 bg-pure px-1">
              Verification
            </span>
            <span className="absolute bottom-10 left-3 bg-pure px-1">
              Physical service · Meter evidence · Settled / protected value
            </span>
            {geometry.fundedCapacity !== null ? (
              <span
                className="absolute top-68 bg-pure px-1"
                style={{
                  left: `${Math.min(geometry.fundedCapacity * 100, 77)}%`,
                }}
              >
                Funded capacity
              </span>
            ) : null}
            <span
              className="absolute top-68 whitespace-nowrap bg-pure px-1"
              style={{ left: `${Math.min(geometry.frontier * 100 + 1, 77)}%` }}
            >
              Protection Frontier
            </span>
            <span className="absolute top-40 right-3 whitespace-nowrap bg-pure px-1">
              Protection limit
            </span>
            {geometry.riskWidth > 0 ? (
              <span
                className="absolute top-52 -translate-x-1/2 whitespace-nowrap bg-risk-faint px-1 text-risk-deep"
                style={{
                  left: `${(geometry.riskStart + geometry.riskWidth / 2) * 100}%`,
                }}
              >
                Risk Envelope
              </span>
            ) : null}
          </div>
        ) : null}
        <p id={summaryId} className="sr-only">
          Amounts in {assetUnit}. Trusted value{" "}
          {formatOperationalValue(
            projection.trustedDeliveredValue,
            assetDecimals,
          )}
          . Protected value{" "}
          {formatOperationalValue(projection.protectedValue, assetDecimals)}.
          Exposure bound{" "}
          {formatOperationalValue(
            projection.unprotectedExposureBound,
            assetDecimals,
          )}
          . Remaining protection capacity{" "}
          {formatOperationalValue(projection.exposureRemaining, assetDecimals)}.
        </p>
        <dl className="pointer-events-none absolute bottom-1.5 left-3 right-3 grid grid-cols-4 gap-2 text-[10px] leading-3 text-ink-tertiary">
          <div>
            <dt>Trusted</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {formatOperationalValue(
                projection.trustedDeliveredValue,
                assetDecimals,
              )}
            </dd>
          </div>
          <div>
            <dt>Protected</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {formatOperationalValue(projection.protectedValue, assetDecimals)}
            </dd>
          </div>
          <div>
            <dt>Exposure</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {formatOperationalValue(
                projection.unprotectedExposureBound,
                assetDecimals,
              )}
            </dd>
          </div>
          <div>
            <dt>Capacity</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {formatOperationalValue(
                projection.exposureRemaining,
                assetDecimals,
              )}
            </dd>
          </div>
        </dl>
        {focused ? (
          <dl className="absolute left-3 right-3 top-3 grid grid-cols-6 gap-x-4 gap-y-1 border-b border-line-faint pb-2 text-[11px] text-ink-secondary">
            <div>
              <dt>Session</dt>
              <dd className="truncate font-mono text-ink">
                {projection.externalSessionId}
              </dd>
            </div>
            <div>
              <dt>Energy</dt>
              <dd className="tabular-nums text-ink">
                {formatEnergy(projection.trustedEnergyWh)}
              </dd>
            </div>
            <div>
              <dt>Authorized</dt>
              <dd className="tabular-nums text-ink">
                {formatOperationalValue(
                  projection.authorizedValue,
                  assetDecimals,
                )}
              </dd>
            </div>
            <div>
              <dt>Headroom</dt>
              <dd className="tabular-nums text-ink">
                {formatOperationalValue(
                  paymentBalances(projection).headroom,
                  assetDecimals,
                )}
              </dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd className="text-ink">{projection.evidenceFreshness}</dd>
            </div>
            <div>
              <dt>Settled</dt>
              <dd className="tabular-nums text-ink">
                {formatOperationalValue(projection.settledValue, assetDecimals)}
              </dd>
            </div>
          </dl>
        ) : null}
        {focused ? (
          <LaneFocusDetails lane={lane} tariff={tariff} assetUnit={assetUnit} />
        ) : null}
        {focused ? (
          <LaneEventPicker
            label={lane.label}
            events={lane.trace}
            selectedEventId={selectedEventId}
            onSelect={onSelectEvent}
          />
        ) : null}
      </div>
    </animated.section>
  );
}
