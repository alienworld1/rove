"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimePresentationEventSchema } from "@rove/contracts";
import { acceptRealtimeEvent, type RealtimeCursor } from "./realtime-state";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "stale";

export function useCorridorStream(
  corridorId: string | null,
  runId: string | null,
  projectionVersion: number,
) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [restored, setRestored] = useState(false);
  const failures = useRef(0);
  const cursorCorridorId = useRef<string | null>(null);
  const cursor = useRef<RealtimeCursor>({
    projectionVersion,
    announcedEventIds: new Set(),
  });
  useEffect(() => {
    if (cursorCorridorId.current === corridorId) return;
    cursorCorridorId.current = corridorId;
    cursor.current = {
      projectionVersion,
      announcedEventIds: new Set(),
    };
    failures.current = 0;
  }, [corridorId, projectionVersion]);
  useEffect(() => {
    cursor.current = {
      ...cursor.current,
      projectionVersion: Math.max(
        cursor.current.projectionVersion,
        projectionVersion,
      ),
    };
  }, [projectionVersion]);
  useEffect(() => {
    if (!corridorId) return;
    const query = new URLSearchParams({
      corridor: corridorId,
      cursor: String(cursor.current.projectionVersion),
    });
    if (runId) query.set("run", runId);
    const source = new EventSource(`/api/events/stream?${query}`);
    const eventTypes = [
      "corridor_projection_changed",
      "lane_projection_changed",
      "lab_run_changed",
      "resync_required",
    ] as const;
    const onEvent = (message: MessageEvent<string>) => {
      let value: unknown;
      try {
        value = JSON.parse(message.data) as unknown;
      } catch {
        return;
      }
      const parsed = realtimePresentationEventSchema.safeParse(value);
      if (!parsed.success) return;
      const accepted = acceptRealtimeEvent(cursor.current, parsed.data);
      if (!accepted.accepted) return;
      cursor.current = accepted.state;
      if (accepted.resync) setConnection("connecting");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["corridor", corridorId] }),
        queryClient.invalidateQueries({ queryKey: ["inspector"] }),
        ...(runId
          ? [queryClient.invalidateQueries({ queryKey: ["run", runId] })]
          : []),
      ]).then(() => {
        if (accepted.resync) setConnection("live");
      });
    };
    for (const type of eventTypes) source.addEventListener(type, onEvent);
    source.onopen = () => {
      setRestored(failures.current > 0);
      failures.current = 0;
      setConnection("live");
      void queryClient.invalidateQueries({
        queryKey: ["corridor", corridorId],
      });
      if (runId)
        void queryClient.invalidateQueries({ queryKey: ["run", runId] });
    };
    source.onerror = () => {
      failures.current += 1;
      setConnection(failures.current >= 3 ? "stale" : "reconnecting");
    };
    return () => {
      for (const type of eventTypes) source.removeEventListener(type, onEvent);
      source.close();
    };
  }, [corridorId, queryClient, runId]);
  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [restored]);
  return { connection, restored };
}
