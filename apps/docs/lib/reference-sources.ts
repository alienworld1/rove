import ts from "typescript";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
export const reasonSources = [
  "packages/evidence/src/index.ts",
  "packages/protection/src/transition.ts",
  "packages/protection/src/completion.ts",
  "packages/ocpi/src/index.ts",
  "apps/engine/src/charging-effects.ts",
  "apps/engine/src/recover-charging.ts",
  "apps/engine/src/outbox-worker.ts",
  "packages/persistence/src/index.ts",
  "packages/domain/src/index.ts",
];
export function sourceStrings(path: string) {
  const text = readFileSync(resolve(repositoryRoot, path), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const strings = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isStringLiteral(node)) strings.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return strings;
}
export function reasonInventory() {
  const inventory = new Map<string, string>();
  for (const path of reasonSources)
    for (const value of sourceStrings(path)) {
      if (
        /^(EVIDENCE_|PAYMENT_|CDR_|FINAL_|RISK_|CONTROL_|PROTECTION_|RECOVERY_|EXPOSURE_|SESSION_TOTALS_|CHANNEL_CLOSED$|EFFECT_FAILED$)[A-Z_]*$/.test(
          value,
        )
      ) {
        if (!value.endsWith("_"))
          inventory.set(value, inventory.get(value) ?? path);
      }
    }
  for (const key of ["ENERGYWH", "ACCOUNTING", "AUTHORIZATION", "SETTLEMENT"])
    inventory.set(`CDR_${key}_MISMATCH`, "packages/ocpi/src/index.ts");
  return [...inventory].sort(([a], [b]) => a.localeCompare(b));
}

export function routeSourceInventory() {
  const files = [
    "apps/engine/src/server.ts",
    "apps/web/app/api/charging/[...path]/route.ts",
    "apps/web/app/api/lab/[...path]/route.ts",
    "apps/web/app/api/events/stream/route.ts",
  ];
  return files.map((path) => {
    const source = ts.createSourceFile(
      path,
      readFileSync(resolve(repositoryRoot, path), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const paths = new Set<string>();
    const matchers = new Set<string>();
    const schemas = new Set<string>();
    function visit(node: ts.Node) {
      if (
        ts.isStringLiteral(node) &&
        (node.text.startsWith("/api/") || node.text === "/health")
      )
        paths.add(node.text);
      if (
        node.kind === ts.SyntaxKind.RegularExpressionLiteral &&
        node.getText(source).includes("api")
      )
        matchers.add(node.getText(source));
      if (ts.isIdentifier(node) && node.text.endsWith("Schema"))
        schemas.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    return {
      source: path,
      paths: [...paths].sort(),
      matchers: [...matchers].sort(),
      schemas: [...schemas].sort(),
    };
  });
}
