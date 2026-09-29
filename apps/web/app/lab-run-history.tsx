import type { LabRunView } from "@rove/contracts";
import { labReasonText } from "./lab-copy";

export function LabRunHistory({ events }: { events: LabRunView["events"] }) {
  return (
    <section
      aria-labelledby="lab-events-title"
      className="border-t border-line py-7"
    >
      <h3
        id="lab-events-title"
        className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-secondary"
      >
        Run events
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line-strong text-xs uppercase tracking-wide text-ink-tertiary">
              <th className="py-2 pr-4">Trace</th>
              <th className="py-2 pr-4">Lane</th>
              <th className="py-2 pr-4">Input</th>
              <th className="py-2 pr-4">Result</th>
              <th className="py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-line">
                <td className="py-2 pr-4 font-mono tabular-nums">
                  {new Date(event.traceOffsetMs).toISOString().slice(14, 19)}
                </td>
                <td className="py-2 pr-4">
                  {event.laneKey?.replace("lane-", "Lane ").toUpperCase()}
                </td>
                <td className="py-2 pr-4">{event.type.replaceAll("_", " ")}</td>
                <td className="py-2 pr-4">
                  {event.status.replaceAll("_", " ")}
                </td>
                <td className="py-2 text-xs">
                  {labReasonText(event.reasonCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
