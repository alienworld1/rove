export type CompletionIntent = {
  commandId: string;
  correlationId: string;
  laneId: string;
  expectedVersion: number;
};

export function retainCompletionIntent(
  previous: CompletionIntent | undefined,
  laneId: string,
  expectedVersion: number,
): CompletionIntent {
  if (previous?.laneId === laneId) return previous;
  return {
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    laneId,
    expectedVersion,
  };
}
