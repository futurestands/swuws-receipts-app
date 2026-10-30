-- APPROVAL REQUIRED: copying existing source values into historical snapshot rows.
-- REVIEW DRAFT, ONLY RUN BY THE ISOLATED PROOF USING SYNTHETIC ROWS.
-- Caller must begin a transaction, lock water_scheme_source IN SHARE MODE,
-- and SET LOCAL swuws.capture_officer_id = a verified responsible capture actor.
-- Existing confirmation officer is retained; NULL remains unknown. Capture actor
-- is provenance of preservation, not an invented original assessing officer.
INSERT INTO source_capacity_assessment (
 id,"sourceId","schemeId","sourceVersion","assessmentKind",methodology,"methodologyVersion",
 "responsibleOfficerId","capturedById","recordedInstalledPumpCapacityM3Hr","regimeHoursPerDay",
 "capacityM3Day","benchmarkCapacityM3Month","sourceWasActive",assumptions,provenance,"originalSourceRow"
)
SELECT 'legacy-source:'||s.id||':v'||s.version,s.id,s."schemeId",s.version,'legacy_snapshot',
 s."capacityMethod",'legacy-as-stored',s."capacityConfirmedById",current_setting('swuws.capture_officer_id'),
 s."installedPumpCapacityM3Hr",s."regimeHoursPerDay",s."currentCapacityM3Day",s."practicalCapacityM3Month",s.active,
 jsonb_build_object('effectiveDate','unknown','benchmarkDays','unknown','measurementInterpretation','unverified legacy field semantics'),
 jsonb_build_object('table','water_scheme_source','id',s.id,'version',s.version,'capturePurpose','preserve verbatim; no historical period assignment'),to_jsonb(s)
FROM water_scheme_source s
WHERE NOT EXISTS (SELECT 1 FROM source_capacity_assessment a WHERE a."sourceId"=s.id AND a."sourceVersion"=s.version AND a."assessmentKind"='legacy_snapshot');

-- Fail on drift/conflicting prior capture instead of silently accepting changed values.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM water_scheme_source s LEFT JOIN source_capacity_assessment a
   ON a."sourceId"=s.id AND a."sourceVersion"=s.version AND a."assessmentKind"='legacy_snapshot'
   WHERE a.id IS NULL OR a."originalSourceRow" IS DISTINCT FROM to_jsonb(s)
     OR a."capacityM3Day" IS DISTINCT FROM s."currentCapacityM3Day"
     OR a."benchmarkCapacityM3Month" IS DISTINCT FROM s."practicalCapacityM3Month") THEN
  RAISE EXCEPTION 'Legacy capacity capture does not exactly match existing source rows';
 END IF;
END $$;
