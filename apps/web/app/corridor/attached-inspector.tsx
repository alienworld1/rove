"use client";

import { useState, type CSSProperties, type Ref } from "react";
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
  floatingRef,
  floatingStyle,
  onClose,
  onRetry,
}: {
  trace: CausalInspectorTrace | null;
  loading: boolean;
  error: string | null;
  assetDecimals: number;
  floatingRef: Ref<HTMLDivElement>;
  floatingStyle: CSSProperties;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  return (
    <div
      ref={floatingRef}
      style={floatingStyle}
      role="region"
      aria-label="Selected event details"
      className="z-30 w-[min(440px,calc(100vw-32px))] rounded-md border border-line-strong bg-pure p-5 shadow-[var(--shadow-inspector)] max-[1279px]:!static max-[1279px]:mt-4 max-[1279px]:!w-full max-[1279px]:shadow-none"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className="float-right ml-3 rounded-sm px-2 py-1 text-sm text-ink-secondary focus-visible:outline-2 focus-visible:outline-info"
      >
        Close
      </button>
      {loading ? (
        <p className="min-h-36 text-sm text-ink-secondary">
          Loading event details…
        </p>
      ) : error ? (
        <div className="min-h-36">
          <p className="text-sm text-critical">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            Try again
          </button>
        </div>
      ) : trace ? (
        <>
          {trace.eventType.startsWith("payment.") ? (
            <PaymentInspector trace={trace} assetDecimals={assetDecimals} />
          ) : (
            <EvidenceInspector trace={trace} assetDecimals={assetDecimals} />
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
            type="button"
            onClick={() => setRawOpen(true)}
            className="mt-4 rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            View raw details
          </button>
          {rawOpen ? (
            <RawDetailsDialog
              trace={trace}
              open={rawOpen}
              onOpenChange={setRawOpen}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
