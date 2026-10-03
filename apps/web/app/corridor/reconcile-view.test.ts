import assert from "node:assert/strict";
import { test } from "node:test";
import type { CorridorOperatingView } from "@rove/contracts";
import { reconcileCorridorView } from "./reconcile-view.ts";

const view = (id: string, projectionVersion: number) =>
  ({ corridor: { id }, projectionVersion }) as CorridorOperatingView;
test("an older read cannot replace a newer authoritative Corridor", () => {
  const latest = view("corridor", 12);
  assert.equal(reconcileCorridorView(latest, view("corridor", 11)), latest);
  const next = view("corridor", 13);
  assert.equal(reconcileCorridorView(latest, next), next);
  const different = view("other", 1);
  assert.equal(reconcileCorridorView(latest, different), different);
});
