import type { CorridorOperatingView } from "@rove/contracts";
import { OperationalValue } from "./operational-value";
import { formatOperationalValue } from "./format-operational-value";

export function CorridorAggregateBand({
  aggregate,
  attentionLaneLabels,
  assetDecimals,
}: {
  aggregate: CorridorOperatingView["aggregate"];
  attentionLaneLabels: string[];
  assetDecimals: number;
}) {
  return (
    <div className="border-y border-line-strong py-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <OperationalValue
          label="Trusted value"
          value={formatOperationalValue(
            aggregate.trustedDeliveredValue,
            assetDecimals,
          )}
        />
        <OperationalValue
          label="Protected value"
          value={formatOperationalValue(
            aggregate.protectedValue,
            assetDecimals,
          )}
        />
        <OperationalValue
          label="Settled value"
          value={formatOperationalValue(aggregate.settledValue, assetDecimals)}
        />
        <OperationalValue
          label="Exposure bound"
          value={formatOperationalValue(
            aggregate.unprotectedExposureBound,
            assetDecimals,
          )}
        />
        <OperationalValue
          label="Unused funded headroom"
          value={formatOperationalValue(
            aggregate.unusedFundedHeadroom,
            assetDecimals,
          )}
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
