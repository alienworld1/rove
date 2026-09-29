"use client";

import { animated, useSpring } from "@react-spring/web";
import {
  eventLabelFor,
  normalizeLaneGeometry,
  normalizeTracePosition,
  reasonTextFor,
  type CorridorOperatingView,
  type LaneTraceEvent,
} from "@rove/contracts";
import { motionPresets } from "./motion-presets";
import { useReducedMotion } from "./use-reduced-motion";
import {
  formatEnergy,
  formatOperationalValue,
} from "./format-operational-value";
import { LaneFocusDetails } from "./lane-focus-details";

const stateCopy = {
  INITIALIZING: "Preparing protection",
  PROTECTED: "Protection ready",
  WATCH: "Watch",
  AT_RISK: "At risk",
  PAUSE_REQUIRED: "Charging should pause",
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
  if (event.outcome === "rejected") return Math.min(45, 18 + trace * 25);
  if (event.eventType.startsWith("payment.")) return 76 + trace * 12;
  return 50 + trace * 22;
}

export function CorridorLane({
  lane,
  assetDecimals,
  tariff,
  focused,
  selectedEventId,
  selectedTraceOffsetMs,
  onSelectLane,
  onSelectEvent,
  setSelectedEventAnchor,
}: {
  lane: CorridorOperatingView["lanes"][number];
  assetDecimals: number;
  tariff: CorridorOperatingView["corridor"]["tariff"];
  focused: boolean;
  selectedEventId: string | null;
  selectedTraceOffsetMs: number | null;
  onSelectLane: () => void;
  onSelectEvent: (eventId: string) => void;
  setSelectedEventAnchor: (element: SVGElement | null) => void;
}) {
  const reducedMotion = useReducedMotion();
  const projection = lane.projection;
  const anomalous = !["PROTECTED", "RECONCILED", "CLOSED"].includes(
    projection.state,
  );
  const geometry = normalizeLaneGeometry({
    scale: lane.scale,
    protectedValue: projection.protectedValue,
    worstCaseDeliveredValue: projection.worstCaseDeliveredValue,
    maxUnprotectedExposure: projection.maxUnprotectedExposure,
    unprotectedExposureBound: projection.unprotectedExposureBound,
    pauseRequired: projection.state === "PAUSE_REQUIRED",
  });
  const height = focused ? 340 : anomalous ? 88 : 56;
  const preset =
    projection.state === "PAUSE_REQUIRED"
      ? motionPresets.interlock
      : projection.state === "RECOVERING"
        ? motionPresets.recover
        : motionPresets.structural;
  const spring = useSpring({
    height,
    frontier: geometry.frontier * 100,
    physical: geometry.physical * 100,
    riskStart: geometry.riskStart * 100,
    riskWidth: geometry.riskWidth * 100,
    config: preset,
    immediate: reducedMotion,
    delay: 0,
  });
  const summaryId = `lane-summary-${projection.id}`;
  return (
    <animated.section
      style={{ height: spring.height }}
      data-state={projection.state.toLowerCase()}
      data-focus={focused}
      className={`relative overflow-hidden border-y bg-raised transition-colors focus-within:bg-pure ${focused ? "my-6 border-line-authoritative" : anomalous ? "my-3 border-risk" : "my-2 border-line"}`}
      aria-labelledby={`lane-title-${projection.id}`}
    >
      <button
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
          className={`mt-1 block text-xs font-semibold ${projection.state === "PROTECTED" ? "text-protected" : projection.state === "PAUSE_REQUIRED" ? "text-critical" : "text-risk"}`}
        >
          {stateCopy[projection.state]}
        </span>
      </button>
      <div className="absolute inset-y-0 left-32 right-0 max-[1279px]:left-28">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
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
            <animated.line
              x1={spring.frontier}
              y1="24"
              x2={spring.frontier}
              y2="76"
              stroke="var(--color-protected-deep)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={geometry.protectionLimit * 100}
              y1="18"
              x2={geometry.protectionLimit * 100}
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
          <g data-layer="event">
            {lane.trace.map((event) => {
              const x = markerX(event, lane.scale.traceEndMs);
              const selected = event.eventId === selectedEventId;
              const beyondTrace =
                selectedTraceOffsetMs !== null &&
                event.traceOffsetMs !== null &&
                event.traceOffsetMs > selectedTraceOffsetMs;
              return (
                <g
                  key={event.eventId}
                  ref={selected ? setSelectedEventAnchor : undefined}
                  role="button"
                  tabIndex={0}
                  data-event-id={event.eventId}
                  aria-label={`${eventLabelFor(event.eventType)}. ${event.reasonCode ? reasonTextFor(event.reasonCode) : "Open event details."}`}
                  onClick={(click) => {
                    click.stopPropagation();
                    onSelectEvent(event.eventId);
                  }}
                  onKeyDown={(key) => {
                    if (key.key === "Enter" || key.key === " ") {
                      key.preventDefault();
                      onSelectEvent(event.eventId);
                    }
                  }}
                  opacity={beyondTrace ? 0.28 : 1}
                  className="cursor-pointer focus-visible:outline-2 focus-visible:outline-info"
                >
                  <rect
                    x={x - 3}
                    y={focused ? 23 : anomalous ? 5 : -10}
                    width="6"
                    height={focused ? 14 : anomalous ? 50 : 80}
                    fill="transparent"
                  />
                  <circle
                    cx={x}
                    cy="30"
                    r={selected ? "2.8" : "2"}
                    fill={
                      event.outcome === "rejected" || event.outcome === "failed"
                        ? "var(--color-critical)"
                        : event.eventType.startsWith("payment.")
                          ? "var(--color-info)"
                          : "var(--color-protected)"
                    }
                    stroke={
                      selected
                        ? "var(--color-line-authoritative)"
                        : "var(--color-pure)"
                    }
                    strokeWidth={selected ? "1.5" : "1"}
                    vectorEffect="non-scaling-stroke"
                  />
                  {event.outcome === "rejected" ? (
                    <line
                      x1={x - 2}
                      y1="28"
                      x2={x + 2}
                      y2="32"
                      stroke="var(--color-pure)"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        {focused ? (
          <div className="pointer-events-none absolute inset-0 text-[10px] font-medium text-ink-secondary">
            <span className="absolute left-[43%] top-40 bg-pure/90 px-1">
              Verification
            </span>
            <span
              className="absolute bottom-12 whitespace-nowrap bg-pure/90 px-1"
              style={{ left: `${Math.min(geometry.frontier * 100 + 1, 77)}%` }}
            >
              Protection Frontier
            </span>
            <span
              className="absolute top-40 whitespace-nowrap bg-pure/90 px-1"
              style={{
                left: `${Math.min(geometry.protectionLimit * 100 + 1, 79)}%`,
              }}
            >
              Protection limit
            </span>
            {geometry.riskWidth > 0 ? (
              <span
                className="absolute bottom-28 -translate-x-1/2 whitespace-nowrap bg-risk-faint px-1 text-risk-deep"
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
          Trusted value {projection.trustedDeliveredValue}. Protected value{" "}
          {projection.protectedValue}. Exposure bound{" "}
          {projection.unprotectedExposureBound}. Remaining protection capacity{" "}
          {projection.exposureRemaining}.
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
          <dl className="absolute left-3 right-3 top-3 grid grid-cols-3 gap-x-4 gap-y-1 border-b border-line-faint pb-3 text-[11px] text-ink-secondary lg:grid-cols-6">
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
                  projection.fundedHeadroom,
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
        {focused ? <LaneFocusDetails lane={lane} tariff={tariff} /> : null}
      </div>
    </animated.section>
  );
}
