import assert from "node:assert/strict";
import { test } from "node:test";
import { CorridorApiError } from "./api.ts";
import { createProtectedQueryClient } from "./protected-query-client.ts";

test("access loss clears every protected read and aborts in-flight inspection", async () => {
  let denied = 0;
  let aborted = false;
  const client = createProtectedQueryClient(() => denied++);
  client.setQueryData(["corridor", "saved"], { private: true });
  client.setQueryData(["completion", "lane"], { private: true });
  const inspection = client
    .fetchQuery({
      queryKey: ["inspector", "lane", "event"],
      queryFn: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("cancelled"));
          });
        }),
    })
    .catch(() => undefined);
  let attempts = 0;
  await assert.rejects(
    client.fetchQuery({
      queryKey: ["run", "saved"],
      queryFn: async () => {
        attempts++;
        throw new CorridorApiError("Access denied", 403);
      },
    }),
  );
  await inspection;
  assert.equal(denied, 1);
  assert.equal(attempts, 1);
  assert.equal(aborted, true);
  assert.equal(client.getQueryCache().getAll().length, 0);
  client.setQueryData(["run", "late-command-result"], { private: true });
  assert.equal(client.getQueryCache().getAll().length, 0);
});

test("an unavailable read retains last-known context without revoking access", async () => {
  let denied = false;
  const client = createProtectedQueryClient(() => {
    denied = true;
  });
  client.setQueryData(["corridor", "saved"], { version: 3 });
  await assert.rejects(
    client.fetchQuery({
      queryKey: ["corridor", "saved"],
      queryFn: async () => {
        throw new CorridorApiError("Unavailable", 503);
      },
      staleTime: 0,
      retry: false,
    }),
  );
  assert.equal(denied, false);
  assert.deepEqual(client.getQueryData(["corridor", "saved"]), { version: 3 });
  assert.equal(client.getQueryState(["corridor", "saved"])?.status, "error");
  client.clear();
});
