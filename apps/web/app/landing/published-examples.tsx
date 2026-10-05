"use client";

import { useQuery } from "@tanstack/react-query";
import { readPublishedRuns } from "../hosted-api";
import { PublishedRunList } from "../published-run-list";

export function PublishedExamples() {
  const published = useQuery({
    queryKey: ["published-runs"],
    queryFn: readPublishedRuns,
  });
  if (published.isPending)
    return (
      <p role="status" className="py-8 text-sm text-ink-secondary">
        Loading recorded examples…
      </p>
    );
  if (published.error)
    return (
      <div role="alert" className="py-8 text-sm text-ink-secondary">
        <p>
          Recorded examples are unavailable right now. You can still explore how
          Rove works above or read the documentation.
        </p>
        <button
          onClick={() => void published.refetch()}
          className="mt-3 min-h-11 underline focus-visible:outline-2 focus-visible:outline-info"
        >
          Try again
        </button>
      </div>
    );
  return <PublishedRunList runs={published.data ?? []} />;
}
