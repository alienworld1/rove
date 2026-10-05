import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  labRunViewSchema,
  corridorOperatingViewSchema,
  completionSummarySchema,
  causalInspectorTraceSchema,
} from "@rove/contracts";
import type { PublishedSnapshot } from "@rove/persistence";
import { assertPublishableSnapshot } from "./publish-hosted-run.js";

// Immutable recordings retain their original amounts and receipt references.
const recordings = {
  presentation: {
    file: "tempo-rolling-protection.json",
    digest: "cd2f7605affa80cb4efc0d2d75af21938e2542b10e9229d0e96d50850c86b5a8",
  },
  boundary: {
    file: "tempo-three-lane.json",
    digest: "2f6f4be8cf3ec1a4fda1a2c5eb13d7242b42d0afa99428d19e8848086d094460",
  },
} as const;
export async function readVerifiedReleaseSeed(
  recording: keyof typeof recordings = "presentation",
): Promise<PublishedSnapshot> {
  const proof = recordings[recording];
  const bytes = await readFile(
    new URL(
      `../../../deployment/published-runs/${proof.file}`,
      import.meta.url,
    ),
  );
  if (createHash("sha256").update(bytes).digest("hex") !== proof.digest)
    throw new Error("The release recording does not match its verified proof.");
  const snapshot = JSON.parse(bytes.toString("utf8")) as PublishedSnapshot;
  labRunViewSchema.parse(snapshot.run);
  corridorOperatingViewSchema.parse(snapshot.corridor);
  for (const view of Object.values(snapshot.traces))
    corridorOperatingViewSchema.parse(view);
  for (const summary of Object.values(snapshot.completions))
    completionSummarySchema.parse(summary);
  for (const inspector of Object.values(snapshot.inspectors))
    causalInspectorTraceSchema.parse(inspector);
  assertPublishableSnapshot(snapshot);
  return snapshot;
}
