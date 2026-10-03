"use client";

import { useEffect, useState } from "react";
import { useCorridorSelection } from "./corridor-selection";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  const override = useCorridorSelection((state) => state.reduceMotion);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced || override;
}
