import type { LabRunView } from "@rove/contracts";
import { labReasonText } from "./lab-copy";

export function LabLaneRuntime({ lanes }: { lanes: LabRunView["lanes"] }) {
  return (
    <section aria-labelledby="lab-lanes-title" className="py-7">
      <h3
        id="lab-lanes-title"
        className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-secondary"
      >
        Charging Lanes
      </h3>
      <div className="border-t border-line-strong">
        {lanes.map(({ definition, projection }) => (
          <div
            key={definition.key}
            className="grid gap-3 border-b border-line py-4 sm:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(12rem,1.4fr)] sm:items-start"
          >
            <div>
              <h4 className="font-semibold text-ink">
                {definition.label} · {definition.powerClass}{" "}
                {Number(definition.maxPowerWatts) / 1000} kW
              </h4>
              <p className="font-mono text-xs text-ink-tertiary">
                {projection?.id ?? "Preparing session"}
              </p>
            </div>
            <div>
              <p
                className={
                  projection?.state === "PAUSE_REQUIRED"
                    ? "font-semibold text-critical"
                    : projection?.state === "PROTECTED"
                      ? "font-semibold text-protected"
                      : "font-semibold text-risk"
                }
              >
                {projection?.state === "PAUSE_REQUIRED"
                  ? "Charging should pause until protection is restored."
                  : projection?.state === "PROTECTED"
                    ? "Protection ready"
                    : projection?.state === "RECOVERING"
                      ? "Restoring protection"
                      : projection?.state === "INITIALIZING"
                        ? "Preparing protection"
                        : (projection?.state ?? "Not started")}
              </p>
              <p className="text-xs text-ink-secondary">
                {labReasonText(projection?.reasonCodes[0])}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums text-ink-secondary">
              <p>
                Trusted{" "}
                <strong className="block text-sm text-ink">
                  {projection?.trustedDeliveredValue ?? "—"}
                </strong>
              </p>
              <p>
                Protected{" "}
                <strong className="block text-sm text-ink">
                  {projection?.protectedValue ?? "—"}
                </strong>
              </p>
              <p>
                Exposure bound{" "}
                <strong className="block text-sm text-ink">
                  {projection?.unprotectedExposureBound ?? "—"}
                </strong>
              </p>
              <p>
                Payment{" "}
                <strong className="block text-sm text-ink">
                  {projection?.operations.at(0)?.status ?? "—"}
                </strong>
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
