import { z } from "zod";
import { idSchema } from "./charging.ts";

export const inviteRedemptionSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{32,128}$/),
  })
  .strict();
export const hostedScenarioRefSchema = z
  .object({
    scenarioId: idSchema,
    scenarioDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export const hostedStartSchema = z
  .object({ runId: z.uuid(), scenario: hostedScenarioRefSchema.optional() })
  .strict();
export const hostedQuoteSchema = z
  .object({
    funding: z.string().regex(/^\d+$/),
    fees: z.string().regex(/^\d+$/),
    assetDecimals: z.number().int(),
    asset: z.string(),
    remainingRuns: z.number().int(),
    maxTransactions: z.number().int(),
  })
  .strict();
export const hostedSessionSchema = z
  .object({
    authenticated: z.boolean(),
    expiresAt: z.iso.datetime().nullable(),
    canRun: z.boolean(),
    remainingRuns: z.number().int().nonnegative(),
    runs: z.array(
      z.object({
        id: idSchema,
        status: z.string(),
        createdAt: z.iso.datetime(),
      }),
    ),
  })
  .strict();
export type HostedSession = z.infer<typeof hostedSessionSchema>;
export const publishedRunSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1).max(160),
    description: z.string().max(500),
    publishedAt: z.iso.datetime(),
    payment: z.string(),
  })
  .strict();
export type PublishedRun = z.infer<typeof publishedRunSchema>;
