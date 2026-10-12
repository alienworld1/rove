"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { readAccountingRecord } from "./api";
import { formatOperationalValue } from "./format-operational-value";

export function AccountingRecordDialog({
  laneId,
  assetUnit,
  assetDecimals,
  normalizedTotal,
}: {
  laneId: string;
  assetUnit: string;
  assetDecimals: number;
  normalizedTotal: string;
}) {
  const record = useQuery({
    queryKey: ["accounting-record", laneId],
    queryFn: () => readAccountingRecord(laneId),
    enabled: false,
  });
  return (
    <Dialog.Root>
      <Dialog.Trigger
        onClick={() => void record.refetch()}
        className="min-h-11 rounded-sm border border-line px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-info"
      >
        View accounting record
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-md border border-line-strong bg-pure p-6 shadow-[var(--shadow-inspector)]">
          <Dialog.Title className="text-lg font-semibold text-ink">
            Accounting record
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-ink-secondary">
            The original final charging record and its total expressed in the
            payment asset’s units.
          </Dialog.Description>
          <p className="mt-3 text-sm tabular-nums">
            Accounting total in payment units:{" "}
            {formatOperationalValue(normalizedTotal, assetDecimals)} {assetUnit}
          </p>
          {record.isFetching ? (
            <p className="mt-4">Loading accounting record…</p>
          ) : record.error ? (
            <p className="mt-4 text-critical">
              The accounting record couldn&apos;t load. Close and try again.
            </p>
          ) : (
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all bg-sunken p-3 font-mono text-xs text-ink">
              {JSON.stringify(record.data, null, 2)}
            </pre>
          )}
          <Dialog.Close className="mt-5 min-h-11 rounded-sm bg-ink px-3 py-2 text-sm text-pure focus-visible:outline-2 focus-visible:outline-info">
            Close details
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
