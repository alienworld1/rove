import type { LabRunView } from "@rove/contracts";

export function LabEnvironmentSummary({
  environment,
}: {
  environment: LabRunView["environment"];
}) {
  return (
    <section
      aria-label="Environment"
      className="border-y border-line py-4 text-sm text-ink-secondary"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span className="block text-xs uppercase tracking-wide text-ink-tertiary">
            Physical source
          </span>
          <strong className="font-semibold text-ink">
            {environment.physicalSource}
          </strong>
        </p>
        <p>
          <span className="block text-xs uppercase tracking-wide text-ink-tertiary">
            Evidence
          </span>
          {environment.evidence}
        </p>
        <p>
          <span className="block text-xs uppercase tracking-wide text-ink-tertiary">
            Payment
          </span>
          {environment.payment}
        </p>
        <p>
          <span className="block text-xs uppercase tracking-wide text-ink-tertiary">
            Settlement boundary
          </span>
          {environment.settlement}
        </p>
      </div>
    </section>
  );
}
