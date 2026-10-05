"use client";

import { useRef, useState, type CSSProperties, type Ref } from "react";
import dynamic from "next/dynamic";
import type { CausalInspectorTrace } from "@rove/contracts";
import { EvidenceInspector } from "./evidence-inspector";
import { PaymentInspector } from "./payment-inspector";

const RawDetailsDialog = dynamic(
  () =>
    import("./raw-details-dialog").then((module) => module.RawDetailsDialog),
  { ssr: false },
);

export function AttachedInspector({
  trace,
  loading,
  error,
  assetDecimals,
  assetUnit,
  floatingRef,
  floatingStyle,
  docked,
  onClose,
  onRetry,
  current,
}: {
  trace: CausalInspectorTrace | null;
  loading: boolean;
  error: string | null;
  assetDecimals: number;
  assetUnit: string;
  floatingRef: Ref<HTMLDivElement>;
  floatingStyle: CSSProperties;
  docked: boolean;
  onClose: () => void;
  onRetry: () => void;
  current: boolean;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const rawTrigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      ref={floatingRef}
      style={docked ? undefined : floatingStyle}
      role="region"
      aria-label="Selected event details"
      className={`z-30 rounded-md border border-line-strong bg-pure p-5 ${docked ? "relative mt-4 w-full max-w-3xl min-[1800px]:mt-0" : "w-[min(440px,calc(100vw-32px))] shadow-[var(--shadow-inspector)]"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !rawOpen) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="float-right ml-3 min-h-11 rounded-sm px-2 py-1 text-sm text-ink-secondary focus-visible:outline-2 focus-visible:outline-info"
      >
        Close
      </button>
      {!current && trace ? (
        <p role="status" className="mb-3 text-sm text-ink-secondary">
          Recorded event retained. Live updates are interrupted.
        </p>
      ) : null}
      {error && trace ? (
        <div role="status" className="mb-3 text-sm text-ink-secondary">
          <p>
            Event details could not be checked. Showing the last checked record.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 underline focus-visible:outline-2 focus-visible:outline-info"
          >
            Try again
          </button>
        </div>
      ) : null}
      {loading && !trace ? (
        <p className="min-h-36 text-sm text-ink-secondary">
          Loading event details…
        </p>
      ) : error && !trace ? (
        <div className="min-h-36">
          <p className="text-sm text-critical">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 min-h-11 rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            Try again
          </button>
        </div>
      ) : trace ? (
        <>
          {trace.eventType.startsWith("payment.") ? (
            <PaymentInspector
              trace={trace}
              assetDecimals={assetDecimals}
              assetUnit={assetUnit}
            />
          ) : (
            <EvidenceInspector
              trace={trace}
              assetDecimals={assetDecimals}
              assetUnit={assetUnit}
            />
          )}
          <ol
            className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3 text-[11px]"
            aria-label="Causal trace"
          >
            {trace.causalSteps.map((step) => (
              <li
                key={step.type}
                className={`border-l-2 pl-2 ${step.status === "rejected" ? "border-critical text-critical" : step.status === "pending" ? "border-risk text-risk-deep" : "border-line-strong text-ink-secondary"}`}
              >
                {step.label}
                <span className="block text-ink-tertiary">
                  {step.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ol>
          <button
            ref={rawTrigger}
            type="button"
            onClick={() => setRawOpen(true)}
            className="mt-4 min-h-11 rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            View raw details
          </button>
          {rawOpen ? (
            <RawDetailsDialog
              trace={trace}
              open={rawOpen}
              onOpenChange={setRawOpen}
              onRestoreFocus={() => rawTrigger.current?.focus()}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
