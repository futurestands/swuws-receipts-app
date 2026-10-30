# Persistence draft inventory

Static inspection only. No SQL was executed. No registered Phase B migration, Drizzle mapping, target-version DDL or report-baseline foreign key exists. The two existing SQL review drafts remain unmodified under `outputs/phase-a-baseline-proposal/`.

Counts: 3 proposed tables, 25 CHECK constraints, 9 foreign keys, 3 primary keys, 6 table/inline UNIQUE constraints, 2 explicitly named indexes, 4 functions and 11 triggers. The three primary keys and six UNIQUE constraints imply nine additional unique indexes if deployed. PostgreSQL has not assigned actual names to unnamed constraints/indexes in this review.

Every column definition below includes its exact type, nullability, default and inline constraints. The subsequent table constraints complete the inventory. SQL text is reproduced as evidence, not as an approved migration.

## source_capacity_assessment

Draft starts at schema-draft.sql:9.

| Column | Exact definition after name |
| --- | --- |
| id | `text PRIMARY KEY` |
| "sourceId" | `text NOT NULL` |
| "schemeId" | `text NOT NULL` |
| "sourceVersion" | `integer NOT NULL CHECK ("sourceVersion" > 0)` |
| "assessmentKind" | `text NOT NULL CHECK ("assessmentKind" IN ('legacy_snapshot','new_assessment'))` |
| "supersedesId" | `text UNIQUE` |
| methodology | `text NOT NULL CHECK (length(trim(methodology)) > 0)` |
| "methodologyVersion" | `text NOT NULL` |
| "assessedAt" | `timestamptz` |
| "effectiveFrom" | `date` |
| "recordedAt" | `timestamptz NOT NULL DEFAULT clock_timestamp()` |
| "responsibleOfficerId" | `text REFERENCES "user"(id) ON DELETE RESTRICT` |
| "capturedById" | `text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT` |
| "recordedInstalledPumpCapacityM3Hr" | `numeric` |
| "measuredCapacityM3Hr" | `numeric` |
| "regimeHoursPerDay" | `numeric` |
| "capacityM3Day" | `numeric` |
| "benchmarkCapacityM3Month" | `numeric` |
| "benchmarkDays" | `integer CHECK ("benchmarkDays" > 0)` |
| "sourceWasActive" | `boolean NOT NULL` |
| assumptions | `jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object')` |
| provenance | `jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb)` |
| "originalSourceRow" | `jsonb` |

Table constraints:

1. `UNIQUE(id,"sourceId","schemeId")`
2. `FOREIGN KEY ("sourceId","schemeId") REFERENCES water_scheme_source(id,"schemeId") ON DELETE RESTRICT`
3. `FOREIGN KEY ("supersedesId","sourceId","schemeId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId") ON DELETE RESTRICT`
4. `CHECK (engineering_capacity_number_ok("recordedInstalledPumpCapacityM3Hr") AND engineering_capacity_number_ok("measuredCapacityM3Hr") AND engineering_capacity_number_ok("capacityM3Day") AND engineering_capacity_number_ok("benchmarkCapacityM3Month"))`
5. `CHECK ("regimeHoursPerDay" IS NULL OR (engineering_capacity_number_ok("regimeHoursPerDay") AND "regimeHoursPerDay" <= 24))`
6. `CHECK (("assessmentKind" = 'legacy_snapshot' AND "effectiveFrom" IS NULL AND "assessedAt" IS NULL AND "measuredCapacityM3Hr" IS NULL AND "benchmarkDays" IS NULL AND "originalSourceRow" IS NOT NULL) OR ("assessmentKind" = 'new_assessment' AND "effectiveFrom" IS NOT NULL AND "assessedAt" IS NOT NULL AND "responsibleOfficerId" IS NOT NULL AND "originalSourceRow" IS NULL))`
7. `CHECK ("originalSourceRow" IS NULL OR jsonb_typeof("originalSourceRow") = 'object')`

## scheme_capacity_baseline

Draft starts at schema-draft.sql:48.

