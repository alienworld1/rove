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
}: {
  topic?: DocsTopic;
  reason?: string | null;
  event?: string;
  children: ReactNode;
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
      className="inline-flex rounded-sm text-xs text-info underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info"
    >
      {children}
      <span className="sr-only"> (opens documentation in a new tab)</span>
    </a>
  );
}
