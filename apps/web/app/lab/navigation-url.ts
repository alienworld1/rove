import { idSchema } from "@rove/contracts";

export type WorkspaceView = "corridor" | "lab" | "workspace";

export function readLabNavigation(params: URLSearchParams) {
  const id = (key: string) => {
    const value = params.get(key);
    return value && idSchema.safeParse(value).success ? value : null;
  };
  const view = params.get("view");
  return {
    view: (view === "lab" || view === "workspace"
      ? view
      : "corridor") as WorkspaceView,
    runId: id("run"),
    copyId: id("copy"),
    scenarioId: id("scenario"),
    corridorId: id("corridor"),
    recorded: params.get("recorded") === "1",
  };
}

export function workspaceUrl(
  input: string,
  view: WorkspaceView,
  values: Record<string, string | null> = {},
) {
  const url = new URL(input);
  url.hash = "";
  if (view === "workspace") url.search = "";
  if (view === "corridor") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (values.run && values.run !== url.searchParams.get("run")) {
    for (const key of ["recorded", "lane", "event", "trace", "corridor"])
      url.searchParams.delete(key);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function inviteDestination(input: string) {
  const url = new URL(input);
  const navigation = readLabNavigation(url.searchParams);
  if (
    navigation.view === "lab" ||
    navigation.view === "workspace" ||
    navigation.runId
  )
    return `${url.pathname}${url.search}`;
  return "/?view=workspace";
}
