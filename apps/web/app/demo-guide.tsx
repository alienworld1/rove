import type { RunGuidance } from "@rove/contracts";

export const milestoneLabels = {
  accepted: "Evidence accepted",
  top_up: "Reserve topped up",
  settled: "Payment collected",
  rejected: "Reading rejected",
  risk: "Risk growing",
  pause: "Pause required",
  recovered: "Protection restored",
};
const explanations = {
  accepted:
    "A valid signed meter reading established billable charging value. Funded payment approval increased protected value: the amount the charging operator can collect.",
  top_up:
    "Confirmed funding replenished the rolling reserve. The payer keeps a small forward buffer instead of prepaying a whole session.",
  settled:
    "The charging operator collected protected value. Settled value is money collected; protected value is funded, collectible authorization.",
  rejected:
    "This reading cannot advance trusted service or payment authorization. Electricity may still be delivered, so Rove calculates a conservative upper bound.",
  risk: "Possible delivered service exceeds funded protection. Missing or rejected evidence adds a conservative bound from maximum charger power and elapsed time; the amber envelope shows the value still at risk.",
  pause:
    "Possible unprotected exposure has reached the agreed limit. Rove requires charging to pause and the affected simulated charger stops. Other Lanes keep their own protection.",
  recovered:
    "Accepted readings and funded payment approval have restored protection within the agreed limit. The affected charging session can resume.",
};
export function DemoGuide({
  guidance,
  busy,
  onMode,
  onInspect,
}: {
  guidance: RunGuidance | null | undefined;
  busy: boolean;
  onMode?: (mode: "guided" | "continuous") => void;
  onInspect?: (laneId: string, eventId: string) => void;
}) {
  if (!guidance) return null;
  const active = guidance.reached.find((item) => item.id === guidance.active);
  return (
    <section
      aria-label="Scenario guide"
      className="mt-3 border-t border-line pt-3 text-sm text-ink-secondary"
    >
      {onMode ? (
        <label className="flex min-h-11 items-center gap-3">
          Run mode{" "}
          <select
            value={guidance.mode}
            disabled={busy}
            onChange={(event) =>
              onMode(event.target.value as "guided" | "continuous")
            }
            className="min-h-11 rounded-sm border border-line bg-pure px-3 text-ink"
          >
            <option value="guided">Guided · stop at milestones</option>
            <option value="continuous">Continuous</option>
          </select>
        </label>
      ) : null}
      {active ? (
        <div className="mt-2 border-l-2 border-info pl-3">
          <h3 className="font-semibold text-ink">
            {milestoneLabels[active.id]}
          </h3>
          <p className="mt-1 max-w-3xl">{explanations[active.id]}</p>
          {onInspect ? (
            <button
              type="button"
              className="mt-2 min-h-11 underline focus-visible:outline-2 focus-visible:outline-info"
              onClick={() => onInspect(active.laneId, active.eventId)}
            >
              Inspect this milestone
            </button>
          ) : null}
          <p className="mt-1 text-xs">
            The scenario is held at this milestone so you can inspect it.
            Continue when you’re ready.
          </p>
        </div>
      ) : null}
    </section>
  );
}
