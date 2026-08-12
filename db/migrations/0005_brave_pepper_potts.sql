ALTER TABLE "billing_record" ADD COLUMN "recoveryAmount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_record" ADD COLUMN "arrearsRecovery" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_run" ADD COLUMN "totalRecovered" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_run" ADD COLUMN "arrearsRecovered" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_collection_import" ADD COLUMN "billingPeriodId" text;--> statement-breakpoint
ALTER TABLE "daily_collection_import" ADD CONSTRAINT "daily_collection_import_billingPeriodId_billing_period_id_fk" FOREIGN KEY ("billingPeriodId") REFERENCES "public"."billing_period"("id") ON DELETE set null ON UPDATE no action;