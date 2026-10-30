import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Pool } from "pg"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { productionTestDatabaseUrl } from "@/lib/production/test-database"

const migration = (name: string) => readFileSync(`db/migrations/${name}`, "utf8")
const proposedSql = (name: string) => readFileSync(`outputs/phase-b-remediation/proposed-migrations/${name}`, "utf8")

const namespace = `history_it_${randomUUID().replaceAll("-", "")}`
let pool: Pool
let adminPool: Pool

beforeAll(async () => {
  const url = productionTestDatabaseUrl()
  if (url.includes("supabase.com")) {
    throw new Error("SAFETY GUARD: Refusing to run disposable test suite against Supabase remote host")
  }

  adminPool = new Pool({ connectionString: url, max: 1 })
  await adminPool.query(`CREATE SCHEMA ${namespace}`)
  pool = new Pool({ connectionString: url, max: 6, options: `-c search_path=${namespace} -c statement_timeout=10000` })

  // Apply base migrations 0001 through 0072
  for (const name of [
    "0001_init.sql",
    "0002_immutability.sql",
    "0003_audit_log_immutability.sql",
    "0005_customer_and_scheme_management.sql",
    "0008_rbac_foundation.sql",
    "0009_billing_module.sql",
    "0013_collection_period_lifecycle.sql",
    "0015_iam_module.sql",
    "0025_meter_reading_module.sql",
    "0061_swuws_intelligence.sql",
    "0064_ebs_gateway_config.sql",
    "0065_pegasus_event_and_rotation.sql",
    "0066_pegasus_event_delete_guard.sql",
    "0069_production_integrity.sql",
    "0070_production_permissions.sql",
    "0071_production_review_independence.sql",
    "0072_production_universal_self_approval_guard.sql",
  ]) {
    await pool.query(migration(name))
  }

  // Seed base hierarchy and users
  await pool.query(`
    INSERT INTO organization(id, name, code) VALUES ('org-a', 'Org A', 'ORGA'), ('org-b', 'Org B', 'ORGB');
    INSERT INTO cluster(id, name, code, "organizationId") VALUES ('cluster-a', 'Cluster A', 'CLUA', 'org-a');
    INSERT INTO branch(id, name, code, "clusterId") VALUES ('branch-a', 'Branch A', 'BRAA', 'cluster-a');
    INSERT INTO water_scheme(id, name, code, "branchId") VALUES ('scheme-a', 'Scheme A', 'SCHA', 'branch-a');
    INSERT INTO water_scheme_source(id, "schemeId", "sourceName", technology, "capacityMethod") VALUES ('source-a', 'scheme-a', 'Source A', 'gravity', 'bucket_test');
    INSERT INTO "user"(id, name, email, "organizationId", active) VALUES ('officer-a', 'Officer A', 'a@example.invalid', 'org-a', true), ('officer-b', 'Officer B', 'b@example.invalid', 'org-a', true);
    INSERT INTO billing_period(id, month, year, "periodName", "startDate", "endDate", status) VALUES ('p-2026-10', 10, 2026, 'October 2026', '2026-10-01', '2026-10-31', 'open');
  `)

  // Apply proposed SQL scripts 01 through 04
  for (const name of [
    "01-capacity-history.proposed.sql",
    "02-targets-approvals-reports.proposed.sql",
    "03-integrity-and-private-access.proposed.sql",
    "04-guard-reads-and-unassigned-permissions.proposed.sql",
  ]) {
    await pool.query(proposedSql(name))
  }
}, 60000)

afterAll(async () => {
  await pool?.end()
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`)
    await adminPool.end()
  }
})

describe("Phase B Persistence Models on Disposable PostgreSQL", () => {
  it("rejects assessment insertion without authenticated runtime GUC context", async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await expect(
        client.query(`
          INSERT INTO source_capacity_assessment (
            id, "organizationId", "sourceId", "schemeId", revision, "sourceVersionObserved",
            kind, classification, methodology, "methodologyVersion", "effectiveFrom",
            "capturedById", "sourceWasActive", "rawObservations", assumptions, provenance, "hierarchySnapshot"
          ) VALUES (
            'ass-1', 'org-a', 'source-a', 'scheme-a', 1, 1,
            'documented_assessment', 'VERIFIED_ASSESSMENT', 'bucket_test', 'v1', '2026-10-01',
            'officer-a', true, '{"flow": 10}', '{}', '{"source": "test"}', '{"scheme": "a"}'
          )
        `)
      ).rejects.toThrow("Use the explicitly provisioned non-bypass history runtime role")
    } finally {
      await client.query("ROLLBACK")
      client.release()
    }
  })

  it("enforces independent assessment approval via decision_support_review_event", async () => {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      // Set runtime GUCs
      await client.query("SET LOCAL ROLE swuws_history_runtime")
      await client.query("SELECT set_config('swuws.history_organization_id', 'org-a', true)")
      await client.query("SELECT set_config('swuws.history_actor_id', 'officer-a', true)")
      await client.query("SET LOCAL TRANSACTION ISOLATION LEVEL SERIALIZABLE")

      await client.query(`
        INSERT INTO source_capacity_assessment (
          id, "organizationId", "sourceId", "schemeId", revision, "sourceVersionObserved",
          kind, classification, methodology, "methodologyVersion", "assessedAt", "effectiveFrom",
          "responsibleOfficerId", "capturedById", "installedRatingM3Hour", "regimeHoursPerDay",
          "capacitySelection", "capacityM3Day", "benchmarkCapacityM3Month", "benchmarkDays",
          "sourceWasActive", "rawObservations", assumptions, provenance, "hierarchySnapshot"
        ) VALUES (
          'ass-2', 'org-a', 'source-a', 'scheme-a', 1, 1,
          'documented_assessment', 'VERIFIED_ASSESSMENT', 'bucket_test', 'v1', NOW(), '2026-10-01',
          'officer-a', 'officer-a', 10, 10, 'installed_rating', 100, 3000, 30,
          true, '{"flow": 10}', '{}', '{"source": "test"}', '{"scheme": "a"}'
        )
      `)

      // Attempt self-approval as officer-a
      await expect(
        client.query(`
          INSERT INTO decision_support_review_event (
            id, "organizationId", "assessmentId", revision, decision, "reviewerId", reason, "authorizationEvidence", provenance
          ) VALUES (
            'rev-1', 'org-a', 'ass-2', 1, 'approve', 'officer-a', 'Valid approval reason for test',
            '{"permissionCode": "production.capacity.approve", "scope": "scheme"}', '{"test": true}'
          )
        `)
      ).rejects.toThrow("Independent assessment approval required")

      // Independent approval by officer-b
      await client.query("SELECT set_config('swuws.history_actor_id', 'officer-b', true)")
      await client.query(`
        INSERT INTO decision_support_review_event (
          id, "organizationId", "assessmentId", revision, decision, "reviewerId", reason, "authorizationEvidence", provenance
        ) VALUES (
          'rev-1', 'org-a', 'ass-2', 1, 'approve', 'officer-b', 'Valid independent approval reason',
          '{"permissionCode": "production.capacity.approve", "scope": "scheme"}', '{"test": true}'
        )
      `)

      const revRes = await client.query("SELECT decision FROM decision_support_review_event WHERE id = 'rev-1'")
      expect(revRes.rows[0].decision).toBe("approve")
    } finally {
      await client.query("ROLLBACK")
      client.release()
    }
  })
})