| Column | Exact definition after name |
| --- | --- |
| id | `text PRIMARY KEY` |
| "schemeId" | `text NOT NULL REFERENCES water_scheme(id) ON DELETE RESTRICT` |
| "periodMonth" | `date NOT NULL CHECK (extract(day FROM "periodMonth") = 1)` |
| revision | `integer NOT NULL CHECK (revision > 0)` |
| "supersedesId" | `text UNIQUE` |
| basis | `text NOT NULL CHECK (basis IN ('original_fixed_days','calendar_days','preserved_report'))` |
| "dayCount" | `integer CHECK ("dayCount" BETWEEN 1 AND 366)` |
| "capacityM3" | `numeric CHECK (engineering_capacity_number_ok("capacityM3"))` |
| completeness | `text NOT NULL CHECK (completeness IN ('complete','incomplete','unknown'))` |
| "expectedSourceCount" | `integer NOT NULL CHECK ("expectedSourceCount" > 0)` |
| "selectedById" | `text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT` |
| "recordedAt" | `timestamptz NOT NULL DEFAULT clock_timestamp()` |
| "creationTransactionId" | `bigint NOT NULL DEFAULT txid_current()` |
| reason | `text NOT NULL CHECK (length(trim(reason)) > 0)` |
| assumptions | `jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'object')` |
| provenance | `jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb)` |

Table constraints:

1. `UNIQUE("schemeId","periodMonth",revision)`
2. `UNIQUE(id,"schemeId")`
3. `UNIQUE(id,"schemeId","periodMonth")`
4. `FOREIGN KEY ("supersedesId","schemeId","periodMonth") REFERENCES scheme_capacity_baseline(id,"schemeId","periodMonth") ON DELETE RESTRICT`
5. `CHECK ((revision = 1 AND "supersedesId" IS NULL) OR (revision > 1 AND "supersedesId" IS NOT NULL))`
6. `CHECK ((completeness='complete' AND "capacityM3" IS NOT NULL) OR (completeness<>'complete' AND "capacityM3" IS NULL))`
7. `CHECK (basis='preserved_report' OR "dayCount" IS NOT NULL)`

## scheme_capacity_baseline_source

Draft starts at schema-draft.sql:74.

| Column | Exact definition after name |
| --- | --- |
| "baselineId" | `text NOT NULL` |
| "schemeId" | `text NOT NULL` |
| "sourceId" | `text NOT NULL` |
| "assessmentId" | `text NOT NULL` |
| "contributionM3" | `numeric CHECK (engineering_capacity_number_ok("contributionM3"))` |
| provenance | `jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object' AND provenance <> '{}'::jsonb)` |

Table constraints:

1. `PRIMARY KEY ("baselineId","sourceId")`
2. `FOREIGN KEY ("baselineId","schemeId") REFERENCES scheme_capacity_baseline(id,"schemeId") ON DELETE RESTRICT`
3. `FOREIGN KEY ("assessmentId","sourceId","schemeId") REFERENCES source_capacity_assessment(id,"sourceId","schemeId") ON DELETE RESTRICT`

## Explicit indexes

- `CREATE UNIQUE INDEX source_capacity_legacy_version_unq ON source_capacity_assessment("sourceId","sourceVersion") WHERE "assessmentKind"='legacy_snapshot';`
- `CREATE INDEX source_capacity_effective_idx ON source_capacity_assessment("sourceId","effectiveFrom");`

## Implicit unique indexes

- source_capacity_assessment: primary key (id); UNIQUE (supersedesId); UNIQUE (id, sourceId, schemeId).
- scheme_capacity_baseline: primary key (id); UNIQUE (supersedesId); UNIQUE (schemeId, periodMonth, revision); UNIQUE (id, schemeId); UNIQUE (id, schemeId, periodMonth).
- scheme_capacity_baseline_source: primary key (baselineId, sourceId).

## Functions

- `engineering_capacity_number_ok`, schema-draft.sql:4.
- `engineering_capacity_immutable`, schema-draft.sql:86.
- `engineering_capacity_insert_guard`, schema-draft.sql:96.
- `engineering_capacity_baseline_check`, schema-draft.sql:124.

