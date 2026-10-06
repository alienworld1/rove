export function CorridorLegend() {
  return (
    <section
      aria-label="How to read this Corridor"
      className="border-b border-line py-3 text-xs text-ink-secondary"
    >
      <p>
        The charging operator delivers electricity to the mobility provider’s
        customer. Signed meter evidence supports funded payment protection as
        service progresses.
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
          <dd>Verified service backed by funded authorization</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Settled value</dt>
          <dd>Payment already collected</dd>
        </div>
        <div>
          <dt className="font-semibold text-risk-deep">Risk envelope</dt>
          <dd>Worst-case service beyond protected value</dd>
        </div>
      </dl>
    </section>
  );
}
