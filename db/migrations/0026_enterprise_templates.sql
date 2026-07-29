CREATE TABLE "managed_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"activeVersionId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "managed_template_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "template_version" (
	"id" text PRIMARY KEY NOT NULL,
	"templateId" text NOT NULL,
	"versionNumber" integer NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"changelog" text,
	"createdById" text NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_templateId_managed_template_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."managed_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_code_idx" ON "managed_template" USING btree ("code");--> statement-breakpoint
CREATE INDEX "template_category_idx" ON "managed_template" USING btree ("category");--> statement-breakpoint
CREATE INDEX "version_template_idx" ON "template_version" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX "version_status_idx" ON "template_version" USING btree ("status");