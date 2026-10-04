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

// This exact artifact was verified against Moderato receipts on 2026-10-04.
const verifiedDigest =
  "2f6f4be8cf3ec1a4fda1a2c5eb13d7242b42d0afa99428d19e8848086d094460";
export async function readVerifiedReleaseSeed(): Promise<PublishedSnapshot> {
  const bytes = await readFile(
    new URL(
      "../../../deployment/published-runs/tempo-three-lane.json",
      import.meta.url,
    ),
  );
  if (createHash("sha256").update(bytes).digest("hex") !== verifiedDigest)
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
