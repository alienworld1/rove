import {
  presentationCursorSchema,
  type RealtimePresentationEvent,
} from "@rove/contracts";

export function parsePresentationCursor(value: string | undefined) {
  if (!value) return 0;
  const parsed = presentationCursorSchema.safeParse(value);
  return parsed.success ? Number(parsed.data) : null;
}

export function encodePresentationEvent(event: RealtimePresentationEvent) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
