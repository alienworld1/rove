export function CorridorLegend() {
  return (
    <section
      aria-label="How to read this Corridor"
      className="border-b border-line py-3 text-xs text-ink-secondary"
    >
      <p>
        This Corridor is one relationship between a mobility provider (payer)
        and a charging operator (payee). Each Lane is one charging session with
        its own reserve. Select a Lane or event to inspect its readings, payment
        protection, and possible exposure.
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        <div>
          <dt className="font-semibold text-ink">Physical delivery</dt>
          <dd>Electricity supplied</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Signed evidence</dt>
          <dd>Meter readings accepted or rejected</dd>
        </div>
        <div>
          <dt className="font-semibold text-protected">Protected value</dt>
          <dd>
            Verified service with funded approval · collectible, not yet
            necessarily collected
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Settled value</dt>
          <dd>Payment already collected</dd>
        </div>
        <div>
          <dt className="font-semibold text-risk-deep">Risk envelope</dt>
          <dd>Possible service value beyond protection · an upper bound</dd>
        </div>
      </dl>
    </section>
  );
}
