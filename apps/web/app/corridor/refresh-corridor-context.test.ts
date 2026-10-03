import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshCorridorContext } from "./refresh-corridor-context.ts";

test("reconnect retains the same rejected Inspector through outage and rechecks it without commands", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let available = true;
  let reads = 0;
  const trace = {
    laneId: "lane-c",
    eventId: "rejected",
    reasonCode: "EVIDENCE_SIGNATURE_INVALID",
  };
  const observers = [
    new QueryObserver(client, {
      queryKey: ["corridor", "corridor"],
      initialData: { projectionVersion: 4 },
      queryFn: async () => {
        if (!available) throw new Error("Unavailable");
        return { projectionVersion: 5 };
      },
    }),
    new QueryObserver(client, {
      queryKey: ["run", "run"],
      initialData: { id: "run" },
      queryFn: async () => {
        if (!available) throw new Error("Unavailable");
        return { id: "run" };
      },
    }),
    new QueryObserver(client, {
      queryKey: ["inspector", "lane-c", "rejected"],
      initialData: trace,
      queryFn: async () => {
        reads++;
        if (!available) throw new Error("Unavailable");
        return trace;
      },
    }),
  ];
  const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
  try {
    available = false;
    assert.equal(await refreshCorridorContext(client, "corridor", "run"), null);
    assert.deepEqual(
      client.getQueryData(["inspector", "lane-c", "rejected"]),
      trace,
    );
    available = true;
    assert.equal(await refreshCorridorContext(client, "corridor", "run"), 5);
    assert.deepEqual(
      client.getQueryData(["inspector", "lane-c", "rejected"]),
      trace,
    );
    assert.ok(reads >= 2);
    assert.equal(client.getMutationCache().getAll().length, 0);
  } finally {
    unsubscribe.forEach((stop) => stop());
    client.clear();
  }
});
