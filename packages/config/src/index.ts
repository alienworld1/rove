import { z } from "zod";

const localUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol);
}, "Use an HTTP or HTTPS URL");

const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  ENGINE_ORIGIN: localUrl.default("http://127.0.0.1:4100"),
  ENGINE_HOST: z.string().min(1).default("127.0.0.1"),
  ENGINE_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  DATABASE_URL: z.url().optional(),
  DEMO_SESSION_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[0-9a-fA-F]{48,}$/)
      .optional(),
  ),
});

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Use a 20-byte address");
const privateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Use a 32-byte signer key");

const paymentSchema = z.object({
  TEMPO_RPC_URL: localUrl,
  TEMPO_CHAIN_ID: z.coerce.number().int().positive(),
  TEMPO_ASSET_ADDRESS: address,
  TEMPO_ASSET_DECIMALS: z.coerce.number().int().min(0).max(36),
  TEMPO_SESSION_BACKEND: z.enum(["precompile", "contract"]),
  TEMPO_PAYER_ADDRESS: address,
  TEMPO_PAYEE_ADDRESS: address,
  TEMPO_PAYER_PRIVATE_KEY: privateKey,
  TEMPO_PAYEE_PRIVATE_KEY: privateKey,
  TEMPO_VOUCHER_SIGNER_ADDRESS: address,
  TEMPO_VOUCHER_SIGNER_PRIVATE_KEY: privateKey,
  TEMPO_INITIAL_DEPOSIT: z.string().regex(/^[1-9][0-9]*$/),
  TEMPO_TOP_UP_AMOUNT: z.string().regex(/^[1-9][0-9]*$/),
  TEMPO_FIRST_VOUCHER_AMOUNT: z.string().regex(/^[1-9][0-9]*$/),
  TEMPO_SECOND_VOUCHER_AMOUNT: z.string().regex(/^[1-9][0-9]*$/),
});

const paymentProbeSchema = paymentSchema.pick({
  TEMPO_RPC_URL: true,
  TEMPO_CHAIN_ID: true,
  TEMPO_ASSET_ADDRESS: true,
});

const evidenceSchema = z.object({
  EVIDENCE_PROFILE_ID: z.literal("ocmf-secp256r1-sha256"),
  EVIDENCE_METER_ID: z.string().min(1).max(128),
  EVIDENCE_SESSION_ID: z.string().min(1).max(128),
  EVIDENCE_PUBLIC_KEY_HEX: z
    .string()
    .min(128)
    .max(400)
    .regex(/^[0-9a-fA-F]+$/),
  EVIDENCE_MAX_AGE_MS: z.coerce.number().int().positive(),
});

function parseSettings<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(env);
  if (result.success) return result.data;
  const fields = result.error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");
  throw new Error(`CONFIG_INVALID: Check the service settings: ${fields}`);
}

export function readBaseConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseSettings(baseSchema, env);
}

export function readPaymentConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseSettings(paymentSchema, env);
}

export function readPaymentProbeConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseSettings(paymentProbeSchema, env);
}

export function readEvidenceConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseSettings(evidenceSchema, env);
}

export function proofPrerequisites(env: NodeJS.ProcessEnv = process.env) {
  return {
    paymentConfigured: paymentSchema.safeParse(env).success,
    evidenceConfigured: evidenceSchema.safeParse(env).success,
  };
}

const accountingSchema = z.object({
  CDR_CURRENCY: z.string().regex(/^[A-Z]{3}$/),
  CDR_SETTLEMENT_ASSET_ID: z.string().min(1).max(128),
  CDR_SOURCE_PARTY_ID: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
});
export function readAccountingConfig(env: NodeJS.ProcessEnv = process.env) {
  return parseSettings(accountingSchema, env);
}
