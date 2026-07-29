-- Finding 7 Fix: Add missing foreign key for template active version
ALTER TABLE "managed_template" ADD CONSTRAINT "managed_template_activeVersionId_template_version_id_fk" FOREIGN KEY ("activeVersionId") REFERENCES "public"."template_version"("id") ON DELETE set null ON UPDATE no action;
