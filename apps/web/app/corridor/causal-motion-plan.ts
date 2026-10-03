export function causalMotionPlan({
  now,
  evidenceReadyAt,
  acceptedEvidence,
  recovering,
  paused,
  inspecting,
}: {
  now: number;
  evidenceReadyAt: number;
  acceptedEvidence: boolean;
  recovering: boolean;
  paused: boolean;
  inspecting: boolean;
}) {
  const readyAt = acceptedEvidence ? now + 380 : evidenceReadyAt;
  const remaining = (offset: number) => Math.max(0, readyAt + offset - now);
  const disabled = paused || inspecting || readyAt === 0;
  return {
    evidenceReadyAt: readyAt,
    frontierDelay: disabled ? 0 : remaining(0),
    riskDelay: disabled ? 0 : remaining(120),
    physicalDelay: disabled ? 0 : remaining(recovering ? 240 : 120),
    boundaryDelay: disabled ? 0 : remaining(recovering ? 180 : 0),
  };
}
