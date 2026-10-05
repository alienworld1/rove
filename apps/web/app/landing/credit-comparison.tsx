export function CreditComparison() {
  return (
    <section
      aria-labelledby="comparison-title"
      className="border-t border-line-strong py-14 sm:py-20"
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-ink-secondary">
            02 / A different credit boundary
          </p>
          <h2
            id="comparison-title"
            className="mt-4 max-w-md text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Fund what’s delivered.
            <br />
            Keep room for what’s next.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-secondary">
            Protecting the charging operator shouldn’t mean reserving the full
            expected cost of every session upfront.
          </p>
        </div>
        <dl className="divide-y divide-line border-y border-line">
          <div className="grid gap-3 py-6 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold">Invoice-based credit</dt>
            <dd className="text-sm leading-relaxed text-ink-secondary">
              Payment terms govern when your partner pays. They don’t directly
              follow the service being delivered in each active charging
              session.
            </dd>
          </div>
          <div className="grid gap-3 py-6 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold">Full-session prepayment</dt>
            <dd className="text-sm leading-relaxed text-ink-secondary">
              Reserving the expected total protects the operator, but ties up
              money before the customer’s final consumption is known.
            </dd>
          </div>
          <div className="grid gap-3 py-6 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold">With Rove</dt>
            <dd className="text-sm leading-relaxed text-ink-secondary">
              Fund consumed service progressively, plus a small rolling reserve.
              Verified readings and funded approval determine secured value; a
              configured limit bounds possible exposure.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
