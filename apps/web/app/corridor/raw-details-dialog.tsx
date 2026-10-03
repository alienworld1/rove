"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { CausalInspectorTrace } from "@rove/contracts";

export function RawDetailsDialog({
  trace,
  open,
  onOpenChange,
  onRestoreFocus,
}: {
  trace: CausalInspectorTrace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const reference =
    trace.payment?.transactionHash ??
    trace.voucher?.digest ??
    trace.evidence?.evidenceHash ??
    trace.eventId;
  async function copyReference() {
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onRestoreFocus();
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border border-line-strong bg-pure p-6 shadow-[var(--shadow-inspector)] focus:outline-none"
        >
          <Dialog.Title className="text-xl font-semibold text-ink">
            Raw event details
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-secondary">
            Exact references for this recorded event. Signed source data stays
            in the protected record.
          </Dialog.Description>
          <dl className="mt-5 grid gap-4 text-xs">
            <div>
              <dt className="text-ink-tertiary">Event</dt>
              <dd className="mt-1 break-all font-mono text-ink">
                {trace.eventId}
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">Reference</dt>
              <dd className="mt-1 break-all font-mono text-ink">{reference}</dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">
                Recorded calculation and references
              </dt>
              <dd className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all bg-sunken p-3 font-mono text-ink">
                {JSON.stringify(
                  {
                    calculation: trace.calculation,
                    voucher: trace.voucher,
                    payment: trace.payment,
                    result: trace.result,
                    causalSteps: trace.causalSteps,
                  },
                  null,
                  2,
                )}
              </dd>
            </div>
            {trace.evidence?.raw ? (
              <div>
                <dt className="text-ink-tertiary">
                  Signed meter payload
                  {trace.evidence.raw.truncated ? " · truncated" : ""}
                </dt>
                <dd className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all bg-sunken p-3 font-mono text-ink">
                  {trace.evidence.raw.content}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => void copyReference()}
              className="rounded-sm border border-line-strong px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-info"
            >
              {copied ? "Reference copied" : "Copy reference"}
            </button>
            <Dialog.Close className="rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Close details
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
