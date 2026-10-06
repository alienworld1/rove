"use client";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { controlCompletion, readCompletion } from "./api";
import {
  executeCompletionAction,
  type CompletionAction,
} from "./completion-actions";
import type { CompletionIntent } from "./completion-intent";

export function useCompletionCommands() {
  const intents = useRef(new Map<string, CompletionIntent>());
  const client = useQueryClient();
  return async (laneId: string, action: CompletionAction) => {
    try {
      return await executeCompletionAction(
        { read: readCompletion, control: controlCompletion },
        intents.current,
        laneId,
        action,
      );
    } finally {
      await Promise.all(
        ["completion", "corridor", "run"].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    }
  };
}
