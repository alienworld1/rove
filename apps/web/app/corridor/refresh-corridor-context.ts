import type { QueryClient } from "@tanstack/react-query";
import type { CorridorOperatingView } from "@rove/contracts";

export async function refreshCorridorContext(
  client: QueryClient,
  corridorId: string,
  runId: string | null,
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["corridor", corridorId] }),
    client.invalidateQueries({ queryKey: ["inspector"] }),
    ...(runId ? [client.invalidateQueries({ queryKey: ["run", runId] })] : []),
  ]);
  const read = client.getQueryState<CorridorOperatingView>([
    "corridor",
    corridorId,
  ]);
  const run = runId ? client.getQueryState(["run", runId]) : null;
  return read?.status === "success" && (!runId || run?.status === "success")
    ? (read.data?.projectionVersion ?? null)
    : null;
}
