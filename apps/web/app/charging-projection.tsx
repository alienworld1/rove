"use client";

import { useEffect, useState } from "react";
import { laneHistorySchema, laneProjectionSchema } from "@rove/contracts";
import { ChargingValues } from "./charging-values";
import { ChargingHistory } from "./charging-history";
import { ChargingOperations } from "./charging-operations";
import type { ChargingView } from "./charging-view";

type ViewState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "denied" }
  | { kind: "not_found" }
  | { kind: "error" }
  | { kind: "ready"; view: ChargingView };

const stateText: Record<ChargingView["lane"]["state"], string> = {
  INITIALIZING: "Preparing payment protection",
  PROTECTED: "Protection is ready",
  WATCH: "Protection needs attention",
  AT_RISK: "Protection is at risk",
  PAUSE_REQUIRED: "Charging must pause until protection is restored",
  RECOVERING: "Restoring protection",
  COMPLETING: "Charging is finishing",
  RECONCILED: "Session totals match",
  CLOSED: "Payment channel is closed",
};

function reasonText(reasons: string[]) {
  if (reasons.includes("RISK_WINDOW_EXHAUSTED"))
    return "The exposure bound has reached its limit.";
  if (reasons.includes("EVIDENCE_SIGNATURE_INVALID"))
    return "The meter signature could not be verified.";
  if (reasons.includes("EVIDENCE_UNTRUSTED_OR_STALE"))
    return "Meter evidence is stale or could not be trusted. Protection is no longer advancing.";
  if (reasons.includes("PAYMENT_CHAIN_STATE_UNAVAILABLE"))
    return "Payment status needs checking.";
  if (reasons.includes("PAYMENT_SIGNER_UNAVAILABLE"))
    return "Payment protection could not advance because signing is unavailable.";
  if (reasons.includes("PROTECTION_AWAITING_TRUST_AND_FUNDING"))
    return "Waiting for trusted readings and confirmed funding.";
  if (reasons.includes("LOW_FUNDED_HEADROOM"))
    return "Funded headroom is running low.";
  if (reasons.includes("RECOVERY_CHECKS_PENDING"))
    return "Protection is still being restored. Evidence, funding, and authorization are being checked.";
  return "The latest protection checks are recorded.";
}

async function read(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status === 403) throw new Error("ACCESS_DENIED");
  if (response.status === 404) throw new Error("NOT_FOUND");
  if (!response.ok) throw new Error("READ_UNAVAILABLE");
  return response.json() as Promise<unknown>;
}

async function loadView(selectedLaneId?: string): Promise<ViewState> {
  try {
    let laneId = selectedLaneId;
    let detail:
      | {
          corridor: {
            name: string;
            payerEmsp: string;
            payeeCpo: string;
            settlementAssetId: string;
            tempoNetwork: string;
            tariff: { assetDecimals: number };
          };
          laneIds: string[];
        }
      | undefined;
    if (!laneId) {
      const corridors = (await read("/api/charging/corridors")) as {
        id: string;
      }[];
      if (corridors.length === 0) return { kind: "empty" };
      detail = (await read(
        `/api/charging/corridors/${encodeURIComponent(corridors[0].id)}`,
      )) as typeof detail;
      laneId = detail?.laneIds[0];
      if (!laneId) return { kind: "empty" };
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(laneId)) return { kind: "not_found" };
    const [laneRaw, historyRaw] = await Promise.all([
      read(`/api/charging/lanes/${encodeURIComponent(laneId)}`),
      read(`/api/charging/lanes/${encodeURIComponent(laneId)}/inspector`),
    ]);
    const lane = laneProjectionSchema.parse(laneRaw);
    detail ??= (await read(
      `/api/charging/corridors/${encodeURIComponent(lane.corridorId)}`,
    )) as typeof detail;
    if (!detail) return { kind: "error" };
    return {
      kind: "ready",
      view: {
        name: detail.corridor.name,
        payerEmsp: detail.corridor.payerEmsp,
        payeeCpo: detail.corridor.payeeCpo,
        assetId: detail.corridor.settlementAssetId,
        network: detail.corridor.tempoNetwork,
        assetDecimals: detail.corridor.tariff.assetDecimals,
        lane,
        history: laneHistorySchema.parse(historyRaw),
      },
    };
  } catch (error) {
    return {
      kind:
        error instanceof Error && error.message === "ACCESS_DENIED"
          ? "denied"
          : error instanceof Error && error.message === "NOT_FOUND"
            ? "not_found"
            : "error",
    };
  }
}

