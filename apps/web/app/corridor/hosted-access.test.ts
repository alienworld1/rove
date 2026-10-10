import assert from "node:assert/strict";
import { test } from "node:test";
import { POST, GET } from "../api/access/[action]/route.ts";
import { GET as published } from "../api/published-runs/route.ts";
import { publishedDataResponse } from "../api/published-data.ts";
import { readFile } from "node:fs/promises";

test("hosted production redemption uses an opaque secure cookie and never returns the engine credential", async (context) => {
  const previous = { ...process.env };
  const env: Record<string, string | undefined> = process.env;
  Object.assign(env, {
    NODE_ENV: "production",
    ACCESS_MODE: "hosted",
    APP_ORIGIN: "https://rove.example",
    ENGINE_ORIGIN: "https://engine.example",
    ENGINE_SERVICE_TOKEN: "a".repeat(64),
  });
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  const token = "b".repeat(43);
  let forwarded = 0;
  context.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      forwarded++;
      assert.equal(
        (init?.headers as Record<string, string>).authorization,
        `Bearer ${"a".repeat(64)}`,
      );
      assert.equal(
        (init?.headers as Record<string, string>)["x-rove-session"],
        undefined,
      );
      return Response.json({
        token,
        session: {
          authenticated: true,
          expiresAt: "2026-10-05T00:00:00.000Z",
          canRun: true,
          remainingRuns: 1,
          runs: [],
        },
      });
    },
  );
  try {
    const options = { params: Promise.resolve({ action: "invite" }) };
    for (const origin of ["https://evil.example", "null", ""]) {
      assert.equal(
        (
          await POST(
            new Request("https://rove.example/api/access/invite", {
              method: "POST",
              headers: { origin },
              body: JSON.stringify({ code: "c".repeat(43) }),
            }),
            options,
          )
        ).status,
        403,
      );
    }
    assert.equal(forwarded, 0);
    const response = await POST(
      new Request("https://rove.example/api/access/invite", {
        method: "POST",
        headers: { origin: "https://rove.example" },
        body: JSON.stringify({ code: "c".repeat(43) }),
      }),
      options,
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("set-cookie")!,
      /^__Host-rove_session=b+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=86400; Secure$/,
    );
    const body = await response.text();
    assert.ok(!body.includes(token));
    assert.ok(!body.includes("a".repeat(64)));
    const anonymous = await GET(
      new Request("https://rove.example/api/access/session"),
      { params: Promise.resolve({ action: "session" }) },
    );
    assert.equal((await anonymous.json()).authenticated, false);
    assert.equal(forwarded, 1);
  } finally {
    for (const key of Object.keys(env)) if (!(key in previous)) delete env[key];
    Object.assign(env, previous);
  }
});

test("public published listing uses Supabase publishable access without waking the engine", async (context) => {
  const previous = { ...process.env };
  const env: Record<string, string | undefined> = process.env;
  Object.assign(env, {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  });
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(
        String(url).startsWith(
          "https://project.supabase.co/rest/v1/published_runs",
        ),
      );
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("apikey"), "sb_publishable_example");
      return Response.json([
        {
          run_id: "published",
          title: "Northstar ↔ Voltway",
          description: "Recorded protection",
          payment: "Tempo",
          published_at: "2026-10-04T05:30:00+05:30",
        },
      ]);
    },
  );
  try {
    const response = await published(
      new Request("https://rove.example/api/published-runs"),
    );
    assert.equal(response.status, 200);
    const records = await response.json();
    assert.equal(records[0].id, "published");
    assert.equal(records[0].publishedAt, "2026-10-04T00:00:00.000Z");
  } finally {
    for (const key of Object.keys(env)) if (!(key in previous)) delete env[key];
    Object.assign(env, previous);
  }
});

test("Supabase public detail preserves real snapshots and returns unavailable selections as 404", async (context) => {
  const previous = { ...process.env };
  const env: Record<string, string | undefined> = process.env;
  Object.assign(env, {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  });
  const snapshot = JSON.parse(
    await readFile(
      new URL(
        "../../../../deployment/published-runs/tempo-three-lane.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request) => {
      assert.ok(
        String(url).startsWith(
          "https://project.supabase.co/rest/v1/published_runs",
        ),
      );
      return Response.json([{ snapshot }]);
    },
  );
  try {
    const path = `/api/corridors/${snapshot.corridor.corridor.id}`;
    const recorded = await publishedDataResponse(
      path,
      new URLSearchParams({ trace: "3000" }),
    );
    assert.equal(recorded?.status, 200);
    assert.equal(
      (await recorded!.json()).lanes[2].projection.state,
      "PAUSE_REQUIRED",
    );
    assert.equal(
      (
        await publishedDataResponse(
          path,
          new URLSearchParams({ trace: "3001" }),
        )
      )?.status,
      404,
    );
    const lane = snapshot.corridor.lanes[2].projection.id;
    assert.equal(
      (
        await publishedDataResponse(
          `/api/lanes/${lane}/inspector`,
          new URLSearchParams({ event: "unknown" }),
        )
      )?.status,
      404,
    );
    const completion = await publishedDataResponse(
      `/api/lanes/${lane}/completion`,
    );
    assert.equal(
      (await completion!.json()).completion.closure.confirmedRefund,
      "458",
    );
  } finally {
    for (const key of Object.keys(env)) if (!(key in previous)) delete env[key];
    Object.assign(env, previous);
  }
});
