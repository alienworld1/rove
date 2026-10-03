"use client";

import { useEffect } from "react";
import { animated, useSpring } from "@react-spring/web";
import {
  eventLabelFor,
  reasonTextFor,
  type LaneTraceEvent,
} from "@rove/contracts";
import { motionPresets } from "./motion-presets";

export function CommittedEventMark({
  event,
  x,
  selected,
  focused,
  anomalous,
  muted,
  animate,
  reducedMotion,
  onSelect,
  setAnchor,
}: {
  event: LaneTraceEvent;
  x: number;
  selected: boolean;
  focused: boolean;
  anomalous: boolean;
  muted: boolean;
  animate: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  setAnchor: (element: SVGElement | null) => void;
}) {
  const evidence =
    event.eventType.startsWith("meter.") &&
    ["accepted", "rejected"].includes(event.outcome);
  const [spring, api] = useSpring(() => ({
    x: animate && evidence && !reducedMotion ? 10 : x,
    opacity: animate && evidence ? 0.4 : 1,
  }));
  useEffect(() => {
    if (!animate || !evidence) {
      api.set({ x, opacity: 1 });
      return;
    }
    void api.start({
      config: motionPresets.direct,
      to: async (next) => {
        await next({
          x: reducedMotion ? x : 45,
          opacity: 0.7,
          immediate: reducedMotion,
          config: { duration: 160 },
        });
        await next({
          x,
          opacity: 1,
          delay: 80,
          immediate: reducedMotion,
          config: { duration: 120 },
        });
      },
    });
    return () => {
      api.stop();
    };
  }, [animate, api, evidence, reducedMotion, x]);
  return (
    <animated.g
      transform={spring.x.to((value) => `translate(${value},0)`)}
      ref={selected ? setAnchor : undefined}
      role="button"
      tabIndex={0}
      data-event-id={event.eventId}
      aria-label={`${eventLabelFor(event.eventType)}. ${event.reasonCode ? reasonTextFor(event.reasonCode) : "Open event details."}`}
      onClick={(click) => {
        click.stopPropagation();
        click.currentTarget.focus();
        onSelect();
      }}
      onKeyDown={(key) => {
        if (key.key === "Enter" || key.key === " ") {
          key.preventDefault();
          onSelect();
        }
      }}
      opacity={muted ? 0.28 : spring.opacity}
      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-info"
    >
      <rect
        x="-4"
        y={focused ? 7 : anomalous ? -25 : -50}
        width="8"
        height={focused ? 46 : anomalous ? 110 : 158}
        fill="transparent"
      />
      <ellipse
        cx="0"
        cy="30"
        rx={selected ? "0.75" : "0.55"}
        ry={
          focused
            ? selected
              ? "5.2"
              : "3.8"
            : anomalous
              ? selected
                ? "14"
                : "10"
              : selected
                ? "18"
                : "13"
        }
        fill={
          event.outcome === "rejected" || event.outcome === "failed"
            ? "var(--color-critical)"
            : event.eventType.startsWith("payment.")
              ? "var(--color-info)"
              : "var(--color-protected)"
        }
        stroke={
          selected ? "var(--color-line-authoritative)" : "var(--color-pure)"
        }
        strokeWidth={selected ? "1.5" : "1"}
        vectorEffect="non-scaling-stroke"
      />
      {event.outcome === "rejected" ? (
        <line
          x1="-2"
          y1="28"
          x2="2"
          y2="32"
          stroke="var(--color-pure)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </animated.g>
  );
}
