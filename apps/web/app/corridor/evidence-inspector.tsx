import { eventLabelFor, type CausalInspectorTrace } from "@rove/contracts";
import {
  formatEnergy,
  formatOperationalValue,
} from "./format-operational-value";

export function EvidenceInspector({
  trace,
  assetDecimals,
}: {
  trace: CausalInspectorTrace;
  assetDecimals: number;
}) {
  const evidence = trace.evidence;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
        Evidence Inspector
      </p>
      <h3 className="mt-2 text-lg font-semibold text-ink">
        {!evidence
          ? eventLabelFor(trace.eventType)
          : evidence.accepted
            ? "Meter reading accepted"
            : "Meter reading rejected"}
      </h3>
      {trace.reasonText ? (
        <p className="mt-1 text-sm text-ink-secondary">{trace.reasonText}</p>
      ) : null}
      {evidence ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-ink-tertiary">Source</dt>
            <dd className="mt-0.5 text-ink">{evidence.source}</dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Reading time</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {evidence.timestamp
                ? new Date(evidence.timestamp).toLocaleString()
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Recorded at</dt>
            <dd className="mt-0.5 tabular-nums text-ink">
              {new Date(trace.traceTime ?? trace.occurredAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Meter</dt>
            <dd className="mt-0.5 truncate font-mono text-ink">
              {evidence.meterId ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Sequence</dt>
            <dd className="mt-0.5 font-mono text-ink">
              {evidence.sequence ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Charging session</dt>
            <dd className="mt-0.5 break-all font-mono text-ink">
              {evidence.sessionId ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Cumulative energy</dt>
            <dd className="mt-0.5 font-mono text-ink">
              {evidence.cumulativeWh === null
                ? "Unavailable"
                : formatEnergy(evidence.cumulativeWh)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-tertiary">Verifier</dt>
            <dd className="mt-0.5 text-ink">{evidence.verifierVersion}</dd>
          </div>
          {Object.entries(evidence.checks).map(([check, status]) => (
            <div key={check}>
              <dt className="capitalize text-ink-tertiary">{check}</dt>
              <dd
                className={`mt-0.5 font-semibold ${status === "verified" ? "text-protected" : status === "rejected" ? "text-critical" : "text-ink-secondary"}`}
              >
                {status}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-secondary">
          No meter evidence is linked to this event.
        </p>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs font-semibold text-ink-secondary">
          Value consequence
        </p>
        {trace.calculation ? (
          <p className="mt-2 text-xs text-ink-tertiary">
            Tariff{" "}
            {formatOperationalValue(
              trace.calculation.tariffPerKwh,
              trace.calculation.tariffDecimals,
            )}{" "}
            / kWh · exact values recorded in {trace.calculation.assetDecimals}
            -decimal units
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-3 text-xs tabular-nums">
          <p className="text-ink-tertiary">
            Trusted
            <strong className="block text-sm text-ink">
              {trace.result.before
                ? `${formatOperationalValue(trace.result.before.trusted, assetDecimals)} → `
                : ""}
              {formatOperationalValue(
                trace.result.after.trusted,
                assetDecimals,
              )}
            </strong>
          </p>
          <p className="text-ink-tertiary">
            Protected
            <strong className="block text-sm text-ink">
              {trace.result.before
                ? `${formatOperationalValue(trace.result.before.protected, assetDecimals)} → `
                : ""}
              {formatOperationalValue(
                trace.result.after.protected,
                assetDecimals,
              )}
            </strong>
          </p>
          <p className="text-ink-tertiary">
            Exposure
            <strong className="block text-sm text-ink">
              {trace.result.before
                ? `${formatOperationalValue(trace.result.before.exposure, assetDecimals)} → `
                : ""}
              {formatOperationalValue(
                trace.result.after.exposure,
                assetDecimals,
              )}
            </strong>
          </p>
        </div>
        <p className="mt-3 text-xs text-ink-secondary">
          {evidence?.accepted === false
            ? "This reading did not create a new payment authorization."
            : trace.voucher
              ? `Cumulative authorization ${formatOperationalValue(trace.voucher.cumulativeAmount, assetDecimals)} was recorded.`
              : "No new payment authorization is linked to this reading."}
        </p>
      </div>
    </div>
  );
}
