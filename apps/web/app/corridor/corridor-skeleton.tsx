export function CorridorSkeleton() {
  return (
    <section
      aria-label="Loading Corridor state"
      aria-busy="true"
      className="mt-8"
    >
      <p role="status" className="mb-4 text-sm text-ink-secondary">
        Loading Corridor…
      </p>
      <div className="overflow-x-auto">
        <div className="flex min-w-[1040px] items-stretch overflow-hidden border-y border-line-strong bg-raised">
          <div className="w-40 shrink-0 bg-sunken" />
          <div className="flex-1 space-y-2 p-4">
            {[0, 1, 2].map((lane) => (
              <div
                key={lane}
                className="h-[56px] border-y border-line-faint bg-canvas"
              />
            ))}
          </div>
          <div className="w-40 shrink-0 bg-sunken" />
        </div>
      </div>
    </section>
  );
}
