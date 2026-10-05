"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { readPublishedRuns } from "../hosted-api";
import { newestTempoRecording } from "../published-recording";

export function RecordedExampleLink() {
  const published = useQuery({
    queryKey: ["published-runs"],
    queryFn: readPublishedRuns,
  });
  const featured = newestTempoRecording(published.data ?? []);
  return (
    <Link
      href={
        featured
          ? `/?run=${encodeURIComponent(featured.id)}&recorded=1`
          : "/#published-runs"
      }
      className="inline-flex min-h-12 items-center justify-between gap-8 rounded-sm bg-ink px-5 py-3 text-sm font-semibold text-pure hover:bg-line-authoritative focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-info"
    >
      Explore a recorded example <span aria-hidden="true">↗</span>
    </Link>
  );
}
