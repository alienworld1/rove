ALTER TABLE "tempo_vouchers" ALTER COLUMN "digest" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ALTER COLUMN "signature" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ALTER COLUMN "verified_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD COLUMN "verification_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "tempo_vouchers" ADD CONSTRAINT "verified_voucher_has_proof" CHECK ("tempo_vouchers"."verification_status" <> 'verified' or ("tempo_vouchers"."digest" is not null and "tempo_vouchers"."signature" is not null and "tempo_vouchers"."verified_at" is not null));