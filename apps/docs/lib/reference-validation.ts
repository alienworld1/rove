import assert from "node:assert/strict";
export function validateTarget(
  path: string,
  targets: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const [route, fragment] = path.split("#");
  assert.ok(targets.has(route), `Missing documentation route: ${route}`);
  if (fragment)
    assert.ok(
      targets.get(route)?.has(fragment),
      `Missing documentation fragment: ${path}`,
    );
}
export function validateCoverage(
  identifiers: string[],
  content: string,
  kind: string,
) {
  for (const identifier of identifiers)
    assert.ok(
      content.includes(`\`${identifier}\``),
      `Missing ${kind} reference: ${identifier}`,
    );
}
