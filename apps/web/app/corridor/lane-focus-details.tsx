import { reasonTextFor, type CorridorOperatingView } from "@rove/contracts";
import { formatOperationalValue } from "./format-operational-value";

export function LaneFocusDetails({
  lane,
  tariff,
}: {
  lane: CorridorOperatingView["lanes"][number];
  tariff: CorridorOperatingView["corridor"]["tariff"];
}) {
  const projection = lane.projection;
  const details = [
    ["Charger", projection.chargerId],
    ["Meter", projection.meterId],
    ["Power", lane.powerClass],
    [
      "Tariff",
      `${formatOperationalValue(tariff.perKwh, tariff.tariffDecimals)} / kWh`,
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
    <dl className="absolute left-3 right-3 top-20 z-10 grid grid-cols-2 gap-x-4 gap-y-2 border border-line bg-pure/95 p-3 text-[11px] text-ink-secondary sm:grid-cols-4">
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
