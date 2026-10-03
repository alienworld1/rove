import { create } from "zustand";

type CorridorSelection = {
  focusedLaneId: string | null;
  focusedEventId: string | null;
  traceOffsetMs: number | null;
  reduceMotion: boolean;
  setReduceMotion: (reduced: boolean) => void;
  setLane: (laneId: string | null) => void;
  setEvent: (laneId: string, eventId: string) => void;
  setTrace: (traceOffsetMs: number | null) => void;
  replace: (
    laneId: string | null,
    eventId: string | null,
    traceOffsetMs: number | null,
  ) => void;
};

export const useCorridorSelection = create<CorridorSelection>((set) => ({
  focusedLaneId: null,
  focusedEventId: null,
  traceOffsetMs: null,
  reduceMotion: false,
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setLane: (focusedLaneId) =>
    set({ focusedLaneId, focusedEventId: null, traceOffsetMs: null }),
  setEvent: (focusedLaneId, focusedEventId) =>
    set({ focusedLaneId, focusedEventId }),
  setTrace: (traceOffsetMs) => set({ traceOffsetMs }),
  replace: (focusedLaneId, focusedEventId, traceOffsetMs) =>
    set({ focusedLaneId, focusedEventId, traceOffsetMs }),
}));
