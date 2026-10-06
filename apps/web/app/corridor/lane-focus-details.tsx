import { DocsLink } from "../docs-link";
import { reasonTextFor, type CorridorOperatingView } from "@rove/contracts";
import { formatOperationalValue } from "./format-operational-value";

export function LaneFocusDetails({
  lane,
  tariff,
  assetUnit,
}: {
  lane: CorridorOperatingView["lanes"][number];
  tariff: CorridorOperatingView["corridor"]["tariff"];
  assetUnit: string;
}) {
  const projection = lane.projection;
  const details = [
    ["Charger", projection.chargerId],
    ["Meter", projection.meterId],
    ["Power", lane.powerClass],
    [
      "Tariff",
      `${formatOperationalValue(tariff.perKwh, tariff.tariffDecimals)} ${assetUnit}/kWh`,
    ],
    [
      "Limit",
      formatOperationalValue(
        projection.maxUnprotectedExposure,
        tariff.assetDecimals,
      ),
    ],
    [
      "Latest reading",
      projection.lastTrustedEvidenceAt
        ? new Date(projection.lastTrustedEvidenceAt).toLocaleTimeString()
        : "Waiting for trusted evidence",
    ],
    [
      "Current condition",
      projection.state === "PROTECTED"
        ? "Protection ready"
        : projection.reasonCodes.length
          ? projection.reasonCodes.map(reasonTextFor).join(" · ")
          : "Awaiting the next trusted update",
    ],
  ];
  return (
    <dl className="absolute left-3 right-3 top-14 z-10 grid grid-cols-4 gap-x-4 gap-y-2 border border-line bg-pure p-3 text-[11px] text-ink-secondary">
      <div className="col-span-4">
        <DocsLink topic="protection">How protection works</DocsLink>
      </div>
      {BigInt(projection.unverifiedServiceBound) > BigInt(0) ? (
        <div className="col-span-4 border-l-2 border-risk pl-2">
          <dt className="font-semibold text-ink">
            Why the risk envelope grows
          </dt>
          <dd>
            The last trusted reading remains the billing frontier. Maximum
            charger power and elapsed trace time bound possible additional
            electricity.{" "}
            {projection.state === "PAUSE_REQUIRED"
              ? "The exposure limit is exhausted, so this Lane must pause."
              : "Select a risk event to inspect the calculation."}
          </dd>
        </div>
      ) : null}
      {details.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt>{label}</dt>
          <dd className="truncate font-medium text-ink" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
