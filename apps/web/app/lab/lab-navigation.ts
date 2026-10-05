"use client";
import { useEffect, useState } from "react";
export function navigateLab(
  view: "lab" | "corridor",
  values: Record<string, string | null> = {},
) {
  const url = new URL(window.location.href);
  if (view === "lab") url.searchParams.set("view", "lab");
  else url.searchParams.delete("view");
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useLabNavigation() {
  const [selection, setSelection] = useState({
    view: "corridor",
    runId: null as string | null,
    copyId: null as string | null,
  });
  useEffect(() => {
    const sync = () => {
      const params = new URL(window.location.href).searchParams;
      setSelection({
        view: params.get("view") === "lab" ? "lab" : "corridor",
        runId: params.get("run"),
        copyId: params.get("copy"),
      });
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return selection;
}
