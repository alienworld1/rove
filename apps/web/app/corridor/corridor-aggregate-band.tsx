import type { CorridorOperatingView } from "@rove/contracts";
import { OperationalValue } from "./operational-value";

export function CorridorAggregateBand({
  aggregate,
  attentionLaneLabels,
}: {
  aggregate: CorridorOperatingView["aggregate"];
  attentionLaneLabels: string[];
}) {
  return (
    <div className="border-y border-line-strong py-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <OperationalValue
          label="Trusted value"
          value={aggregate.trustedDeliveredValue}
        />
        <OperationalValue
          label="Protected value"
          value={aggregate.protectedValue}
        />
        <OperationalValue
          label="Settled value"
          value={aggregate.settledValue}
        />
        <OperationalValue
          label="Exposure bound"
          value={aggregate.unprotectedExposureBound}
        />
        <OperationalValue
          label="Unused funded headroom"
          value={aggregate.unusedFundedHeadroom}
        />
      </dl>
      {attentionLaneLabels.length ? (
        <p className="mt-3 border-t border-line-faint pt-2 text-xs text-risk-deep">
          Needs attention: {attentionLaneLabels.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