## Triggers

- `source_assessment_immutable BEFORE UPDATE OR DELETE ON source_capacity_assessment FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable()`
- `source_assessment_no_truncate BEFORE TRUNCATE ON source_capacity_assessment FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable()`
- `scheme_baseline_immutable BEFORE UPDATE OR DELETE ON scheme_capacity_baseline FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable()`
- `scheme_baseline_no_truncate BEFORE TRUNCATE ON scheme_capacity_baseline FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable()`
- `baseline_source_immutable BEFORE UPDATE OR DELETE ON scheme_capacity_baseline_source FOR EACH ROW EXECUTE FUNCTION engineering_capacity_immutable()`
- `baseline_source_no_truncate BEFORE TRUNCATE ON scheme_capacity_baseline_source FOR EACH STATEMENT EXECUTE FUNCTION engineering_capacity_immutable()`
- `assessment_insert_guard BEFORE INSERT ON source_capacity_assessment FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard()`
- `baseline_insert_guard BEFORE INSERT ON scheme_capacity_baseline FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard()`
- `baseline_source_insert_guard BEFORE INSERT ON scheme_capacity_baseline_source FOR EACH ROW EXECUTE FUNCTION engineering_capacity_insert_guard()`
- `baseline_consistent AFTER INSERT ON scheme_capacity_baseline DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engineering_capacity_baseline_check()`
- `baseline_source_consistent AFTER INSERT ON scheme_capacity_baseline_source DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION engineering_capacity_baseline_check()`

## Grants and registration

`REVOKE ALL ON source_capacity_assessment,scheme_capacity_baseline,scheme_capacity_baseline_source FROM PUBLIC` is the only grant statement. No ENABLE ROW LEVEL SECURITY, organisation ownership column, deployment-role grant or application writer is supplied. Existing service scope enforcement must be reused and verified before deployment.

`db/migrate.js` discovers only db/migrations/*.sql. Neither schema-draft.sql nor legacy-capture-draft.sql is registered there. No new migration number is assigned. The legacy capture draft performs INSERT SELECT and a verification block; it is historical population, not harmless DDL, and must not run under this review.

## Required design corrections or proofs before approval

- Effective-period membership: no constraint links assessment.effectiveFrom to baseline.periodMonth. Same-source/same-scheme FKs are not an effective-date policy. Define whole-month selection versus dated segments, explicit approval and report-version pinning before implementing either.
- Derivation: a complete baseline must equal its source contributions, but contributions are not constrained to assessment capacities, selected units, activity, day count or effective intervals. A canonical reviewed calculation and provenance contract are required.
- Calendar basis: dayCount accepts 1–366 and is not checked against the selected calendar month. Original fixed-day and preserved-report bases must remain separate.
- Assessment lineage: no source-assessment guard requires a predecessor, rejects a self-predecessor, validates effective-date ordering, or uniquely versions new assessments by sourceVersion. Existing UNIQUE supersedesId prevents a fork only when a predecessor is supplied. Negative SQL tests are required in a separately approved disposable environment.
- Report pinning: there is no reportGenerationHistory.baselineId FK or immutable report-to-baseline link table. A metadata label is not a pinned selection. No MPS/TPS target-version/approval/period schema is specified.
- Provenance JSON checks enforce nonempty-object shape, not required evidence fields. Methodology version can be empty; new-assessment capacity values can remain null. These states require explicit service validation and unavailable-state reporting, not invented values.
- Scope: source, scheme and officer FKs do not enforce that the authenticated actor is authorised for that organisation or scheme. REVOKE PUBLIC does not establish application-role permissions or RLS safety.
- FK impact: ON DELETE RESTRICT will block deletion of referenced users, source identities and schemes after rows exist. Soft source archive remains possible. Review cleanup/deletion paths and audit retention before migration approval.

None of these findings is an approved schema change. The existing draft is preserved, and no SQL was run to test hypothetical counterexamples in this review.
