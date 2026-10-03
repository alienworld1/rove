"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimePresentationEventSchema } from "@rove/contracts";
import { acceptRealtimeEvent, type RealtimeCursor } from "./realtime-state";
import { refreshCorridorContext } from "./refresh-corridor-context";

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
  const cursorScope = useRef<string | null>(null);
  const cursor = useRef<RealtimeCursor>({
    projectionVersion,
    announcedEventIds: new Set(),
  });
  useEffect(() => {
    const scope = `${corridorId}:${runId}`;
    if (cursorScope.current === scope) return;
    cursorScope.current = scope;
    cursor.current = {
      projectionVersion,
      announcedEventIds: new Set(),
    };
    failures.current = 0;
  }, [corridorId, runId, projectionVersion]);
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
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let disposed = false;
    const refresh = () =>
      refreshCorridorContext(queryClient, corridorId, runId);
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
      if (
        parsed.data.corridorId !== corridorId ||
        (parsed.data.runId && parsed.data.runId !== runId)
      )
        return;
      const accepted = acceptRealtimeEvent(cursor.current, parsed.data);
      if (!accepted.accepted) return;
      cursor.current = accepted.state;
      const activeSource = source;
      if (accepted.resync) setConnection("connecting");
      void refresh().then((checkedVersion) => {
        if (
          !accepted.resync ||
          disposed ||
          !source ||
          source !== activeSource ||
          document.hidden
        )
          return;
        if (checkedVersion !== null)
          cursor.current.projectionVersion = checkedVersion;
        setConnection(checkedVersion !== null ? "live" : "stale");
      });
    };
    const connect = () => {
      if (disposed || document.hidden) return;
      const query = new URLSearchParams({
        corridor: corridorId,
        cursor: String(cursor.current.projectionVersion),
      });
      if (runId) query.set("run", runId);
      const activeSource = new EventSource(`/api/events/stream?${query}`);
      source = activeSource;
      for (const type of eventTypes) source.addEventListener(type, onEvent);
      source.onopen = () => {
        const recovered = failures.current > 0;
        void refresh().then((checkedVersion) => {
          if (disposed || source !== activeSource || document.hidden) return;
          if (checkedVersion === null) {
            setConnection("stale");
            return;
          }
          setRestored(recovered);
          failures.current = 0;
          setConnection("live");
        });
      };
      source.onerror = () => {
        source?.close();
        source = null;
        failures.current += 1;
        setRestored(false);
        setConnection(failures.current >= 3 ? "stale" : "reconnecting");
        void refresh();
        const delay = Math.min(
          30_000,
          1_000 * 2 ** Math.min(failures.current - 1, 5),
        );
        retryTimer = window.setTimeout(
          connect,
          Math.min(30_000, delay * (0.8 + Math.random() * 0.4)),
        );
      };
    };
    const onVisibility = () => {
      window.clearTimeout(retryTimer);
      source?.close();
      source = null;
      setConnection("reconnecting");
      setRestored(false);
      if (!document.hidden) connect();
    };
    document.addEventListener("visibilitychange", onVisibility);
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      source?.close();
    };
  }, [corridorId, queryClient, runId]);
  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [restored]);
  return { connection, restored };
}
