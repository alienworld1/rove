import type { CompletionSummary } from "@rove/contracts";
import {
  retainCompletionIntent,
  type CompletionIntent,
} from "./completion-intent";

export type CompletionAction = "complete" | "check" | "close";
export type CompletionTransport = {
  read: (laneId: string) => Promise<CompletionSummary>;
  control: (
    laneId: string,
    version: number,
    action: CompletionAction,
    intent: CompletionIntent,
  ) => Promise<CompletionSummary>;
};

export async function executeCompletionAction(
  transport: CompletionTransport,
  intents: Map<string, CompletionIntent>,
  laneId: string,
  action: CompletionAction,
) {
  const key = `${laneId}:${action}`;
  const summary = await transport.read(laneId);
  if (
    action === "close" &&
    ["closed", "closing"].includes(summary.completion?.status ?? "")
  ) {
    intents.delete(key);
    return summary;
  }
  if (
    action === "complete" &&
    summary.completion?.cdr &&
    summary.completion.finalEvidenceHash
  ) {
    intents.delete(key);
    return summary;
  }
  if (
    summary.recovery.status !== "ready" ||
    (action === "close" && !summary.canClose) ||
    (action === "complete" && !summary.canFinish && !summary.completion)
  )
    throw new Error(
      "This Lane is not ready for this action. Inspect its current status and check again.",
    );
  const intent = retainCompletionIntent(
    intents.get(key),
    laneId,
    summary.version,
  );
  intents.set(key, intent);
  try {
    const result = await transport.control(
      laneId,
      intent.expectedVersion,
      action,
      intent,
    );
    intents.delete(key);
    return result;
  } catch (error) {
    // Read authoritative progress before any caller can offer another attempt.
    const observed = await transport.read(laneId).catch(() => null);
    if (
      observed &&
      ((action === "close" &&
        ["closing", "closed"].includes(observed.completion?.status ?? "")) ||
        (action === "complete" &&
          observed.completion?.cdr &&
          observed.completion.finalEvidenceHash))
    ) {
      intents.delete(key);
      return observed;
    }
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      [400, 403, 404, 409, 422].includes(Number(error.status))
    )
      intents.delete(key);
    throw error;
  }
}
