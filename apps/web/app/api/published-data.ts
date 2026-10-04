import { createClient } from "@supabase/supabase-js";
import {
  labRunViewSchema,
  corridorOperatingViewSchema,
  completionSummarySchema,
  causalInspectorTraceSchema,
  publishedRunSchema,
} from "@rove/contracts";

function publicDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key) return null;
  if (
    !url ||
    !key ||
    !key.startsWith("sb_publishable_") ||
    new URL(url).protocol !== "https:"
  )
    throw new Error(
      "Configure a Supabase URL and publishable key for public run analysis.",
    );
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 60 },
        }),
    },
  });
}
export async function publishedDataResponse(
  path: string,
  query = new URLSearchParams(),
): Promise<Response | null> {
  const database = publicDatabase();
  if (!database) return null;
  if (path === "/api/published-runs") {
    const { data, error } = await database
      .from("published_runs")
      .select("run_id,title,description,payment,published_at")
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Published records are unavailable.");
    return Response.json(
      publishedRunSchema.array().parse(
        (data ?? []).map((row) => ({
          id: row.run_id,
          title: row.title,
          description: row.description,
          payment: row.payment,
          publishedAt: row.published_at,
        })),
      ),
      {
        headers: {
          "cache-control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  }
  const run = /^\/api\/lab\/runs\/([^/]+)$/.exec(path);
  const resource =
    /^\/api\/(corridors|lanes)\/([^/]+)(?:\/(inspector|completion|accounting))?$/.exec(
      path,
    );
  if (!run && !resource) return null;
  let selection = database.from("published_runs").select("snapshot");
  if (run) selection = selection.eq("run_id", run[1]);
  else if (resource![1] === "corridors")
    selection = selection.eq("snapshot->corridor->corridor->>id", resource![2]);
  else
    selection = selection
      .filter("snapshot->completions", "not.is", null)
      .filter(
        "snapshot->completions",
        "cs",
        JSON.stringify({ [resource![2]]: {} }),
      );
  const { data, error } = await selection.limit(1).maybeSingle();
  if (error) throw new Error("Published records are unavailable.");
  if (!data) return null;
  const snapshot = data.snapshot;
  if (
    (resource?.[1] === "corridors" &&
      query.has("trace") &&
      !snapshot.traces[query.get("trace")!]) ||
    (resource?.[3] === "inspector" &&
      !snapshot.inspectors[`${resource[2]}:${query.get("event")}`])
  )
    return Response.json(
      { message: "That recorded selection is unavailable." },
      { status: 404 },
    );
  let value: unknown;
  if (run) value = labRunViewSchema.parse(snapshot.run);
  else if (resource![1] === "corridors")
    value = corridorOperatingViewSchema.parse(
      query.has("trace")
        ? snapshot.traces[query.get("trace")!]
        : snapshot.corridor,
    );
  else if (resource![3] === "completion")
    value = completionSummarySchema.parse(snapshot.completions[resource![2]]);
  else if (resource![3] === "inspector")
    value = causalInspectorTraceSchema.parse(
      snapshot.inspectors[`${resource![2]}:${query.get("event")}`],
    );
  else if (resource![3] === "accounting")
    value = snapshot.accounting[resource![2]];
  else
    value = snapshot.corridor.lanes.find(
      (lane: { projection: { id: string } }) =>
        lane.projection.id === resource![2],
    )?.projection;
  if (!value)
    return Response.json(
      { message: "That recorded selection is unavailable." },
      { status: 404 },
    );
  return Response.json(value, {
    headers: {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
