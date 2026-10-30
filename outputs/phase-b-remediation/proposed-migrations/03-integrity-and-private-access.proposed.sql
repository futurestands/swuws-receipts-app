-- REVIEW ONLY. No role membership, login, IAM assignment, backfill or application activation.
-- Context is set LOCAL by the authenticated backend after EXISTING IAM/scope checks.
-- GUCs are NOT authentication. This NOLOGIN role must never be exposed to clients.
-- Existing bypass-RLS connection must NOT be used for this future runtime path.
CREATE ROLE swuws_history_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE FUNCTION swuws_history_context_ok(org text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(org=current_setting('swuws.history_organization_id',true)
  AND EXISTS (SELECT 1 FROM "user" u WHERE u.id=current_setting('swuws.history_actor_id',true) AND u.active=true),false)
$$;

CREATE FUNCTION swuws_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'History is immutable: append an explicitly reviewed revision'; END $$;

CREATE FUNCTION swuws_history_metric_ok(m jsonb, unit_name text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF m IS NULL OR jsonb_typeof(m)<>'object' OR m->>'unit' IS DISTINCT FROM unit_name
    OR length(coalesce(m->>'source',''))=0 OR jsonb_typeof(m->'dependencies') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF m->>'state'='AVAILABLE' THEN
    RETURN coalesce(jsonb_typeof(m->'value')='number' AND (m->>'value')::numeric >= 0 AND (m->>'value') NOT IN ('NaN','Infinity','-Infinity'), false);
 END IF;
 RETURN coalesce(m->>'state' IN ('MISSING','SOURCE_ERROR','UNRESOLVED_EXTERNAL','UNRESOLVED_DEPENDENCY')
   AND m->'value'='null'::jsonb AND length(coalesce(m->>'reason',''))>0,false);
END $$;

CREATE FUNCTION swuws_history_require_approval(event_id text, subject_column text, subject_id text, org text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e decision_support_review_event;
BEGIN
 SELECT * INTO STRICT e FROM decision_support_review_event WHERE id=event_id;
 IF e."organizationId"<>org OR e.decision<>'approve' OR to_jsonb(e)->>subject_column IS DISTINCT FROM subject_id
    OR EXISTS (SELECT 1 FROM decision_support_review_event n WHERE n."supersedesId"=e.id) THEN
   RAISE EXCEPTION 'An explicit current approval for this exact subject is required';
 END IF;
END $$;

CREATE FUNCTION swuws_history_require_baseline(baseline_id text, event_id text, org text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m scheme_capacity_baseline_source; b scheme_capacity_baseline;
BEGIN
 SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=baseline_id;
 IF b.completeness<>'complete' OR b."organizationId"<>org THEN RAISE EXCEPTION 'A complete approved baseline is required'; END IF;
 PERFORM swuws_history_require_approval(event_id,'baselineId',baseline_id,org);
 FOR m IN SELECT * FROM scheme_capacity_baseline_source WHERE "baselineId"=baseline_id LOOP
  PERFORM swuws_history_require_approval(m."assessmentApprovalId",'assessmentId',m."assessmentId",org);
 END LOOP;
END $$;

CREATE FUNCTION swuws_history_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text; owner_id text; parent jsonb; a source_capacity_assessment; b scheme_capacity_baseline;
 d scheme_target_definition_version; t scheme_target_period_assignment; p billing_period;
 r decision_support_report_snapshot; e decision_support_review_event; history report_generation_history;
 key text; units jsonb; required_code text; expected numeric; scheme_key text;
BEGIN
 actor:=current_setting('swuws.history_actor_id',true);
 scheme_key:=to_jsonb(NEW)->>'schemeId';
 IF current_user<>'swuws_history_runtime' THEN RAISE EXCEPTION 'Use the explicitly provisioned non-bypass history runtime role'; END IF;
 IF NOT swuws_history_context_ok(NEW."organizationId") OR actor IS NULL THEN RAISE EXCEPTION 'Authenticated scoped backend context required'; END IF;
 IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'History writes require a serializable transaction'; END IF;

 IF TG_TABLE_NAME IN ('source_capacity_assessment','scheme_capacity_baseline','scheme_target_period_assignment','decision_support_report_scheme_reference')
    OR (TG_TABLE_NAME='scheme_target_definition_version' AND scheme_key IS NOT NULL) THEN
  SELECT c."organizationId" INTO owner_id FROM water_scheme s JOIN branch br ON br.id=s."branchId" JOIN cluster c ON c.id=br."clusterId" WHERE s.id=scheme_key;
  IF owner_id IS DISTINCT FROM NEW."organizationId" THEN RAISE EXCEPTION 'Verified scheme ownership in the selected organisation is required'; END IF;
 END IF;
 IF TG_TABLE_NAME IN ('source_capacity_assessment','scheme_capacity_baseline','scheme_target_definition_version','scheme_target_period_assignment','decision_support_review_event') THEN
  NEW."recordedAt":=clock_timestamp();
  IF NEW."supersedesId" IS NOT NULL THEN
   EXECUTE format('SELECT to_jsonb(x) FROM %I x WHERE id=$1',TG_TABLE_NAME) INTO parent USING NEW."supersedesId";
   IF parent IS NULL OR NEW.revision IS DISTINCT FROM (parent->>'revision')::integer+1 THEN RAISE EXCEPTION 'Revision must follow its exact predecessor'; END IF;
  END IF;
 END IF;

 IF TG_TABLE_NAME='source_capacity_assessment' THEN
  IF NEW."capturedById"<>actor THEN RAISE EXCEPTION 'Capture actor must be authenticated'; END IF;
  IF NEW."assessedAt">NEW."recordedAt" OR (NEW.kind='documented_assessment' AND NEW."effectiveFrom"<(NEW."recordedAt" AT TIME ZONE 'Africa/Kampala')::date) THEN
   RAISE EXCEPTION 'Forward assessment cannot invent a future measurement or backdate effectivity'; END IF;
  IF NEW."effectiveFrom" IS NOT NULL AND NEW.kind='reference_evidence' AND NOT (NEW.provenance ? 'dateEvidence') THEN
   RAISE EXCEPTION 'A historical effective date requires explicit original evidence'; END IF;
  IF parent IS NOT NULL AND parent->>'effectiveFrom' IS NOT NULL AND NEW."effectiveFrom" IS NOT NULL AND NEW."effectiveFrom"<(parent->>'effectiveFrom')::date THEN
   RAISE EXCEPTION 'Assessment effective order cannot run backwards'; END IF;

 ELSIF TG_TABLE_NAME='scheme_capacity_baseline' THEN
  IF NEW."selectedById"<>actor THEN RAISE EXCEPTION 'Selection actor must be authenticated'; END IF;
  NEW."creationTransactionId":=txid_current();
  IF (SELECT count(DISTINCT x) FROM unnest(NEW."sourceRoster") x)<>NEW."expectedSourceCount" OR array_position(NEW."sourceRoster",NULL) IS NOT NULL THEN RAISE EXCEPTION 'Explicit source roster must be unique and nonnull'; END IF;

 ELSIF TG_TABLE_NAME='scheme_capacity_baseline_source' THEN
  SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=NEW."baselineId";
  SELECT * INTO STRICT a FROM source_capacity_assessment WHERE id=NEW."assessmentId";
  IF b."creationTransactionId"<>txid_current() OR NOT (NEW."sourceId"=ANY(b."sourceRoster")) THEN RAISE EXCEPTION 'Baseline membership is sealed and must match its explicit roster'; END IF;
  PERFORM swuws_history_require_approval(NEW."assessmentApprovalId",'assessmentId',a.id,NEW."organizationId");
  SELECT * INTO STRICT e FROM decision_support_review_event WHERE id=NEW."assessmentApprovalId";
  IF e."recordedAt">b."recordedAt" THEN RAISE EXCEPTION 'Assessment approval must exist before baseline selection'; END IF;
  IF b."selectionPolicy"='explicit_whole_month' AND a."effectiveFrom" IS NOT NULL AND a."effectiveFrom">b."periodMonth" THEN
   RAISE EXCEPTION 'Assessment effective date is after the baseline month; effective date must be on or before period Month';
  END IF;
  IF a."effectiveFrom" IS NULL OR (a."effectiveThrough" IS NOT NULL AND a."effectiveThrough"<(b."periodMonth"+interval '1 month - 1 day')::date) THEN
   RAISE EXCEPTION 'Assessment does not support the explicit whole-month period; no guessed dates or proration'; END IF;
  IF NOT a."sourceWasActive" THEN RAISE EXCEPTION 'Archived assessment cannot silently contribute an active-period denominator'; END IF;
  IF EXISTS (SELECT 1 FROM source_capacity_assessment n JOIN decision_support_review_event v ON v."assessmentId"=n.id
     WHERE n."sourceId"=a."sourceId" AND n.revision>a.revision AND n."effectiveFrom"<=b."periodMonth" AND n."recordedAt"<=b."recordedAt"
       AND v.decision='approve' AND v."recordedAt"<=b."recordedAt" AND NOT EXISTS (SELECT 1 FROM decision_support_review_event z WHERE z."supersedesId"=v.id AND z."recordedAt"<=b."recordedAt")) THEN
   RAISE EXCEPTION 'A newer approved assessment already supports this period; review an explicit correction'; END IF;
  IF (a.classification='ESTIMATE' AND b.classification<>'ESTIMATE') OR
     (a.classification='HISTORICAL_REFERENCE' AND b.classification NOT IN ('HISTORICAL_REFERENCE','ESTIMATE')) OR
     (a.classification='CONFIGURATION' AND b.classification NOT IN ('CONFIGURATION','HISTORICAL_REFERENCE','ESTIMATE')) OR
     (a.classification='UNAVAILABLE' AND b.completeness='complete') THEN RAISE EXCEPTION 'Baseline must preserve the limitations of its source evidence'; END IF;
  IF b.basis='calendar_days' THEN expected:=a."capacityM3Day"*b."dayCount";
  ELSIF b.basis='original_fixed_days' THEN
   IF a."benchmarkDays" IS DISTINCT FROM b."dayCount" THEN RAISE EXCEPTION 'Original benchmark-day evidence is required'; END IF;
   expected:=a."benchmarkCapacityM3Month";
  ELSE
   IF jsonb_typeof(NEW.provenance->'originalContributionM3') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Preserved contribution requires original numeric evidence'; END IF;
   expected:=(NEW.provenance->>'originalContributionM3')::numeric;
  END IF;
  IF NEW."contributionM3" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Contribution differs from the approved assessment and selected period basis'; END IF;

 ELSIF TG_TABLE_NAME='scheme_target_definition_version' THEN
  IF NEW."createdById"<>actor THEN RAISE EXCEPTION 'Definition actor must be authenticated'; END IF;
  IF parent IS NOT NULL AND parent->>'schemeId' IS NOT NULL AND NEW."schemeId" IS DISTINCT FROM parent->>'schemeId' THEN RAISE EXCEPTION 'Known scheme identity cannot be reassigned in a target lineage'; END IF;
  IF NEW."formulaVersion"<>'swuws-original-targets-v1' THEN RAISE EXCEPTION 'Unknown formula version requires a separately reviewed engine'; END IF;
  units:='{"monthlyCapacity":"m3/benchmark-month","mpsUtilisation":"fraction","tpsUtilisation":"fraction","mpsNrw":"fraction","tpsNrw":"fraction","mpsProduction":"m3/month-label","mpsSales":"m3/month-label","tariff":"UGX/m3","arrears":"UGX","collectionEfficiency":"fraction"}'::jsonb;
  FOR key IN SELECT jsonb_object_keys(units) LOOP
   IF NOT swuws_history_metric_ok(NEW.inputs->key,units->>key) THEN RAISE EXCEPTION 'Invalid, unclassified or incorrectly unit-labelled target input: %',key; END IF;
   IF coalesce(NEW."inputProvenance"->key->>'classification','') NOT IN ('ENGINEERING_ASSESSMENT','CONFIGURATION','HISTORICAL_BENCHMARK','MANAGEMENT_TARGET','VERIFIED_ACTUAL','ESTIMATE','UNAVAILABLE')
      OR jsonb_typeof(NEW."inputProvenance"->key->'evidence') IS DISTINCT FROM 'object' OR NEW."inputProvenance"->key->'evidence'='{}'::jsonb THEN RAISE EXCEPTION 'Input classification and evidence required: %',key; END IF;
   IF NEW.inputs->key->>'state'<>'AVAILABLE' AND NEW."inputProvenance"->key->>'classification'<>'UNAVAILABLE' THEN RAISE EXCEPTION 'Missing/error/external input cannot be labelled verified'; END IF;
   IF NEW."inputProvenance"->key->>'classification'='VERIFIED_ACTUAL' AND NOT (NEW."inputProvenance"->key->'evidence' ? 'recordIds' AND NEW."inputProvenance"->key->'evidence' ? 'periodEvidence') THEN RAISE EXCEPTION 'Verified actual input requires records and period evidence'; END IF;
  END LOOP;
  IF NEW.assumptions->'productionToSupplyLossFraction' IS DISTINCT FROM '0.05'::jsonb OR NEW.assumptions->'supplyToSalesLossFraction' IS DISTINCT FROM '0.25'::jsonb THEN
   RAISE EXCEPTION 'Original formula version requires its explicit 5 percent then 25 percent assumptions'; END IF;

 ELSIF TG_TABLE_NAME='scheme_target_period_assignment' THEN
  IF NEW."assignedById"<>actor THEN RAISE EXCEPTION 'Assignment actor must be authenticated'; END IF;
  SELECT bp.id,bp.year,bp.month INTO STRICT p.id,p.year,p.month FROM billing_period bp WHERE bp.id=NEW."billingPeriodId";
  IF NEW."periodMonth"<>make_date(p.year,p.month,1) THEN RAISE EXCEPTION 'Explicit billing-period identity and calendar month disagree'; END IF;
  SELECT * INTO STRICT d FROM scheme_target_definition_version WHERE id=NEW."targetDefinitionId";
  SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=NEW."baselineId";
  IF d."schemeId" IS DISTINCT FROM NEW."schemeId" OR d."organizationId"<>NEW."organizationId" THEN RAISE EXCEPTION 'Reference identity is not an approved scheme assignment'; END IF;
  PERFORM swuws_history_require_approval(NEW."definitionApprovalId",'targetDefinitionId',d.id,NEW."organizationId");
  PERFORM swuws_history_require_baseline(b.id,NEW."baselineApprovalId",NEW."organizationId");
  FOREACH key IN ARRAY ARRAY['monthlyCapacity','tpsUtilisation','tariff'] LOOP
   IF d.inputs->key->>'state' IS DISTINCT FROM 'AVAILABLE' OR NOT swuws_history_number_ok((d.inputs->key->>'value')::numeric) THEN RAISE EXCEPTION 'TPS assignment requires supported F, H and U inputs'; END IF;
  END LOOP;
  IF (d.inputs->'monthlyCapacity'->>'value')::numeric IS DISTINCT FROM b."capacityM3" THEN RAISE EXCEPTION 'Target F must retain the explicitly approved engineering benchmark basis'; END IF;
  IF NEW."schemeTargetId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scheme_target st WHERE st.id=NEW."schemeTargetId" AND st."schemeId"=NEW."schemeId" AND st."billingPeriodId"=NEW."billingPeriodId") THEN RAISE EXCEPTION 'Existing target projection belongs to a different scheme or period'; END IF;

 ELSIF TG_TABLE_NAME='decision_support_review_event' THEN
  IF NEW."reviewerId"<>actor THEN RAISE EXCEPTION 'Reviewer must be authenticated'; END IF;
  IF parent IS NOT NULL AND (parent->>'organizationId' IS DISTINCT FROM NEW."organizationId" OR parent->>'assessmentId' IS DISTINCT FROM NEW."assessmentId" OR parent->>'baselineId' IS DISTINCT FROM NEW."baselineId" OR parent->>'targetDefinitionId' IS DISTINCT FROM NEW."targetDefinitionId" OR parent->>'targetAssignmentId' IS DISTINCT FROM NEW."targetAssignmentId") THEN RAISE EXCEPTION 'Review revision cannot change subject'; END IF;
  IF NEW.decision='revoke' AND (parent IS NULL OR parent->>'decision'<>'approve') THEN RAISE EXCEPTION 'Revocation must follow an approval'; END IF;
  required_code:='production.capacity.approve';
  IF NEW."assessmentId" IS NOT NULL THEN
   SELECT * INTO STRICT a FROM source_capacity_assessment WHERE id=NEW."assessmentId";
   owner_id:=a."organizationId";
   IF actor=a."capturedById" OR actor=a."responsibleOfficerId" THEN RAISE EXCEPTION 'Independent assessment approval required'; END IF;
  ELSIF NEW."baselineId" IS NOT NULL THEN
   SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=NEW."baselineId"; owner_id:=b."organizationId";
   IF actor=b."selectedById" THEN RAISE EXCEPTION 'Independent baseline approval required'; END IF;
  ELSIF NEW."targetDefinitionId" IS NOT NULL THEN
   required_code:='decision_support.targets.approve';
   SELECT * INTO STRICT d FROM scheme_target_definition_version WHERE id=NEW."targetDefinitionId"; owner_id:=d."organizationId";
   IF actor=d."createdById" THEN RAISE EXCEPTION 'Independent target approval required'; END IF;
  ELSE
   required_code:='decision_support.targets.approve';
   SELECT * INTO STRICT t FROM scheme_target_period_assignment WHERE id=NEW."targetAssignmentId"; owner_id:=t."organizationId";
   SELECT * INTO STRICT d FROM scheme_target_definition_version WHERE id=t."targetDefinitionId";
   IF actor=t."assignedById" OR actor=d."createdById" THEN RAISE EXCEPTION 'Independent period-assignment approval required'; END IF;
  END IF;
  IF owner_id<>NEW."organizationId" OR NEW."authorizationEvidence"->>'permissionCode' IS DISTINCT FROM required_code THEN RAISE EXCEPTION 'Review organisation/permission assertion disagrees with subject'; END IF;

 ELSIF TG_TABLE_NAME='decision_support_report_snapshot' THEN
  SELECT h."generatedById",h."periodId",h."createdAt" INTO STRICT history."generatedById",history."periodId",history."createdAt" FROM report_generation_history h WHERE h.id=NEW."reportId";
  IF history."createdAt" IS DISTINCT FROM transaction_timestamp()::timestamp THEN RAISE EXCEPTION 'Existing report history cannot be backfilled by this path'; END IF;
  SELECT bp.id,bp.year,bp.month INTO STRICT p.id,p.year,p.month FROM billing_period bp WHERE bp.id=NEW."billingPeriodId";
  IF history."generatedById" IS DISTINCT FROM actor OR NEW."generatedById"<>actor OR history."periodId" IS DISTINCT FROM NEW."billingPeriodId" OR NEW."periodMonth"<>make_date(p.year,p.month,1) THEN RAISE EXCEPTION 'Report identity, actor and real period must agree'; END IF;
  NEW."recordedAt":=clock_timestamp(); NEW."actualsAsOf":=transaction_timestamp(); NEW."creationTransactionId":=txid_current();
  NEW."payloadSha256":=encode(sha256(convert_to(NEW.payload::text,'UTF8')),'hex');
  IF (SELECT count(DISTINCT x) FROM unnest(NEW."schemeRoster") x)<>NEW."expectedSchemeCount" OR array_position(NEW."schemeRoster",NULL) IS NOT NULL THEN RAISE EXCEPTION 'Report scheme roster must be unique and nonnull'; END IF;
  IF NEW.payload->>'collectionBasis' IS DISTINCT FROM 'verified_receipts' AND NEW.payload->'measurementProvenance'->'collections'->>'classification'='VERIFIED_ACTUAL' THEN RAISE EXCEPTION 'Balance inference cannot become verified cash'; END IF;

 ELSE -- report scheme membership
  SELECT * INTO STRICT r FROM decision_support_report_snapshot WHERE "reportId"=NEW."reportId";
  IF r."creationTransactionId"<>txid_current() OR NOT (NEW."schemeId"=ANY(r."schemeRoster")) THEN RAISE EXCEPTION 'Report membership is sealed and must match the scoped roster'; END IF;
  IF NEW."capacityState"='PINNED' THEN PERFORM swuws_history_require_baseline(NEW."baselineId",NEW."baselineApprovalId",NEW."organizationId"); END IF;
  IF NEW."targetState"='PINNED' THEN
   PERFORM swuws_history_require_approval(NEW."assignmentApprovalId",'targetAssignmentId',NEW."targetAssignmentId",NEW."organizationId");
   SELECT * INTO STRICT t FROM scheme_target_period_assignment WHERE id=NEW."targetAssignmentId";
   PERFORM swuws_history_require_approval(t."definitionApprovalId",'targetDefinitionId',t."targetDefinitionId",NEW."organizationId");
   PERFORM swuws_history_require_baseline(t."baselineId",t."baselineApprovalId",NEW."organizationId");
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION swuws_history_membership_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b scheme_capacity_baseline; r decision_support_report_snapshot; target text; n integer; known integer; total numeric;
BEGIN
 IF TG_TABLE_NAME IN ('scheme_capacity_baseline','scheme_capacity_baseline_source') THEN
  IF TG_TABLE_NAME='scheme_capacity_baseline' THEN target:=NEW.id; ELSE target:=NEW."baselineId"; END IF;
  SELECT * INTO STRICT b FROM scheme_capacity_baseline WHERE id=target;
  SELECT count(*),count("contributionM3"),sum("contributionM3") INTO n,known,total FROM scheme_capacity_baseline_source WHERE "baselineId"=target;
  IF n<>b."expectedSourceCount" OR (b.completeness='complete' AND (known<>n OR total IS DISTINCT FROM b."capacityM3")) THEN RAISE EXCEPTION 'Baseline roster/contribution total is incomplete'; END IF;
 ELSE
  target:=NEW."reportId";
  SELECT * INTO STRICT r FROM decision_support_report_snapshot WHERE "reportId"=target;
  SELECT count(*) INTO n FROM decision_support_report_scheme_reference WHERE "reportId"=target;
  IF n<>r."expectedSchemeCount" THEN RAISE EXCEPTION 'Report scoped scheme references are incomplete'; END IF;
 END IF;
 RETURN NULL;
END $$;

DO $$ DECLARE relation_name text; BEGIN
 FOREACH relation_name IN ARRAY ARRAY['source_capacity_assessment','scheme_capacity_baseline','scheme_capacity_baseline_source','scheme_target_definition_version','scheme_target_period_assignment','decision_support_review_event','decision_support_report_snapshot','decision_support_report_scheme_reference'] LOOP
  EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION swuws_history_immutable()',relation_name);
  EXECUTE format('CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION swuws_history_immutable()',relation_name);
  EXECUTE format('CREATE TRIGGER history_insert_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION swuws_history_insert_guard()',relation_name);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation_name);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',relation_name); END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',relation_name); END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE format('REVOKE ALL ON %I FROM service_role',relation_name); END IF;
  EXECUTE format('GRANT SELECT, INSERT ON %I TO swuws_history_runtime',relation_name);
  EXECUTE format('CREATE POLICY history_read ON %I FOR SELECT TO swuws_history_runtime USING (swuws_history_context_ok("organizationId"))',relation_name);
  EXECUTE format('CREATE POLICY history_append ON %I FOR INSERT TO swuws_history_runtime WITH CHECK (swuws_history_context_ok("organizationId"))',relation_name);
 END LOOP;
END $$;
CREATE CONSTRAINT TRIGGER history_baseline_complete AFTER INSERT ON scheme_capacity_baseline DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION swuws_history_membership_check();
CREATE CONSTRAINT TRIGGER history_baseline_members_complete AFTER INSERT ON scheme_capacity_baseline_source DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION swuws_history_membership_check();
CREATE CONSTRAINT TRIGGER history_report_complete AFTER INSERT ON decision_support_report_snapshot DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION swuws_history_membership_check();
CREATE CONSTRAINT TRIGGER history_report_members_complete AFTER INSERT ON decision_support_report_scheme_reference DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION swuws_history_membership_check();
