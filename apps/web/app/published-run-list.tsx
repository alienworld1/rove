import Link from "next/link";
import type { PublishedRun } from "@rove/contracts";
export function PublishedRunList({ runs }: { runs: PublishedRun[] }) {
  return (
    <section
      id="published-runs"
      className="border-t border-line-strong py-8"
      aria-labelledby="runs-title"
    >
      <h2 id="runs-title" className="text-xl font-semibold text-ink">
        Explore runs
      </h2>
      <p className="mt-2 text-sm text-ink-secondary">
        Follow verified evidence through protection, settlement, and final
        accounting. These are recorded runs; inspecting them never starts a
        payment.
      </p>
      {runs.length ? (
        <ul className="mt-6 divide-y divide-line">
          {runs.map((run) => (
            <li key={run.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/?run=${encodeURIComponent(run.id)}&recorded=1`}
                    className="text-lg font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-info"
                  >
                    {run.title}
                  </Link>
                  <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
                    {run.description}
                  </p>
                </div>
                <span className="border border-line px-3 py-1 text-xs text-ink-secondary">
                  {run.payment} · Recorded
                </span>
              </div>
              <p className="mt-3 text-xs text-ink-tertiary">
                Published{" "}
                <time dateTime={run.publishedAt}>
                  {new Date(run.publishedAt).toLocaleDateString()}
                </time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-ink-secondary">
          No runs have been published yet. Check back soon to explore the first
          Corridor.
        </p>
      )}
    </section>
  );
}
