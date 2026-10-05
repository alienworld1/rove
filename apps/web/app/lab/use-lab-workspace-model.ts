"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  copyLabScenario,
  labScenarioSchema,
  hostedQuoteSchema,
  resequenceLabEvents,
  type LabScenario,
  type LabScenarioEvent,
} from "@rove/contracts";
import {
  readScenarios,
  readScenario,
  readRun,
  saveScenario,
  startRun,
  CorridorApiError,
} from "../corridor/api";
import { hostedJson, startHostedRun } from "../hosted-api";
import { useLabDraft } from "./lab-draft-store";
import { navigateLab, useLabNavigation } from "./lab-navigation";

type Issue = { path: string; message: string; eventId?: string };
export function useLabWorkspaceModel({
  hosted = false,
}: {
  hosted?: boolean;
  remainingRuns?: number;
}) {
  const client = useQueryClient();
  const navigation = useLabNavigation();
  const state = useLabDraft();
  const { draft, setDraft, change, savedDigest, pending } = state;
  const [selectedScenario, setSelectedScenario] = useState("");
  const [laneKey, setLaneKey] = useState("lane-c");
  const [eventId, setEventId] = useState<string | null>(null);
  const [section, setSection] = useState<"lane" | "corridor">("lane");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<ReturnType<
    typeof hostedQuoteSchema.parse
  > | null>(null);
  const intent = useRef<{
    id: string;
    digest: string;
    scenarioId: string;
  } | null>(null);
  const summaries = useQuery({
    queryKey: ["scenarios"],
    queryFn: readScenarios,
  });
  const effectiveId =
    selectedScenario || (hosted ? "hosted-template" : "northstar-voltway");
  const source = useQuery({
    queryKey: ["scenario", effectiveId],
    queryFn: ({ signal }) => readScenario(effectiveId, signal),
    enabled: Boolean(effectiveId),
  });
  const templateSource = useQuery({
    queryKey: ["scenario", hosted ? "hosted-template" : "northstar-voltway"],
    queryFn: ({ signal }) =>
      readScenario(hosted ? "hosted-template" : "northstar-voltway", signal),
  });
  const copy = useQuery({
    queryKey: ["run", navigation.copyId],
    queryFn: ({ signal }) => readRun(navigation.copyId!, signal),
    enabled: Boolean(navigation.copyId),
  });
  useEffect(() => {
    if (
      navigation.copyId &&
      copy.data &&
      state.source !== `run:${navigation.copyId}`
    ) {
      if (
        draft &&
        !savedDigest &&
        !window.confirm("Replace your unsaved draft with a copy of this run?")
      ) {
        navigateLab("lab", { copy: null });
        return;
      }
      setDraft(
        copyLabScenario(copy.data.scenario, `scenario-${crypto.randomUUID()}`),
        `run:${navigation.copyId}`,
      );
    } else if (!navigation.copyId && !draft && source.data)
      setDraft(
        copyLabScenario(
          source.data.definition,
          `scenario-${crypto.randomUUID()}`,
        ),
      );
  }, [
    navigation.copyId,
    copy.data,
    source.data,
    draft,
    savedDigest,
    state.source,
    setDraft,
  ]);
  useEffect(() => {
    if (!draft || (savedDigest && !Object.keys(pending).length)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, savedDigest, pending]);
  function update(next: LabScenario) {
    change(next);
    setQuote(null);
    setIssues([]);
    setMessage("");
  }
  function replace(next: LabScenario) {
    if (draft && !savedDigest && !window.confirm("Replace this unsaved draft?"))
      return false;
    setDraft(next);
    setIssues([]);
    setQuote(null);
    setEventId(null);
    navigateLab("lab", { copy: null });
    return true;
  }
  function template(healthy: boolean) {
    const seed = templateSource.data?.definition;
    if (!seed) return;
    const next = copyLabScenario(seed, `scenario-${crypto.randomUUID()}`);
    if (healthy) {
      next.name = "Healthy charging";
      next.description =
        "Signed charging readings with normal payment protection and matching final accounting.";
      next.terminalCondition = "after_trace";
      next.events = resequenceLabEvents(
        next.events.filter(
          (event) =>
            event.type === "session_start" || event.type === "valid_reading",
        ),
      );
      if (next.schemaVersion === 2) next.accountingByLane = {};
    }
    replace(next);
  }
  async function persist(runAfter: boolean) {
    if (!draft || busy) return;
    const revision = useLabDraft.getState().revision;
    if (Object.keys(pending).length) {
      setMessage("Finish the highlighted numeric fields before saving.");
      document.getElementById(`field-${Object.keys(pending)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setMessage("Checking the complete scenario…");
    try {
      const parsed = labScenarioSchema.safeParse(draft);
      if (!parsed.success) {
        setIssues(
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
        setMessage("Review the highlighted settings.");
        return;
      }
      const saved = await saveScenario(parsed.data);
      state.saved(saved.digest, revision);
      setIssues([]);
      setMessage("Scenario saved and validated.");
      await client.invalidateQueries({ queryKey: ["scenarios"] });
      if (useLabDraft.getState().revision !== revision) return;
      if (runAfter) {
        if (hosted) {
          const quoted = hostedQuoteSchema.parse(
            await hostedJson("/api/access/quote", {
              scenarioId: saved.id,
              scenarioDigest: saved.digest,
            }),
          );
          setQuote(quoted);
          setMessage(
            "Review the reserved funding and run allowance below, then start this scenario.",
          );
        } else await launch(parsed.data, saved.digest);
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  function report(error: unknown) {
    if (error instanceof CorridorApiError && error.issues)
      setIssues(error.issues);
    setMessage(
      error instanceof Error
        ? error.message
        : "This scenario could not be saved. Try again.",
    );
  }
  async function launch(definition: LabScenario, digest: string) {
    if (!intent.current) {
      try {
        intent.current = JSON.parse(
          sessionStorage.getItem("rove-lab-start") ?? "null",
        );
      } catch {}
    }
    if (
      !intent.current ||
      intent.current.digest !== digest ||
      intent.current.scenarioId !== definition.id
    )
      intent.current = {
        id: crypto.randomUUID(),
        digest,
        scenarioId: definition.id,
      };
    try {
      sessionStorage.setItem("rove-lab-start", JSON.stringify(intent.current));
    } catch {}
    try {
      const run = hosted
        ? await startHostedRun(intent.current.id, {
            scenarioId: definition.id,
            scenarioDigest: digest,
          })
        : await startRun(definition, digest, intent.current.id);
      client.setQueryData(["run", run.run.id], run);
      intent.current = null;
      try {
        sessionStorage.removeItem("rove-lab-start");
      } catch {}
      void client.invalidateQueries({ queryKey: ["hosted-session"] });
      navigateLab("corridor", {
        run: run.run.id,
        scenario: definition.id,
        copy: null,
        lane: null,
        event: null,
        trace: null,
        corridor: null,
      });
    } catch (error) {
      if (
        error instanceof CorridorApiError &&
        [400, 403, 404, 409, 422].includes(error.status)
      ) {
        intent.current = null;
        try {
          sessionStorage.removeItem("rove-lab-start");
        } catch {}
      }
      throw error;
    }
  }
  const lane =
    draft?.lanes.find((item) => item.key === laneKey) ?? draft?.lanes[0];
  const selectedEvent = draft?.events.find((event) => event.id === eventId);
  function addEvent() {
    if (!draft || !lane || draft.events.length >= 200) return;
    const previous = draft.events
      .filter(
        (event) =>
          event.laneKey === lane.key && "cumulativeMilliWh" in event.parameters,
      )
      .at(-1);
    const event: LabScenarioEvent = {
      id: `event-${crypto.randomUUID()}`,
      laneKey: lane.key,
      type: "corrupt_signature",
      traceOffsetMs: Math.min(
        3_600_000,
        Math.max(0, ...draft.events.map((event) => event.traceOffsetMs)) + 100,
      ),
      sequence: 10_000,
      durationMs: null,
      parameters: {
        cumulativeMilliWh:
          previous && "cumulativeMilliWh" in previous.parameters
            ? previous.parameters.cumulativeMilliWh
            : "0",
      },
    };
    update({ ...draft, events: resequenceLabEvents([...draft.events, event]) });
    setEventId(event.id);
    setSection("lane");
  }
  function duplicateLane() {
    if (!draft || !lane || draft.lanes.length >= 3) return;
    const suffix = crypto.randomUUID();
    const key = `lane-${suffix}`;
    const next = {
      ...lane,
      key,
      label: `${lane.label} copy`,
      meterId: `meter-${suffix}`,
      chargerId: `charger-${suffix}`,
      sessionId: `session-${suffix}`,
    };
    const events = draft.events
      .filter((event) => event.laneKey === lane.key)
      .map((event) => ({
        ...event,
        id: `event-${crypto.randomUUID()}`,
        laneKey: key,
        sequence: 10_000,
      }));
    if (draft.events.length + events.length > 200) {
      setMessage(
        "Duplicating this Lane would exceed 200 events. Remove some events first.",
      );
      return;
    }
    update({
      ...draft,
      ...(draft.schemaVersion === 2 && draft.accountingByLane?.[lane.key]
        ? {
            accountingByLane: {
              ...draft.accountingByLane,
              [key]: structuredClone(draft.accountingByLane[lane.key]),
            },
          }
        : {}),
      lanes: [...draft.lanes, next],
      events: resequenceLabEvents([...draft.events, ...events]),
    });
    setLaneKey(key);
    setEventId(null);
  }
  return {
    client,
    navigation,
    state,
    draft,
    setDraft,
    change,
    savedDigest,
    pending,
    selectedScenario,
    setSelectedScenario,
    laneKey,
    setLaneKey,
    eventId,
    setEventId,
    section,
    setSection,
    issues,
    setIssues,
    busy,
    setBusy,
    message,
    setMessage,
    quote,
    setQuote,
    summaries,
    source,
    copy,
    template,
    update,
    replace,
    persist,
    report,
    launch,
    lane,
    selectedEvent,
    addEvent,
    duplicateLane,
  };
}
export type LoadedLabModel = ReturnType<typeof useLabWorkspaceModel> & {
  draft: LabScenario;
  lane: LabScenario["lanes"][number];
};
