"use client";

import { useState } from "react";
import { MotionPreferenceToggle } from "../corridor/motion-preference-toggle";
import { protectionChapters } from "./protection-chapters";
import { ProtectionDiagram } from "./protection-diagram";

export function ProtectionStory() {
  const [index, setIndex] = useState(0);
  const chapter = protectionChapters[index];
  return (
    <section
      id="how-it-works"
      aria-labelledby="story-title"
      className="scroll-mt-6 border-t border-line-strong py-14 sm:py-20"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-ink-secondary">
            01 / How Rove works
          </p>
          <h2
            id="story-title"
            className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Electricity moves.
            <br />
            Credit has a limit.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-ink-secondary">
          Follow one session from delivery to protection, through a rejected
          reading and back. You set the pace.
        </p>
      </div>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-secondary">
        Payment protection means verified charging value has funded payment
        approval. Collection can happen later. If trustworthy readings or
        funding stop, Rove limits how far service can continue ahead of that
        protection.
      </p>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-14">
        <div>
          <nav
            aria-label="Charging protection chapters"
            className="border-t border-line"
          >
            {protectionChapters.map((item, itemIndex) => (
              <button
                key={item.title}
                type="button"
                aria-pressed={index === itemIndex}
                aria-controls="chapter-explanation"
                onClick={() => setIndex(itemIndex)}
                className="group flex min-h-14 w-full items-center gap-4 border-b border-line px-3 py-4 text-left text-sm aria-pressed:bg-selection aria-pressed:font-semibold focus-visible:outline-2 focus-visible:outline-info"
              >
                <span className="font-mono text-xs text-ink-secondary">
                  0{itemIndex + 1}
                </span>
                <span className="flex-1">{item.title}</span>
                <span
                  aria-hidden="true"
                  className="text-ink-secondary group-aria-pressed:text-ink"
                >
                  →
                </span>
              </button>
            ))}
          </nav>
          <div
            id="chapter-explanation"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-7 min-h-48"
          >
            <h3 className="text-lg font-semibold">{chapter.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              {chapter.description}
            </p>
            <p className="mt-4 border-l-2 border-line-strong pl-4 text-xs leading-relaxed text-ink-secondary">
              {chapter.detail}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setIndex((index + 1) % protectionChapters.length)}
              className="min-h-11 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-info"
            >
              {index === 4 ? "Start again" : "Next chapter"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            <MotionPreferenceToggle />
          </div>
        </div>
        <ProtectionDiagram chapter={chapter} index={index} />
      </div>
    </section>
  );
}
