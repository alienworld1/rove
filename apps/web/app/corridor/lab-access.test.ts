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

test("Lab scenario uploads are bounded before forwarding", async (context) => {
  const env: Record<string, string | undefined> = process.env;
  const previous = {
    mode: env.NODE_ENV,
    access: env.ACCESS_MODE,
    token: env.DEMO_SESSION_TOKEN,
  };
  env.NODE_ENV = "development";
  env.ACCESS_MODE = "local";
  env.DEMO_SESSION_TOKEN = "a".repeat(48);
  let forwards = 0;
  context.mock.method(globalThis, "fetch", async () => {
    forwards++;
    return Response.json({});
  });
  try {
    const response = await POST(
      new Request("http://localhost:3000/api/lab/scenarios", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: `rove_demo=${env.DEMO_SESSION_TOKEN}`,
        },
        body: "x".repeat(70001),
      }),
      { params: Promise.resolve({ path: ["scenarios"] }) },
    );
    assert.equal(response.status, 413);
    assert.equal(forwards, 0);
  } finally {
    for (const [key, value] of [
      ["NODE_ENV", previous.mode],
      ["ACCESS_MODE", previous.access],
      ["DEMO_SESSION_TOKEN", previous.token],
    ] as const) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});
