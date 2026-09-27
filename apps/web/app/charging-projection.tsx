"use client";

import { useEffect, useState } from "react";
import { laneProjectionSchema, type LaneProjection } from "@rove/contracts";

type View = {
  name: string;
  payerEmsp: string;
  payeeCpo: string;
  assetId: string;
  lane: LaneProjection;
};
type ViewState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ready"; view: View };

const stateText: Record<LaneProjection["state"], string> = {
  INITIALIZING: "Protection is getting ready",
  PROTECTED: "Protection is ready",
  WATCH: "Protection needs attention",
  AT_RISK: "Protection is at risk",
  PAUSE_REQUIRED: "Charging should pause until protection is restored",
  RECOVERING: "Protection is being restored",
  COMPLETING: "Charging is finishing",
  RECONCILED: "Charging is reconciled",
  CLOSED: "Charging is closed",
};

function reasonText(reasons: string[]) {
  if (
    reasons.includes("RISK_WINDOW_EXHAUSTED") ||
    reasons.includes("CONTROL_PAUSE_REQUIRED")
  )
    return "The unprotected exposure bound has reached its limit. A pause was requested.";
  if (reasons.some((reason) => reason.startsWith("EVIDENCE_")))
    return "Meter readings need checking.";
  if (reasons.some((reason) => reason.startsWith("PAYMENT_")))
    return "Payment status needs checking.";
  if (reasons.includes("PROTECTION_AWAITING_TRUST_AND_FUNDING"))
    return "Waiting for trusted readings and confirmed funding.";
  if (reasons.includes("LOW_FUNDED_HEADROOM"))
    return "Funded headroom is running low.";
  return "The latest protection checks are recorded.";
}

