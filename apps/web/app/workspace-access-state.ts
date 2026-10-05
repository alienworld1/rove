"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useLabDraft } from "./lab/lab-draft-store";

export function clearPrivateWorkspace(client: QueryClient) {
  useLabDraft.getState().clear();
  for (const key of [
    "scenario",
    "scenarios",
    "run",
    "corridor",
    "corridor-trace",
    "inspector",
    "completion",
    "accounting-record",
  ])
    client.removeQueries({ queryKey: [key] });
}
