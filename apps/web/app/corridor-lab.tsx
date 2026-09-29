"use client";

import { useEffect, useState } from "react";
import {
  labRunViewSchema,
  type LabRunView,
  type LabScenario,
} from "@rove/contracts";
import { LabEnvironmentSummary } from "./lab-environment-summary";
import { LabPlaybackControls } from "./lab-playback-controls";
import { LabLaneRuntime } from "./lab-lane-runtime";
import { LabRunHistory } from "./lab-run-history";
import { LabScenarioBuilder } from "./lab-scenario-builder";

type Summary = {
  id: string;
  name: string;
  digest: string;
  schemaVersion: number;
  validationStatus: string;
};
type Issue = { path: string; message: string };

async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/lab/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const value = (await response.json()) as {
    message?: string;
    issues?: Issue[];
  };
  if (!response.ok)
    throw Object.assign(
      new Error(value.message ?? "Corridor Lab is unavailable right now."),
      { status: response.status, issues: value.issues },
    );
  return value;
}

async function readRun(id: string) {
  return labRunViewSchema.parse(
    await request(`runs/${encodeURIComponent(id)}`),
  );
}

export function CorridorLab() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [scenario, setScenario] = useState<LabScenario | null>(null);
  const [digest, setDigest] = useState("");
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<LabRunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = (await request("scenarios")) as Summary[];
        if (!active) return;
        setSummaries(list);
        const url = new URL(window.location.href);
        const requestedRun = url.searchParams.get("run");
        if (requestedRun && /^[A-Za-z0-9._:-]+$/.test(requestedRun)) {
          const current = await readRun(requestedRun);
          if (!active) return;
          setView(current);
          setScenario(current.scenario);
          setDigest(current.run.scenarioDigest);
          setDraft(JSON.stringify(current.scenario, null, 2));
        } else if (list.length) {
          const id = url.searchParams.get("scenario") ?? list[0].id;
          const selected = list.find((item) => item.id === id) ?? list[0];
          const detail = (await request(
            `scenarios/${encodeURIComponent(selected.id)}`,
          )) as { definition: LabScenario; digest: string };
          if (!active) return;
          setScenario(detail.definition);
          setDigest(detail.digest);
          setDraft(JSON.stringify(detail.definition, null, 2));
        }
      } catch (error) {
        if (!active) return;
        setDenied(
          error instanceof Error && "status" in error && error.status === 403,
        );
        setMessage(
          error instanceof Error
            ? error.message
            : "Corridor Lab is unavailable right now.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const activeRunId = view?.run.id;
  const activeRunStatus = view?.run.status;
  useEffect(() => {
    if (
      !activeRunId ||
      !activeRunStatus ||
      !["running", "initializing", "awaiting_chain"].includes(activeRunStatus)
    )
      return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void readRun(activeRunId)
          .then(setView)
          .catch(() =>
            setMessage("Run status could not be refreshed. Check again."),
          );
    }, 1500);
    return () => window.clearInterval(id);
  }, [activeRunId, activeRunStatus]);

  async function selectScenario(id: string) {
    setBusy(true);
    try {
      const detail = (await request(`scenarios/${encodeURIComponent(id)}`)) as {
        definition: LabScenario;
        digest: string;
      };
      setScenario(detail.definition);
      setDigest(detail.digest);
      setDraft(JSON.stringify(detail.definition, null, 2));
      setView(null);
      setIssues([]);
      setMessage("Scenario ready");
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", id);
      url.searchParams.delete("run");
      window.history.replaceState(null, "", url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Scenario unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    setIssues([]);
    setMessage("Checking scenario…");
    try {
      const input = JSON.parse(draft) as unknown;
      const saved = (await request("scenarios", input)) as {
        id: string;
        name: string;
        digest: string;
      };
      setScenario(input as LabScenario);
      setDigest(saved.digest);
      setSummaries((await request("scenarios")) as Summary[]);
      setMessage("Scenario ready");
    } catch (error) {
      const detail = error as Error & { issues?: Issue[] };
      setIssues(
        detail.issues ?? [
          {
            path: "definition",
            message:
              error instanceof SyntaxError
                ? "Check the scenario format."
                : detail.message,
          },
        ],
      );
      setMessage("Review the highlighted settings.");
      document.getElementById("lab-scenario-definition")?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!scenario || !digest) return;
    setBusy(true);
    setMessage("Preparing protected charging sessions…");
    try {
      const next = labRunViewSchema.parse(
        await request("runs", {
          scenarioId: scenario.id,
          scenarioDigest: digest,
        }),
      );
      setView(next);
      setMessage("Run ready");
      const url = new URL(window.location.href);
      url.searchParams.set("run", next.run.id);
      url.searchParams.set("scenario", scenario.id);
      window.history.replaceState(null, "", url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "This run couldn't start.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: "play" | "pause" | "step" | "reset" | "check",
    speed?: number,
  ) {
    if (!view) return;
    if (
      action === "reset" &&
      !window.confirm(
        "A replay starts a new run and keeps the current history. Continue?",
      )
    )
      return;
    setBusy(true);
    try {
      const next = labRunViewSchema.parse(
        await request(
          `runs/${encodeURIComponent(view.run.id)}/${speed === undefined ? action : "speed"}`,
          speed === undefined
            ? { expectedVersion: view.run.version }
            : { expectedVersion: view.run.version, speed },
        ),
      );
      setView(next);
      setMessage(
        next.run.status === "completed"
          ? "Scenario completed through recovery."
          : speed !== undefined
            ? "Playback speed updated."
            : action === "step"
              ? "One trace event checked."
              : action === "reset"
                ? "Replay started."
                : action === "check"
                  ? "Payment status checked."
                  : action === "play"
                    ? "Running"
                    : "Paused",
      );
      if (next.run.id !== view.run.id) {
        const url = new URL(window.location.href);
        url.searchParams.set("run", next.run.id);
        window.history.replaceState(null, "", url);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "This run couldn't continue.",
      );
      try {
        setView(await readRun(view.run.id));
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  function createScenario() {
    if (!scenario) return;
    const next = {
      ...scenario,
      id: `scenario-${crypto.randomUUID()}`,
      name: "New Corridor scenario",
    };
    setDraft(JSON.stringify(next, null, 2));
    setScenario(next);
    setDigest("");
    setView(null);
    setMessage("Review the scenario before starting a run.");
  }

  const environment = view?.environment ?? {
    physicalSource: "Digital twin" as const,
    evidence: "Controlled signed meter readings",
    payment:
      scenario?.corridor.tempoNetwork === "local-simulation"
        ? "Local deterministic payment"
        : "Tempo",
    settlement: "Partial settlement; final close is outside this run",
  };
  return (
    <section
      id="corridor-lab"
      aria-labelledby="corridor-lab-title"
      className="mt-12 border-t-2 border-ink pt-8"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary">
            Digital twin
          </p>
          <h2
            id="corridor-lab-title"
            className="mt-2 text-3xl font-semibold text-ink"
          >
            Corridor Lab
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            Reproduce signed meter and payment protection behavior across
            charging sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={createScenario}
          disabled={!scenario || busy}
          className="rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Create scenario
        </button>
      </div>
      {loading ? (
        <p className="py-8 text-sm text-ink-secondary">Loading Corridor Lab…</p>
      ) : denied ? (
        <p className="py-8 text-sm text-critical">
          You don&apos;t have access to this Corridor Lab.
        </p>
      ) : summaries.length === 0 && !scenario ? (
        <p className="py-8 text-sm text-ink-secondary">
          No Lab scenarios are available yet.
        </p>
      ) : null}
      {scenario ? (
        <>
          <div className="mb-5 flex flex-wrap items-end gap-4">
            <label className="min-w-56 text-sm text-ink-secondary">
              Scenario
              <select
                value={
                  summaries.some((item) => item.id === scenario.id)
                    ? scenario.id
                    : ""
                }
                onChange={(event) => void selectScenario(event.target.value)}
                disabled={busy}
                className="mt-1 block w-full rounded-sm border border-line-strong bg-pure px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-ink"
              >
                <option value="" disabled>
                  Unsaved scenario
                </option>
                {summaries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex-1">
              <p className="font-semibold text-ink">{scenario.corridor.name}</p>
              <p className="text-sm text-ink-secondary">
                {scenario.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || !digest || Boolean(view)}
              title={
                !digest
                  ? "Validate the scenario before starting a run."
                  : view
                    ? "Replay the current run to start again."
                    : undefined
              }
              className="rounded-sm border border-line-strong bg-ink px-4 py-2 text-sm font-semibold text-pure focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              Start run
            </button>
          </div>
          <LabEnvironmentSummary environment={environment} />
        </>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm text-ink-secondary"
      >
        {message}
      </p>
      {view ? (
        <>
          <p className="mt-4 font-mono text-xs text-ink-tertiary">
            Run {view.run.id}
          </p>
          <LabPlaybackControls
            run={view.run}
            busy={busy}
            onAction={(action) => void act(action)}
            onSpeed={(speed) => void act("play", speed)}
            onCheck={() => void act("check")}
          />
          <LabLaneRuntime lanes={view.lanes} />
          <LabRunHistory events={view.events} />
        </>
      ) : scenario ? (
        <div className="py-7">
          <h3 className="text-sm font-semibold text-ink">Configured Lanes</h3>
          <div className="mt-3 border-t border-line-strong">
            {scenario.lanes.map((lane) => (
              <p
                key={lane.key}
                className="border-b border-line py-3 text-sm text-ink-secondary"
              >
                <span className="font-semibold text-ink">{lane.label}</span> ·{" "}
                {lane.powerClass} {Number(lane.maxPowerWatts) / 1000} kW ·{" "}
                {lane.meterId}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {scenario && !view ? (
        <LabScenarioBuilder
          draft={draft}
          onChange={(value) => {
            setDraft(value);
            setDigest("");
            setMessage("Review the scenario before starting a run.");
          }}
          onValidate={() => void validate()}
          busy={busy}
          issues={issues}
        />
      ) : null}
    </section>
  );
}
