export const motionPresets = {
  direct: { tension: 420, friction: 38, clamp: true },
  structural: { tension: 240, friction: 34, clamp: true },
  propagate: { tension: 300, friction: 32, clamp: true },
  interlock: { tension: 460, friction: 54, clamp: true },
  recover: { tension: 220, friction: 36, clamp: true },
} as const;
