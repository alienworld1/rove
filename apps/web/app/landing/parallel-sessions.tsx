export function ParallelSessions() {
  return (
    <figure className="grid gap-6 border-y border-line py-8 sm:grid-cols-[1fr_1.2fr] sm:gap-14">
      <figcaption>
        <h3 className="text-lg font-semibold">
          One relationship. Independent sessions.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary">
          The recorded example follows three charging sessions between the same
          two businesses. One session’s rejected reading doesn’t automatically
          stop the others.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          In the workspace, a business relationship is a{" "}
          <strong className="font-semibold text-ink">Corridor</strong>. Each
          charging session is a{" "}
          <strong className="font-semibold text-ink">Lane</strong>.
        </p>
      </figcaption>
      <div
        aria-label="Illustration of three independently protected charging sessions"
        className="space-y-4"
      >
        {["Session 1", "Session 2", "Session 3"].map((label, index) => (
          <div key={label} className="flex items-center gap-4">
            <span className="w-16 shrink-0 font-mono text-xs text-ink-secondary">
              {label}
            </span>
            <div className="flex h-6 flex-1 border-r-2 border-line-strong bg-pure">
              <div
                className={`border-r-2 border-protected bg-protected-soft ${index === 2 ? "w-1/2" : "w-4/5"}`}
              />
              {index === 2 ? (
                <div className="w-1/4 border-r-2 border-critical bg-risk-soft" />
              ) : null}
            </div>
            <span
              className={`w-24 text-xs ${index === 2 ? "text-critical" : "text-protected-deep"}`}
            >
              {index === 2 ? "Pause required" : "Protected"}
            </span>
          </div>
        ))}
        <p className="text-xs text-ink-secondary">
          Illustration of independent protection, not live session data.
        </p>
      </div>
    </figure>
  );
}
