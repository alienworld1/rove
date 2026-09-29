import type { CorridorOperatingView } from "@rove/contracts";

export function SourceDisclosure({
  environment,
}: {
  environment: CorridorOperatingView["environment"];
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-4 text-xs text-ink-tertiary">
      <span>Physical source · {environment.physicalSource}</span>
      <span>Evidence · {environment.evidence}</span>
      <span>Payment · {environment.payment}</span>
      <span>Settlement · {environment.settlement}</span>
    </div>
  );
}
