import type { CorridorOperatingView } from "@rove/contracts";

export function reconcileCorridorView(
  previous: unknown,
  next: unknown,
): CorridorOperatingView {
  const incoming = next as CorridorOperatingView;
  const current = previous as CorridorOperatingView | undefined;
  if (
    current?.corridor.id === incoming.corridor.id &&
    current.projectionVersion > incoming.projectionVersion
  )
    return current;
  return incoming;
}
