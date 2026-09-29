import type { RealtimePresentationEvent } from "@rove/contracts";

export function parsePresentationCursor(value: string | undefined) {
  if (!value) return 0;
  if (!/^[0-9]{1,18}$/.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : null;
}

export function encodePresentationEvent(event: RealtimePresentationEvent) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
