"use client";

import { animated, to, useSpring } from "@react-spring/web";
import { useReducedMotion } from "../corridor/use-reduced-motion";
import { motionPresets } from "../corridor/motion-presets";
import type { ProtectionChapter } from "./protection-chapters";

export function ProtectionDiagram({
  chapter,
  index,
}: {
  chapter: ProtectionChapter;
  index: number;
}) {
  const reduced = useReducedMotion();
  const physical = useSpring({
    value: chapter.service,
    immediate: reduced,
    delay: !reduced && index === 2 ? 550 : 0,
    config: { duration: 650 },
  });
  const protection = useSpring({
    value: chapter.protected,
    immediate: reduced,
    config: index === 4 ? motionPresets.recover : motionPresets.interlock,
    delay: reduced ? 0 : 600,
  });
  const evidence = useSpring({
    from: { x: 5 },
    x: chapter.evidence === "accepted" ? 160 : 95,
    reset: index !== 3,
    immediate: reduced,
    config: motionPresets.propagate,
  });
  return (
    <figure
      className="min-w-0 border border-line bg-raised p-5 sm:p-8"
      aria-label={`Charging session illustration: ${chapter.caption}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4 text-xs">
        <span className="font-semibold uppercase tracking-widest">
          One charging session
        </span>
        <span className="text-ink-secondary">
          Illustration · not live activity
        </span>
      </div>
      <div className="mt-7 flex justify-between gap-4 text-xs text-ink-secondary">
        <span>
          Charging operator
          <br />
          <strong className="font-semibold text-ink">
            Supplies electricity
          </strong>
        </span>
        <span className="text-right">
          Mobility provider
          <br />
          <strong className="font-semibold text-ink">Funds payment</strong>
        </span>
      </div>
      <div aria-hidden="true" className="relative mt-8 pb-8 pt-7">
        <p className="mb-3 text-xs text-ink-secondary">Service value →</p>
        <div className="relative h-16 border-y border-line bg-pure">
          <animated.div
            className="absolute inset-y-0 left-0 bg-risk-soft"
            style={{ width: physical.value.to((value) => `${value}%`) }}
          />
          <animated.div
            className="absolute inset-y-0 left-0 border-r-2 border-protected bg-protected-soft"
            style={{
              width: to(
                [protection.value, physical.value],
                (protectedValue, serviceValue) =>
                  `${Math.min(protectedValue, serviceValue)}%`,
              ),
            }}
          />
          <animated.div
            className="absolute -top-2 -bottom-2 w-0.5 bg-line-authoritative"
            style={{ left: physical.value.to((value) => `${value}%`) }}
          />
          <div
            className={`absolute -top-5 -bottom-5 left-[90%] border-l-2 ${index === 3 ? "border-critical" : "border-line-strong border-dashed"}`}
          />
        </div>
        <div className="mt-6 flex justify-between gap-3 text-xs">
          <span className="font-semibold text-protected-deep">
            {index === 0 ? "No payment secured" : "Payment secured"}
          </span>
          <span
            className={
              index === 3 ? "font-semibold text-critical" : "text-ink-secondary"
            }
          >
            {index === 3
              ? "Pause required"
              : index === 4
                ? "Charging may resume"
                : "Exposure boundary"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5 text-xs">
        <span className="text-ink-secondary">Meter reading</span>
        <svg viewBox="0 0 190 32" className="h-8 w-44" aria-hidden="true">
          <path d="M5 16H180" fill="none" className="stroke-line" />
          <path
            d="M108 3V29"
            className="stroke-line-authoritative"
            strokeWidth="2"
          />
          {chapter.evidence !== "none" ? (
            <animated.rect
              x={evidence.x}
              y="11"
              width="10"
              height="10"
              className={
                chapter.evidence === "accepted"
                  ? "fill-protected"
                  : "fill-critical"
              }
            />
          ) : null}
        </svg>
        <span
          className={
            chapter.evidence === "accepted"
              ? "text-protected-deep"
              : chapter.evidence === "rejected"
                ? "text-critical"
                : "text-ink-secondary"
          }
        >
          {chapter.evidence === "accepted"
            ? "Verified → approval"
            : chapter.evidence === "rejected"
              ? "Rejected at verification"
              : "No live protection"}
        </span>
      </div>
      <figcaption className="mt-5 text-sm leading-relaxed text-ink-secondary">
        {chapter.caption}
      </figcaption>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-secondary">
        <span>
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-2 w-2 bg-protected"
          />
          Secured value
        </span>
        <span>
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-2 w-2 bg-risk"
          />
          Value potentially at risk
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
        Distance represents value, not time or physical distance. During an
        uncertain reading, the service mark shows an upper bound.
      </p>
    </figure>
  );
}
