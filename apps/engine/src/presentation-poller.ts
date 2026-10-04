import type { RealtimePresentationEvent } from "@rove/contracts";

// Subscribers at the same or a later cursor share the current Corridor read.
export class PresentationPoller {
  private reads = new Map<
    string,
    {
      cursor: number;
      expires: number;
      value: Promise<{
        events: RealtimePresentationEvent[];
        runVersion: number | null | undefined;
      }>;
    }
  >();
  constructor(
    private events: (
      corridorId: string,
      cursor: number,
    ) => Promise<RealtimePresentationEvent[]>,
    private version: (runId: string) => Promise<number | null | undefined>,
  ) {}
  read(corridorId: string, cursor: number, runId: string | null) {
    const key = `${corridorId}:${runId ?? ""}`;
    const current = this.reads.get(key);
    if (current && current.expires > Date.now() && cursor >= current.cursor)
      return current.value.then((value) => ({
        ...value,
        events: value.events.filter((event) => Number(event.id) > cursor),
      }));
    const value = Promise.all([
      this.events(corridorId, cursor),
      runId ? this.version(runId) : Promise.resolve(null),
    ]).then(([events, runVersion]) => ({ events, runVersion }));
    this.reads.set(key, { cursor, expires: Date.now() + 1000, value });
    for (const [other, entry] of this.reads)
      if (entry.expires < Date.now() && other !== key) this.reads.delete(other);
    return value;
  }
}
