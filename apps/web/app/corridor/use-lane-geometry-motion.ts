"use client";

import { useEffect, useRef } from "react";
import { useSpring } from "@react-spring/web";
import type { CorridorOperatingView } from "@rove/contracts";
import { motionPresets } from "./motion-presets";
import { causalMotionPlan } from "./causal-motion-plan";

export function useLaneGeometryMotion(
  lane: CorridorOperatingView["lanes"][number],
  geometry: {
    frontier: number;
    physical: number;
    riskStart: number;
    riskWidth: number;
    protectionLimit: number;
  },
  reducedMotion: boolean,
  inspecting: boolean,
) {
  const previous = useRef({
    version: lane.projection.version,
    state: lane.projection.state,
    eventIds: new Set(lane.trace.map((event) => event.eventId)),
  });
  const evidenceReadyAt = useRef(0);
  const recoveryInProgress = useRef(false);
  const [spring, api] = useSpring(() => ({
    frontier: geometry.frontier * 100,
    physical: geometry.physical * 100,
    riskStart: geometry.riskStart * 100,
    riskWidth: geometry.riskWidth * 100,
    protectionLimit: geometry.protectionLimit * 100,
  }));
  const { frontier, physical, riskStart, riskWidth, protectionLimit } =
    geometry;
  useEffect(() => {
    const accepted = lane.trace.some(
      (event) =>
        !previous.current.eventIds.has(event.eventId) &&
        event.eventType === "meter.evidence_accepted",
    );
    const recovered =
      previous.current.state === "PAUSE_REQUIRED" ||
      previous.current.state === "RECOVERING";
    const pause = lane.projection.state === "PAUSE_REQUIRED";
    if (recovered && accepted) recoveryInProgress.current = true;
    const plan = causalMotionPlan({
      now: performance.now(),
      evidenceReadyAt: evidenceReadyAt.current,
      acceptedEvidence: accepted,
      recovering: recoveryInProgress.current,
      paused: pause,
      inspecting,
    });
    evidenceReadyAt.current = plan.evidenceReadyAt;
    previous.current = {
      version: lane.projection.version,
      state: lane.projection.state,
      eventIds: new Set(lane.trace.map((event) => event.eventId)),
    };
    api.stop();
    void api.start({
      frontier: frontier * 100,
      physical: physical * 100,
      riskStart: riskStart * 100,
      riskWidth: riskWidth * 100,
      protectionLimit: protectionLimit * 100,
      config: pause
        ? motionPresets.interlock
        : recovered
          ? motionPresets.recover
          : motionPresets.structural,
      immediate: reducedMotion || pause || inspecting,
      delay: (key) =>
        key === "frontier"
          ? plan.frontierDelay
          : key === "physical"
            ? plan.physicalDelay
            : key === "protectionLimit"
              ? plan.boundaryDelay
              : plan.riskDelay,
    });
    return () => {
      api.stop();
    };
  }, [
    api,
    frontier,
    physical,
    riskStart,
    riskWidth,
    protectionLimit,
    lane.projection.state,
    lane.projection.version,
    lane.trace,
    reducedMotion,
    inspecting,
  ]);
  return spring;
}
