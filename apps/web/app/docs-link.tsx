import type { ReactNode } from "react";
import {
  docsTopics,
  eventDocsPath,
  reasonDocsPath,
  type DocsTopic,
} from "@rove/contracts/docs-links";
import { docsOrigin } from "./docs-origin";
export function DocsLink({
  topic = "introduction",
  reason,
  event,
  children,
  compact = false,
}: {
  topic?: DocsTopic;
  reason?: string | null;
  event?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const path =
    event !== undefined
      ? eventDocsPath(event)
      : reason !== undefined
        ? reasonDocsPath(reason)
        : docsTopics[topic];
  return (
    <a
      href={`${docsOrigin}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center rounded-sm text-info underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info ${compact ? "text-xs" : "min-h-11 text-sm"}`}
    >
      {children}
      <span className="sr-only"> (opens documentation in a new tab)</span>
    </a>
  );
}
