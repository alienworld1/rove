import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inviteDestination,
  readLabNavigation,
  workspaceUrl,
} from "../lab/navigation-url";

test("home clears the previous run instead of falling back to an initial selection", () => {
  const selected = readLabNavigation(
    new URLSearchParams("run=example&lane=session&trace=3000"),
  );
  assert.equal(selected.runId, "example");
  const home = readLabNavigation(new URLSearchParams());
  assert.equal(home.runId, null);
  assert.equal(home.view, "corridor");
});

test("scenario navigation preserves a recorded selection for return and strips invite secrets", () => {
  const target = workspaceUrl(
    "https://rove.example/?run=example&recorded=1&lane=session&event=reading&trace=3000#invite=secret",
    "lab",
    { copy: "example" },
  );
  const url = new URL(target, "https://rove.example");
  assert.equal(url.searchParams.get("view"), "lab");
  assert.equal(url.searchParams.get("copy"), "example");
  for (const [key, value] of [
    ["run", "example"],
    ["lane", "session"],
    ["event", "reading"],
    ["trace", "3000"],
    ["recorded", "1"],
  ])
    assert.equal(url.searchParams.get(key), value);
  assert.equal(url.hash, "");
  assert.equal(
    workspaceUrl(url.href, "corridor", { copy: null }),
    "/?run=example&recorded=1&lane=session&event=reading&trace=3000",
  );
});

test("workspace entry clears stale inspection state and launching a new run removes recorded markers", () => {
  assert.equal(
    workspaceUrl(
      "https://rove.example/?view=lab&copy=old&run=old&lane=session&trace=3000",
      "workspace",
    ),
    "/?view=workspace",
  );
  const next = new URL(
    workspaceUrl(
      "https://rove.example/?view=lab&run=old&recorded=1&lane=session&event=reading&trace=3000",
      "corridor",
      { run: "new", copy: null },
    ),
    "https://rove.example",
  );
  assert.equal(next.searchParams.get("run"), "new");
  for (const key of ["view", "recorded", "lane", "event", "trace", "copy"])
    assert.equal(next.searchParams.has(key), false);
});

test("invite redemption resumes the intended scenario or private run and never forwards a fragment", () => {
  assert.equal(
    inviteDestination("https://rove.example/#invite=secret"),
    "/?view=workspace",
  );
  assert.equal(
    inviteDestination(
      "https://rove.example/?view=lab&copy=example&run=example#invite=secret",
    ),
    "/?view=lab&copy=example&run=example",
  );
  assert.equal(
    inviteDestination(
      "https://rove.example/?run=private&lane=session&event=reading&trace=3000#invite=secret",
    ),
    "/?run=private&lane=session&event=reading&trace=3000",
  );
});

test("unsupported views and invalid identifiers cannot become a workspace selection", () => {
  const selected = readLabNavigation(
    new URLSearchParams(
      "view=unknown&run=%3Cscript%3E&copy=&scenario=valid-scenario",
    ),
  );
  assert.equal(selected.view, "corridor");
  assert.equal(selected.runId, null);
  assert.equal(selected.copyId, null);
  assert.equal(selected.scenarioId, "valid-scenario");
});
