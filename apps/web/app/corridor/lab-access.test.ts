import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../api/lab/[...path]/route.ts";

test("Lab mutations require authenticated same-origin requests before forwarding", async (context) => {
  const environment: Record<string, string | undefined> = process.env;
  const previousMode = environment.NODE_ENV;
  const previousToken = process.env.DEMO_SESSION_TOKEN;
  const token = "a".repeat(48);
  environment.NODE_ENV = "development";
  process.env.DEMO_SESSION_TOKEN = token;
  let forwarded = 0;
  context.mock.method(globalThis, "fetch", async () => {
    forwarded++;
    return Response.json({ accepted: true });
  });
  try {
    for (const origin of ["http://untrusted.invalid", "null", null]) {
      const request = new Request("http://localhost:3000/api/lab/runs", {
        method: "POST",
        headers: {
          cookie: `rove_demo=${token}`,
          "content-type": "application/json",
          ...(origin === null ? {} : { origin }),
        },
        body: JSON.stringify({
          scenarioId: "northstar-voltway",
          scenarioDigest: "saved-digest",
        }),
      });
      assert.equal(
        (await POST(request, { params: Promise.resolve({ path: ["runs"] }) }))
          .status,
        403,
      );
    }
    assert.equal(forwarded, 0);
    const request = new Request("http://localhost:3000/api/lab/runs", {
      method: "POST",
      headers: {
        cookie: `rove_demo=${token}`,
        origin: "http://localhost:3000",
      },
      body: "{}",
    });
    assert.equal(
      (await POST(request, { params: Promise.resolve({ path: ["runs"] }) }))
        .status,
      200,
    );
    assert.equal(forwarded, 1);
  } finally {
    if (previousMode === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousMode;
    if (previousToken === undefined) delete process.env.DEMO_SESSION_TOKEN;
    else process.env.DEMO_SESSION_TOKEN = previousToken;
  }
});