export function ChargingProjection() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    void loadView(
      new URLSearchParams(window.location.search).get("lane") ?? undefined,
    ).then(setState);
  }, []);

  async function retry() {
    setBusy(true);
    const next = await loadView(
      new URLSearchParams(window.location.search).get("lane") ?? undefined,
    );
    if (
      state.kind === "ready" &&
      next.kind === "ready" &&
      state.view.lane.state === "RECOVERING" &&
      next.view.lane.state === "PROTECTED"
    )
      setAnnouncement("Protection restored");
    else setAnnouncement("");
    setState(next);
    setBusy(false);
  }

  const view = state.kind === "ready" ? state.view : null;
  const lane = view?.lane;
  const chainCurrent = lane?.chainFreshness === "current";
  const evidenceCurrent = lane?.evidenceFreshness === "current";
  const paymentReal = lane?.paymentSource === "tempo-adapter";

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
          className="min-h-10 rounded-sm border border-line-strong bg-raised px-3 py-2 text-sm text-ink hover:bg-selection focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-50"
        >
          Check again
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="mt-5 min-h-48" aria-live="polite">
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
        {state.kind === "not_found" ? (
          <p className="text-sm text-ink-secondary">
            We couldn&apos;t find that charging session.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className="text-sm text-ink-secondary">
            Charging protection is unavailable right now. Try again.
          </p>
        ) : null}
        {view && lane ? (
          <div className="space-y-7">
            {lane.meterSource === "controlled-fixture" ||
            lane.paymentSource === "local-simulation" ? (
              <div className="space-y-1 border-l-2 border-info pl-3 text-sm text-ink-secondary">
                {lane.meterSource === "controlled-fixture" ||
                lane.paymentSource === "local-simulation" ? (
                  <p>
                    Meter readings come from the simulated charging example.
                  </p>
                ) : null}
                {lane.paymentSource === "local-simulation" ? (
                  <p>
                    Local simulation: payment status is not network
                    confirmation.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-tertiary">
                  Charging session
                </p>
                <h3 className="mt-1 text-xl font-semibold text-ink">
                  {view.name}
                </h3>
                <p className="mt-1 break-words text-sm text-ink-secondary">
                  {view.payerEmsp} → {view.payeeCpo}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-ink-tertiary">
                  {lane.externalSessionId} · {lane.chargerId} · {lane.meterId}
                </p>
              </div>
              <div className="sm:text-right">
                <p
                  className={`font-semibold ${lane.state === "PROTECTED" && chainCurrent && evidenceCurrent && paymentReal ? "text-protected" : lane.state === "PAUSE_REQUIRED" ? "text-critical" : "text-risk"}`}
                >
                  {lane.state === "PROTECTED" && !chainCurrent
                    ? "Payment status needs checking"
                    : lane.state === "PROTECTED" && !evidenceCurrent
                      ? "Meter evidence is stale"
                      : lane.state === "PROTECTED" && !paymentReal
                        ? "Protection shown in local simulation"
                        : stateText[lane.state]}
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  {reasonText(lane.reasonCodes)}
                </p>
                <p className="mt-1 font-mono text-xs text-ink-tertiary">
                  Version {lane.version} · Updated{" "}
                  {new Date(lane.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            {lane.chainFreshness === "historical" ? (
              <p className="text-sm text-ink-secondary">
                Payment information is from an earlier check. Current funding
                needs a fresh chain read.
              </p>
            ) : null}
            {lane.evidenceFreshness === "historical" ? (
              <p className="text-sm text-ink-secondary">
                Trusted values reflect an earlier meter reading.
              </p>
            ) : null}
            <ChargingValues view={view} />
            <ChargingOperations
              operations={lane.operations}
              paymentSource={lane.paymentSource}
              network={view.network}
              assetId={view.assetId}
              assetDecimals={view.assetDecimals}
            />
            <ChargingHistory history={view.history} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