async function read(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 403) throw new Error("ACCESS_DENIED");
  if (!response.ok) throw new Error("READ_UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

async function loadView(selectedLaneId?: string): Promise<ViewState> {
  try {
    if (selectedLaneId && /^[A-Za-z0-9._:-]+$/.test(selectedLaneId)) {
      const lane = laneProjectionSchema.parse(
        await read(`/api/charging/lanes/${encodeURIComponent(selectedLaneId)}`),
      );
      const detail = (await read(
        `/api/charging/corridors/${encodeURIComponent(lane.corridorId)}`,
      )) as {
        corridor: {
          name: string;
          payerEmsp: string;
          payeeCpo: string;
          settlementAssetId: string;
        };
        laneIds: string[];
      };
      return {
        kind: "ready",
        view: {
          name: detail.corridor.name,
          payerEmsp: detail.corridor.payerEmsp,
          payeeCpo: detail.corridor.payeeCpo,
          assetId: detail.corridor.settlementAssetId,
          lane,
        },
      };
    }
    const corridors = (await read("/api/charging/corridors")) as {
      id: string;
    }[];
    if (corridors.length === 0) return { kind: "empty" };
    const detail = (await read(
      `/api/charging/corridors/${encodeURIComponent(corridors[0].id)}`,
    )) as {
      corridor: {
        name: string;
        payerEmsp: string;
        payeeCpo: string;
        settlementAssetId: string;
      };
      laneIds: string[];
    };
    if (detail.laneIds.length === 0) return { kind: "empty" };
    const lane = laneProjectionSchema.parse(
      await read(
        `/api/charging/lanes/${encodeURIComponent(detail.laneIds[0])}`,
      ),
    );
    return {
      kind: "ready",
      view: {
        name: detail.corridor.name,
        payerEmsp: detail.corridor.payerEmsp,
        payeeCpo: detail.corridor.payeeCpo,
        assetId: detail.corridor.settlementAssetId,
        lane,
      },
    };
  } catch (error) {
    return {
      kind:
        error instanceof Error && error.message === "ACCESS_DENIED"
          ? "denied"
          : "error",
    };
  }
}

export function ChargingProjection() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadView(
      new URLSearchParams(window.location.search).get("lane") ?? undefined,
    ).then(setState);
  }, []);

  async function retry() {
    setBusy(true);
    setState({ kind: "loading" });
    setState(
      await loadView(
        new URLSearchParams(window.location.search).get("lane") ?? undefined,
      ),
    );
    setBusy(false);
  }

  const view = state.kind === "ready" ? state.view : null;
  const lane = view?.lane;
  const chainCurrent = lane?.chainFreshness === "current";
  const evidenceCurrent = lane?.evidenceFreshness === "current";
  const values = lane
    ? ([
        [
          "Trusted delivered value",
          lane.trustedDeliveredValue,
          view.assetId + " base units",
        ],
        ["Protected value", lane.protectedValue, view.assetId + " base units"],
        [
          "Funded headroom",
          chainCurrent ? lane.fundedHeadroom : null,
          view.assetId + " base units",
        ],
        [
          "Unprotected exposure bound",
          lane.unprotectedExposureBound,
          view.assetId + " base units",
        ],
      ] as const)
    : [];

  return (
    <section
      aria-labelledby="charging-title"
      className="mt-8 min-h-72 border-t border-line pt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id="charging-title" className="text-sm font-semibold text-ink">
          Charging sessions
        </h2>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={busy || state.kind === "loading"}
          className="rounded-sm border border-line-strong bg-raised px-3 py-2 text-sm text-ink hover:bg-selection focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-50"
        >
          Check again
        </button>
      </div>
      <div role="status" aria-live="polite" className="mt-5 min-h-48">
        {state.kind === "loading" ? (
          <p className="text-sm text-ink-secondary">
            Loading charging protection…
          </p>
        ) : null}
        {state.kind === "empty" ? (
          <p className="text-sm text-ink-secondary">
            No charging sessions are available yet.
          </p>
        ) : null}
        {state.kind === "denied" ? (
          <p className="text-sm text-ink-secondary">
            You don&apos;t have access to this charging session.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className="text-sm text-ink-secondary">
            Charging protection is unavailable right now. Try again.
          </p>
        ) : null}
        {view && lane ? (
          <div className="space-y-5">
            {lane.paymentSource === "local-simulation" ? (
              <p className="border-l-2 border-info pl-3 text-sm text-ink-secondary">
                Local simulation: payment status uses a controlled sample.
                Network confirmation is unavailable.
              </p>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-tertiary">
                Corridor
              </p>
              <h3 className="mt-1 text-xl font-semibold text-ink">
                {view.name}
              </h3>
              <p className="mt-1 break-words text-sm text-ink-secondary">
                {view.payerEmsp} → {view.payeeCpo}
              </p>
            </div>
            <div>
              <p
                className={`font-semibold ${lane.state === "PROTECTED" && chainCurrent && evidenceCurrent ? "text-protected" : lane.state === "PAUSE_REQUIRED" ? "text-critical" : "text-risk"}`}
              >
                {lane.state === "PROTECTED" && !chainCurrent
                  ? "Payment status needs checking"
                  : lane.state === "PROTECTED" && !evidenceCurrent
                    ? "Meter readings need checking"
                    : lane.state === "PROTECTED" &&
                        lane.paymentSource === "local-simulation"
                      ? "Protection is ready in this simulation"
                      : stateText[lane.state]}
              </p>
              <p className="mt-1 text-sm text-ink-secondary">
                {!chainCurrent && lane.state === "PROTECTED"
                  ? "The last confirmed funding is historical. New payment protection needs a fresh check."
                  : !evidenceCurrent && lane.state === "PROTECTED"
                    ? "The last trusted reading is historical. Protection needs a fresh reading."
                    : reasonText(lane.reasonCodes)}
              </p>
              <p className="mt-1 font-mono text-xs text-ink-tertiary">
                Version {lane.version} · Updated{" "}
                {new Date(lane.updatedAt).toLocaleString()}
              </p>
              {lane.chainFreshness === "historical" ? (
                <p className="mt-2 text-sm text-ink-secondary">
                  Payment information is from an earlier check. Current funding
                  is awaiting confirmation.
                </p>
              ) : null}
              {lane.evidenceFreshness === "historical" ? (
                <p className="mt-1 text-sm text-ink-secondary">
                  Trusted values reflect an earlier meter reading. A fresh
                  reading is needed.
                </p>
              ) : null}
            </div>
            <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {values.map(([label, value, unit]) => (
                <div key={label} className="border-t border-line pt-2">
                  <dt className="text-sm text-ink-secondary">{label}</dt>
                  <dd className="mt-1 break-words font-mono text-sm tabular-nums text-ink">
                    {value === null
                      ? "Awaiting confirmation"
                      : `${value} ${unit}`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </section>
  );
}
