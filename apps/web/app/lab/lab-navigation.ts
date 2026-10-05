"use client";
import { useSearchParams } from "next/navigation";
import {
  readLabNavigation,
  workspaceUrl,
  type WorkspaceView,
} from "./navigation-url";
export function navigateLab(
  view: WorkspaceView,
  values: Record<string, string | null> = {},
) {
  window.history.pushState(
    null,
    "",
    workspaceUrl(window.location.href, view, values),
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useLabNavigation() {
  return readLabNavigation(new URLSearchParams(useSearchParams().toString()));
}
