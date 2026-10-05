import Link from "next/link";
import type { PublishedRun } from "@rove/contracts";

export function PublishedRunList({ runs }: { runs: PublishedRun[] }) {
  return (
    <div className="py-6">
      {runs.length ? (
        <ul className="divide-y divide-line">
          {runs.map((run) => (
            <li
              key={run.id}
              className="grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <h3 className="text-lg font-semibold text-ink">{run.title}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
                  {run.description}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
                  Simulated charging · {run.payment} · Recorded, read-only
                </p>
                <p className="mt-2 text-xs text-ink-secondary">
                  Published{" "}
                  <time dateTime={run.publishedAt}>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(run.publishedAt))}
                  </time>
                </p>
              </div>
              <Link
                href={`/?run=${encodeURIComponent(run.id)}&recorded=1`}
                className="inline-flex min-h-11 items-center gap-6 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info"
              >
                Open recorded example <span aria-hidden="true">↗</span>
                <span className="sr-only">: {run.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-secondary">
          No recorded examples have been published yet. Explore the chapters
          above to see how payment protection works.
        </p>
      )}
    </div>
  );
}
