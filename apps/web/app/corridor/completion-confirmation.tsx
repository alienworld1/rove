"use client";
import * as Dialog from "@radix-ui/react-dialog";

export function CompletionConfirmation({
  action,
  count,
  onCancel,
  onConfirm,
  onRestoreFocus,
}: {
  action: "complete" | "close" | null;
  count?: number;
  onCancel: () => void;
  onConfirm: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog.Root
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onRestoreFocus();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line-strong bg-pure p-6 shadow-[var(--shadow-inspector)]"
        >
          <Dialog.Title className="text-lg font-semibold text-ink">
            {count !== undefined
              ? action === "close"
                ? `Close ${count} eligible ${count === 1 ? "channel" : "channels"} and return ${count === 1 ? "its unused reserve" : "their unused reserves"}?`
                : `Finish ${count} charging ${count === 1 ? "session" : "sessions"}?`
              : action === "close"
                ? "Close the channel and return unused reserve?"
                : "Finish this session?"}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-ink-secondary">
            {count !== undefined
              ? action === "close"
                ? "Each eligible Lane has collected its final payment. Confirmed closure returns each channel’s unused reserve to the payer. Blocked Lanes remain open."
                : "Stop each eligible session and check its final reading and accounting record. Each Lane reports its progress independently. Review any differences before closing channels."
              : action === "close"
                ? "The final payment is already collected. The channel will return its remaining reserve to the payer once closure is confirmed."
                : "Finish this session and check its final reading and accounting record. The digital twin will remain stopped."}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-3">
            <Dialog.Close className="min-h-11 rounded-sm border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-info">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className="min-h-11 rounded-sm bg-ink px-3 py-2 text-sm text-pure focus-visible:outline-2 focus-visible:outline-info"
            >
              {count !== undefined
                ? action === "close"
                  ? "Close eligible channels"
                  : "Finish sessions"
                : action === "close"
                  ? "Close channel"
                  : "Finish session"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
