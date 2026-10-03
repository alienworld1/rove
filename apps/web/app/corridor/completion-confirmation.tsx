"use client";
import * as Dialog from "@radix-ui/react-dialog";

export function CompletionConfirmation({
  action,
  onCancel,
  onConfirm,
  onRestoreFocus,
}: {
  action: "complete" | "close" | null;
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
            {action === "close"
              ? "Close the channel and return unused reserve?"
              : "Finish this session?"}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-ink-secondary">
            {action === "close"
              ? "The final payment is already collected. The channel will return its remaining reserve to the payer once closure is confirmed."
              : "Finish this session and check its final reading and accounting record. The digital twin will remain stopped."}
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-3">
            <Dialog.Close className="rounded-sm border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-info">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-sm bg-ink px-3 py-2 text-sm text-pure focus-visible:outline-2 focus-visible:outline-info"
            >
              {action === "close" ? "Close channel" : "Finish session"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
