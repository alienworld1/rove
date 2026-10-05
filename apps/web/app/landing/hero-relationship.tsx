export function HeroRelationship() {
  return (
    <figure className="border-t border-line-strong pt-6 lg:border-t-0 lg:pt-0">
      <div className="flex justify-between gap-4 text-sm">
        <p>
          <span className="block font-semibold">Charging operator</span>
          <span className="text-ink-secondary">Supplies electricity</span>
        </p>
        <p className="text-right">
          <span className="block font-semibold">Mobility provider</span>
          <span className="text-ink-secondary">Owes payment</span>
        </p>
      </div>
      <div className="relative mt-10 border-x-2 border-line-authoritative py-6">
        <div className="flex items-center gap-3 px-4 text-xs text-ink-secondary">
          <span className="h-px flex-1 bg-line-strong" />
          <span>One charging session</span>
          <span className="h-px flex-1 bg-line-strong" />
        </div>
        <div className="mx-4 mt-5 flex h-12 border border-line-strong">
          <div className="flex w-3/5 items-center border-r-2 border-protected bg-protected-soft px-3 text-xs font-semibold text-protected-deep">
            Payment secured
          </div>
          <div className="flex flex-1 items-center bg-risk-faint px-3 text-xs font-semibold text-risk-deep">
            Value at risk
          </div>
        </div>
        <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-ink-secondary">
          <span>Charging value increases</span>
          <span className="h-px flex-1 bg-line-strong" />
          <span aria-hidden="true">→</span>
        </div>
      </div>
      <figcaption className="mt-5 max-w-md text-xs leading-relaxed text-ink-secondary">
        Distance here represents service value and payment protection. The gap
        is credit exposure, not physical distance.
      </figcaption>
    </figure>
  );
}
