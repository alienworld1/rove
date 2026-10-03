import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { register } from "fumadocs-mdx/node";
import { compileLabScenario } from "@rove/lab";
import {
  controlledMeterProfiles,
  northstarVoltwayScenario,
} from "@rove/lab/scenarios/northstar-voltway";
import { labEventSchema, completionCommandSchema } from "@rove/contracts";
import {
  docsTopics,
  documentedReasons,
  reasonDocsPath,
} from "@rove/contracts/docs-links";
import { normalizeAccountingRecord } from "@rove/ocpi";
import { verifyOcmf } from "@rove/evidence";
import { z } from "zod";
import {
  repositoryRoot,
  reasonInventory,
  sourceStrings,
  routeSourceInventory,
} from "../lib/reference-sources";
import {
  accountingExample,
  completionExample,
  schemaReferences,
  apiEntries,
} from "../lib/reference-blocks";
import { validateTarget, validateCoverage } from "../lib/reference-validation";
import routeContract from "../lib/route-contract.json";
register();
const { source } = await import("../lib/source");
const pages = source.getPages();
const expectedRoutes = [
  "",
  "start/ev-roaming",
  "start/how-rove-works",
  "concepts/corridor-and-lane",
  "concepts/protection-window",
  "architecture/system-overview",
  "architecture/trust-and-authority",
  "integrate/meter-evidence",
  "integrate/tempo/channel-lifecycle",
  "architecture/failure-and-recovery",
  "lab",
  "lab/scenario-schema",
  "lab/fault-library",
  "reference/domain-events",
  "reference/reason-codes",
  "reference/api",
  "integrate/cdr-reconciliation",
  "reference/security",
].map((slug) => `/docs${slug ? `/${slug}` : ""}`);
assert.deepEqual(
  pages.map((page) => page.url).sort(),
  expectedRoutes.sort(),
  "Public page membership drifted",
);
const targets = new Map(
  pages.map((page) => [
    page.url,
    new Set(page.data.toc.map((heading) => heading.url.slice(1))),
  ]),
);
const treeUrls: string[] = [];
function tree(node: {
  type?: string;
  url?: string;
  children?: unknown[];
  index?: unknown;
}) {
  if (node.url) treeUrls.push(node.url);
  if (node.index) tree(node.index as typeof node);
  for (const child of node.children ?? []) tree(child as typeof node);
}
tree(source.pageTree);
assert.deepEqual(
  [...new Set(treeUrls)].sort(),
  expectedRoutes,
  "Orphan page or navigation target",
);
for (const page of pages) {
  assert.ok(
    page.data.title.trim() && page.data.description?.trim(),
    `Missing metadata: ${page.url}`,
  );
  assert.ok(
    page.slugs.every((slug) => /^[a-z0-9-]+$/.test(slug)),
    `Unsafe slug: ${page.url}`,
  );
  for (const reference of page.data.extractedReferences ?? []) {
    const url = new URL(reference.href, `https://docs.invalid${page.url}`);
    if (url.origin === "https://docs.invalid")
      validateTarget(`${url.pathname}${url.hash}`, targets);
  }
}
for (const page of pages)
  assert.equal(
    new Set(page.data.toc.map((heading) => heading.url)).size,
    page.data.toc.length,
    `Duplicate heading target: ${page.url}`,
  );
for (const path of Object.values(docsTopics)) validateTarget(path, targets);
for (const reason of documentedReasons)
  validateTarget(reasonDocsPath(reason), targets);
const text = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");
const reasons = text("apps/docs/content/docs/reference/reason-codes.mdx");
validateCoverage(
  reasonInventory().map(([id]) => id),
  reasons,
  "reason",
);
for (const [, path] of reasonInventory())
  assert.ok(text(path).length, `Unresolved source: ${path}`);
