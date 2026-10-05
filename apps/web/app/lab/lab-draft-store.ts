"use client";
import { create } from "zustand";
import type { LabScenario } from "@rove/contracts";
type DraftState = {
  draft: LabScenario | null;
  savedDigest: string | null;
  pending: Record<string, string>;
  source: string | null;
  revision: number;
  setDraft: (draft: LabScenario, source?: string) => void;
  change: (draft: LabScenario) => void;
  field: (path: string, value: string | null) => void;
  saved: (digest: string, revision: number) => void;
  clear: () => void;
};
export const useLabDraft = create<DraftState>((set) => ({
  draft: null,
  savedDigest: null,
  pending: {},
  source: null,
  revision: 0,
  setDraft: (draft, source) =>
    set((state) => ({
      draft,
      source: source ?? null,
      savedDigest: null,
      pending: {},
      revision: state.revision + 1,
    })),
  change: (draft) =>
    set((state) => ({
      draft,
      savedDigest: null,
      revision: state.revision + 1,
      pending: Object.fromEntries(
        Object.entries(state.pending).filter(([path]) => {
          if (path.startsWith("lanes."))
            return draft.lanes.some((lane) =>
              path.startsWith(`lanes.${lane.key}.`),
            );
          if (path.startsWith("events."))
            return draft.events.some((event) =>
              path.startsWith(`events.${event.id}.`),
            );
          if (path.startsWith("accountingByLane."))
            return draft.lanes.some((lane) =>
              path.startsWith(`accountingByLane.${lane.key}.`),
            );
          return true;
        }),
      ),
    })),
  field: (path, value) =>
    set((state) => {
      const pending = { ...state.pending };
      if (value === null) delete pending[path];
      else pending[path] = value;
      return { pending, savedDigest: null };
    }),
  saved: (savedDigest, revision) =>
    set((state) =>
      state.revision === revision && !Object.keys(state.pending).length
        ? { savedDigest }
        : {},
    ),
  clear: () => {
    try {
      sessionStorage.removeItem("rove-lab-start");
    } catch {}
    set({ draft: null, pending: {}, savedDigest: null, source: null });
  },
}));
