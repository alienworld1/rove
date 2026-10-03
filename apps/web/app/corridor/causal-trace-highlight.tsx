import {
  normalizeLaneGeometry,
  type CausalInspectorTrace,
  type CorridorOperatingView,
} from "@rove/contracts";

export function CausalTraceHighlight({
  trace,
  lane,
}: {
  trace: CausalInspectorTrace;
  lane: CorridorOperatingView["lanes"][number];
}) {
  if (!trace.evidence) return null;
  const verified = trace.causalSteps.some(
    (step) => step.type === "verification" && step.status === "complete",
  );
  const authorized = trace.causalSteps.some(
    (step) => step.type === "voucher" && step.status === "complete",
  );
  const frontier =
    4 +
    normalizeLaneGeometry({
      scale: lane.scale,
      protectedValue: trace.result.after.protected,
      worstCaseDeliveredValue: trace.result.after.protected,
      maxUnprotectedExposure: lane.projection.maxUnprotectedExposure,
      unprotectedExposureBound: "0",
      pauseRequired: false,
    }).frontier *
      92;
  return (
    <g data-layer="causal-trace" aria-hidden="true" pointerEvents="none">
      <line
        x1="10"
        y1="30"
        x2="45"
        y2="30"
        stroke={verified ? "var(--color-protected)" : "var(--color-critical)"}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {verified && authorized ? (
        <path
          d={`M 46 30 V 50 H ${frontier}`}
          fill="none"
          stroke="var(--color-protected-deep)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  );
}