const eventText = text("apps/docs/content/docs/reference/domain-events.mdx");
for (const path of [
  "packages/protection/src/transition.ts",
  "packages/protection/src/completion.ts",
  "packages/persistence/src/index.ts",
]) {
  const events = [...sourceStrings(path)].filter((id) =>
    /^(meter|lane|payment|pause|session|corridor)\.[a-z_]+$/.test(id),
  );
  validateCoverage(events, eventText, "event/effect");
}
const faults = labEventSchema.options.map((option) => option.shape.type.value);
validateCoverage(
  faults,
  text("apps/docs/content/docs/lab/fault-library.mdx"),
  "fault",
);
const jsonBlocks: unknown[] = [];
type AstNode = {
  type: string;
  lang?: string;
  value?: string;
  children?: AstNode[];
};
function visit(node: AstNode) {
  if (node.type === "code" && node.lang === "json")
    jsonBlocks.push(JSON.parse(node.value!));
  for (const child of node.children ?? []) visit(child);
}
for (const page of pages) visit((await page.data.getMDAST()) as AstNode);

function requireExample(example: unknown, name: string) {
  assert.ok(
    jsonBlocks.some(
      (block) => JSON.stringify(block) === JSON.stringify(example),
    ),
    `Missing or stale checked example: ${name}`,
  );
}
requireExample(northstarVoltwayScenario, "controlled scenario");
compileLabScenario(northstarVoltwayScenario, controlledMeterProfiles);
requireExample(completionExample, "completion intent");
completionCommandSchema.parse(completionExample);
requireExample(accountingExample, "accounting record");
const normalized = normalizeAccountingRecord(
  JSON.stringify(accountingExample),
  {
    externalSessionId: "session-123",
    sourcePartyId: "controlled-cpo",
    meterId: "meter-123",
    chargerId: "charger-123",
    startedAt: accountingExample.startedAt,
    endedAt: accountingExample.endedAt,
    currency: "USD",
    settlementAssetId: "TEST_ASSET",
    tariff: accountingExample.tariffBasis,
  },
  "2026-10-03T12:02:00Z",
);
assert.equal(normalized.totalEnergyWh, "1000");
assert.equal(normalized.normalizedTotal, "500000");
for (const [name, schema] of Object.entries(schemaReferences))
  requireExample(z.toJSONSchema(schema, { target: "draft-7" }), name);
const fixture = JSON.parse(
  text("packages/evidence/fixtures/safe-ocmf-example.json"),
);
const evidence = verifyOcmf({
  ...fixture,
  expectedMeterId: "17619300",
  expectedSessionId: "29",
  maxAgeMs: 60000,
  now: new Date("2019-08-13T10:03:37.000Z"),
});
assert.equal(evidence.accepted, true);
assert.deepEqual(
  routeSourceInventory(),
  routeContract,
  "Route/schema source contract changed; review the API reference before updating the snapshot",
);
const api = text("apps/docs/content/docs/reference/api.mdx");
validateCoverage(
  apiEntries.flatMap(([, path, , schema]) => [path, schema]),
  api,
  "documented API contract",
);
validateCoverage(
  [...sourceStrings("apps/engine/src/server.ts")].filter(
    (value) =>
      (value.startsWith("/api/") && !value.endsWith("/")) ||
      value === "/health",
  ),
  api,
  "route",
);
for (const file of [
  "apps/web/app/api/charging/[...path]/route.ts",
  "apps/web/app/api/lab/[...path]/route.ts",
  "apps/web/app/api/events/stream/route.ts",
])
  assert.ok(text(file).length);
for (const page of pages)
  assert.doesNotMatch(
    JSON.stringify(page.data.structuredData),
    /module\s*\d|hackathon|agent-docs|PRD|TODO/i,
    `Internal context in ${page.url}`,
  );
process.stdout.write(
  `Checked ${pages.length} public pages, compiled links/headings, navigation, reasons, events, faults, routes, schemas, and executable fixtures.\n`,
);
