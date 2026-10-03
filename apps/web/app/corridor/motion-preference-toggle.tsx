"use client";

import { useCorridorSelection } from "./corridor-selection";

export function MotionPreferenceToggle() {
  const reduced = useCorridorSelection((state) => state.reduceMotion);
  const setReduced = useCorridorSelection((state) => state.setReduceMotion);
  return (
    <label className="flex items-center gap-2 text-xs text-ink-secondary">
      <input
        type="checkbox"
        checked={reduced}
        onChange={(event) => setReduced(event.target.checked)}
        className="accent-info focus-visible:outline-2 focus-visible:outline-info"
      />
      Reduce motion
    </label>
  );
}
