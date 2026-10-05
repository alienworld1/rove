import { z } from "zod";
export * from "./charging.ts";
export * from "./corridor.ts";
export * from "./corridor-copy.ts";
export * from "./corridor-geometry.ts";
export * from "./lab.ts";
export * from "./hosted.ts";

export const readinessSchema = z.object({
  status: z.enum(["checking", "ready", "blocked"]),
  engineReachable: z.boolean(),
  reasonCode: z.string().optional(),
  checkedAt: z.iso.datetime(),
  dependencies: z.object({ web: z.string(), engine: z.string() }),
});

export type Readiness = z.infer<typeof readinessSchema>;

export const integrationStatusSchema = z.object({
  environment: z.literal("development"),
  paymentConfigured: z.boolean(),
  evidenceConfigured: z.boolean(),
});

export * from "./completion.ts";

export * from "./lab-authoring.ts";
