import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import * as schema from "@/lib/db/schema"
import type { SessionUser } from "@/lib/session"
import { productionService } from "./service"
import { loadProductionSummary } from "./reporting"
import { generateMonthlyWaterProductionReport } from "@/lib/reports/production-executive-report"
import { productionTestDatabaseUrl } from "./test-database"

const migration = (name: string) => readFileSync(`db/migrations/${name}`, "utf8")
const namespace = `energy_it_${randomUUID().replaceAll("-", "")}`
const HASH = "a".repeat(64)
let pool: Pool
let adminPool: Pool
let database: ReturnType<typeof drizzle<typeof schema>>
let service: ReturnType<typeof productionService>

const actor = (id: string, codes: string[], schemeId: string | null = "s-1"): SessionUser => ({
  id,
  name: id,
  email: `${id}@example.com`,
  role: "agent",
  active: true,
  organizationId: "org-1",
  clusterId: null,
  branchId: null,
  schemeId,
  iamRoleId: null,
  roleLevel: 1,
  permissions: codes.map((code) => ({ code, scope: schemeId ? "scheme" : "global" })),
  grants: [],
})

beforeAll(async () => {
  if (process.env.SWUWS_PRODUCTION_INTEGRATION !== "1") {
    throw new Error("SAFETY GUARD: Set SWUWS_PRODUCTION_INTEGRATION=1 alongside PRODUCTION_TEST_DATABASE_URL to run disposable DB integration tests")
  }
  const url = productionTestDatabaseUrl()
  if (url.includes("supabase.com")) {
    throw new Error("SAFETY GUARD: Refusing to run disposable test suite against Supabase remote host")
  }

  adminPool = new Pool({ connectionString: url, max: 1 })
  await adminPool.query(`CREATE SCHEMA ${namespace}`)
  pool = new Pool({ connectionString: url, max: 6, options: `-c search_path=${namespace} -c statement_timeout=10000` })
  database = drizzle(pool, { schema })
  service = productionService(database)

  // Apply base migrations 0001 through 0075 inside the isolated disposable schema
  for (const name of [
    "0001_init.sql",
    "0002_immutability.sql",
    "0003_audit_log_immutability.sql",
    "0005_customer_and_scheme_management.sql",
    "0008_rbac_foundation.sql",
    "0009_billing_module.sql",
    "0012_receipt_billing_snapshots.sql",
    "0013_collection_period_lifecycle.sql",
    "0015_iam_module.sql",
    "0025_meter_reading_module.sql",
    "0032_customer_active_status.sql",
    "0033_org_settings_generalization.sql",
    "0055_meter_reading_billing_record.sql",
    "0061_swuws_intelligence.sql",
    "0064_ebs_gateway_config.sql",
    "0065_pegasus_event_and_rotation.sql",
    "0066_pegasus_event_delete_guard.sql",
    "0069_production_integrity.sql",
    "0070_production_permissions.sql",
    "0071_production_review_independence.sql",
    "0072_production_universal_self_approval_guard.sql",
    "0073_swuws_canonical_hierarchy_repair.sql",
    "0074_production_iam_role_grants.sql",
    "0075_production_energy.sql",
  ]) {
    await pool.query(migration(name))
  }

  // Verify idempotency: re-applying 0075_production_energy.sql on the migrated schema succeeds cleanly
  await pool.query(migration("0075_production_energy.sql"))

  await pool.query(`
    INSERT INTO organization (id, name, code) VALUES ('org-1', 'Org', 'ORG');
    INSERT INTO cluster (id, name, code, "organizationId") VALUES ('c-1', 'Cluster', 'C', 'org-1');
    INSERT INTO branch (id, name, code, "clusterId") VALUES ('b-1', 'Branch', 'B', 'c-1');
    INSERT INTO water_scheme (id, name, code, "branchId") VALUES
      ('s-1', 'Scheme 1', 'S1', 'b-1'),
      ('s-2', 'Scheme 2', 'S2', 'b-1');

    INSERT INTO water_scheme_source (id, "schemeId", "sourceName", technology, "capacityMethod") VALUES
      ('src-1', 's-1', 'Borehole 1', 'pumped_grid', 'unknown'),
      ('src-1b', 's-1', 'Borehole 2', 'pumped_grid', 'unknown'),
      ('src-2', 's-2', 'Foreign Spring', 'gravity', 'unknown');

    INSERT INTO water_scheme_energy_asset (id, "schemeId", "assetType", "assetRef", "fuelType") VALUES
      ('asset-1', 's-1', 'generator', 'GEN-01', 'diesel'),
      ('elec-shared', 's-1', 'electricity_meter', 'UMEME-SHARED-01', NULL),
      ('elec-single', 's-1', 'electricity_meter', 'UMEME-SINGLE-01', NULL),
      ('asset-s2', 's-2', 'generator', 'GEN-S2', 'diesel');

    INSERT INTO energy_asset_assignment (id, "schemeId", "assetId", "sourceId") VALUES
      ('assign-1', 's-1', 'asset-1', 'src-1'),
      ('assign-e1', 's-1', 'elec-shared', 'src-1'),
      ('assign-e2', 's-1', 'elec-shared', 'src-1b'),
      ('assign-es', 's-1', 'elec-single', 'src-1');

    INSERT INTO "user" (id, name, email, role, "organizationId") VALUES
      ('u-rec', 'Recorder', 'rec@example.com', 'agent', 'org-1'),
      ('u-ver', 'Verifier', 'ver@example.com', 'area_manager', 'org-1');
  `)
}, 60000)

afterAll(async () => {
  await pool?.end()
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`)
    await adminPool.end()
  }
})

describe("Database Integration: Migration 0075, Production Intervals, Energy & Executive Reporting", () => {
  it("rejects negative calculated fuel consumption", async () => {
    await expect(pool.query(`
      INSERT INTO water_production_fuel (
        id, "schemeId", "assetId", "openingStockLitres", "closingStockLitres", "calculatedConsumedLitres",
        "coverageStartDate", "coverageEndDate", status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES (
        'f-1', 's-1', 'asset-1', 50.00, 100.00, -50.00, '2026-10-01', '2026-10-01',
        'entered', 'u-rec', $1, $2
      )
    `, [randomUUID(), HASH])).rejects.toThrow(/water_prod_fuel_cons/)
  })

  it("rejects backwards coverage dates on fuel records", async () => {
    await expect(pool.query(`
      INSERT INTO water_production_fuel (
        id, "schemeId", "assetId", "openingStockLitres", "closingStockLitres", "calculatedConsumedLitres",
        "coverageStartDate", "coverageEndDate", status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES (
        'f-2', 's-1', 'asset-1', 200.00, 100.00, 100.00, '2026-10-02', '2026-10-01',
        'entered', 'u-rec', $1, $2
      )
    `, [randomUUID(), HASH])).rejects.toThrow(/water_prod_fuel_dates/)
  })

  it("allows null fuel consumption on purchase-only records and forbids fabricating consumption without stock readings", async () => {
    await expect(pool.query(`
      INSERT INTO water_production_fuel (
        id, "schemeId", "assetId", "calculatedConsumedLitres", "fuelPurchasedLitres",
        "coverageStartDate", "coverageEndDate", status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES (
        'f-fabricated', 's-1', 'asset-1', 500.00, 500.00,
        '2026-10-01', '2026-10-01', 'entered', 'u-rec', $1, $2
      )
    `, [randomUUID(), HASH])).rejects.toThrow(/water_prod_fuel_reconciliation/)

    await pool.query(`
      INSERT INTO water_production_fuel (
        id, "schemeId", "assetId", "calculatedConsumedLitres", "fuelPurchasedLitres",
        "coverageStartDate", "coverageEndDate", status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES (
        'f-3', 's-1', 'asset-1', NULL, 500.00,
        '2026-10-01', '2026-10-01', 'entered', 'u-rec', $1, $2
      )
    `, [randomUUID(), HASH])
    const res = await pool.query(`SELECT "calculatedConsumedLitres" FROM water_production_fuel WHERE id = 'f-3'`)
    expect(res.rows[0].calculatedConsumedLitres).toBeNull()
  })

  it("enforces universal self-approval guard on energy tables (recordedById != verifiedById)", async () => {
    await expect(pool.query(`
      UPDATE water_production_fuel
      SET status = 'verified', "verifiedById" = 'u-rec', "verifiedAt" = NOW(), version = version + 1
      WHERE id = 'f-3'
    `)).rejects.toThrow(/Self-approval is forbidden/)
  })

  it("allows independent verification and prevents deletion or measurement tampering on verified rows", async () => {
    await pool.query(`
      UPDATE water_production_fuel
      SET status = 'verified', "verifiedById" = 'u-ver', "verifiedAt" = NOW(), version = version + 1
      WHERE id = 'f-3'
    `)
    const res = await pool.query(`SELECT status, version FROM water_production_fuel WHERE id = 'f-3'`)
    expect(res.rows[0]).toEqual({ status: "verified", version: 2 })

    // Direct mutation while remaining verified is blocked by transition matrix
    await expect(pool.query(`
      UPDATE water_production_fuel
      SET "fuelPurchasedLitres" = 999.00, version = version + 1
      WHERE id = 'f-3'
    `)).rejects.toThrow(/Invalid production transition/)

    // Valid review transition (verified -> flagged) that attempts to tamper with measurements is blocked
    await expect(pool.query(`
      UPDATE water_production_fuel
      SET status = 'flagged', "verifiedById" = NULL, "verifiedAt" = NULL, "fuelPurchasedLitres" = 999.00, version = version + 1
      WHERE id = 'f-3'
    `)).rejects.toThrow(/Review transitions cannot edit measurements/)

    await expect(pool.query(`DELETE FROM water_production_fuel WHERE id = 'f-3'`)).rejects.toThrow(
      /Production history cannot be deleted/,
    )
  })

  it("prevents cross-scheme asset assignment, cross-scheme logging, and mismatched asset types", async () => {
    // Cannot assign Scheme 1 generator to Scheme 2 source
    await expect(pool.query(`
      INSERT INTO energy_asset_assignment (id, "schemeId", "assetId", "sourceId")
      VALUES ('bad-assign-1', 's-1', 'asset-1', 'src-2')
    `)).rejects.toThrow(/energy_asset_assignment_source_scheme_fk/)

    await expect(pool.query(`
      INSERT INTO energy_asset_assignment (id, "schemeId", "assetId", "sourceId")
      VALUES ('bad-assign-2', 's-2', 'asset-1', 'src-2')
    `)).rejects.toThrow(/energy_asset_assignment_asset_scheme_fk/)

    // Cannot log Scheme 2 fuel against Scheme 1 generator (blocked by trigger ERRCODE 23503 & composite FK)
    await expect(pool.query(`
      INSERT INTO water_production_fuel (
        id, "schemeId", "assetId", "calculatedConsumedLitres", "coverageStartDate", "coverageEndDate",
        status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES ('bad-fuel-scheme', 's-2', 'asset-1', NULL, '2026-10-02', '2026-10-02', 'entered', 'u-rec', $1, $2)
    `, [randomUUID(), HASH])).rejects.toThrow(/Energy asset does not belong to this scheme|water_production_fuel_asset_scheme_fk/)

    // Cannot log Scheme 2 water interval against Scheme 1 source (blocked by composite FK)
    await expect(pool.query(`
      INSERT INTO water_production_interval (
        id, "schemeId", "sourceId", "meterRef", "openingReading", "openingTimestamp",
        "closingReading", "closingTimestamp", "calculatedVolumeM3", "coverageHours",
        "coverageStartDate", "coverageEndDate", "isCrossMonth", status, "recordedById", "requestKey", "requestFingerprint"
      ) VALUES (
        'bad-int-scheme', 's-2', 'src-1', 'MTR-X', 100.00, '2026-10-01T00:00:00Z',
        120.00, '2026-10-02T00:00:00Z', 20.00, 24.00,
        '2026-10-01', '2026-10-02', false, 'entered', 'u-rec', $1, $2
      )
    `, [randomUUID(), HASH])).rejects.toThrow(/water_production_interval_source_scheme_fk/)

    // Cannot log electricity against a generator asset
    const recorder = actor("u-rec", ["production.view", "production.create"])
    await expect(
      service.createElectricity(recorder, {
        schemeId: "s-1",
        assetId: "asset-1",
        openingReadingKwh: "10.00",
        openingTimestamp: "2026-10-01T08:00:00Z",
        closingReadingKwh: "20.00",
        closingTimestamp: "2026-10-02T08:00:00Z",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("enforces pump operating hours from elapsed interval duration x supported assets and leaves omitted hours null", async () => {
    const recorder = actor("u-rec", ["production.view", "production.create"])

    // Shared meter (2 assigned boreholes) over 48 h supports up to 96.00 aggregate pump-hours (> 24 h!)
    const sharedOk = await service.createElectricity(recorder, {
      schemeId: "s-1",
      assetId: "elec-shared",
      openingReadingKwh: "1000.00",
      openingTimestamp: "2026-10-01T06:00:00Z",
      closingReadingKwh: "1480.00",
      closingTimestamp: "2026-10-03T06:00:00Z", // 48 h * 2 pumps = 96 h max
      pumpOperatingHours: "80.00",
      requestKey: randomUUID(),
    })
    expect(sharedOk.pumpOperatingHours).toBe("80.00")

    // Exceeding 96 h on the 2-pump shared meter fails
    await expect(
      service.createElectricity(recorder, {
        schemeId: "s-1",
        assetId: "elec-shared",
        openingReadingKwh: "1480.00",
        openingTimestamp: "2026-10-03T06:00:00Z",
        closingReadingKwh: "1960.00",
        closingTimestamp: "2026-10-05T06:00:00Z",
        pumpOperatingHours: "100.00",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" })

    // Single-pump meter over 48 h rejects 60 h (> 48 h) and keeps omitted hours NULL (no fabrication)
    await expect(
      service.createElectricity(recorder, {
        schemeId: "s-1",
        assetId: "elec-single",
        openingReadingKwh: "100.00",
        openingTimestamp: "2026-10-01T06:00:00Z",
        closingReadingKwh: "200.00",
        closingTimestamp: "2026-10-03T06:00:00Z",
        pumpOperatingHours: "60.00",
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" })

    const omitted = await service.createElectricity(recorder, {
      schemeId: "s-1",
      assetId: "elec-single",
      openingReadingKwh: "100.00",
      openingTimestamp: "2026-10-01T06:00:00Z",
      closingReadingKwh: "200.00",
      closingTimestamp: "2026-10-03T06:00:00Z",
      requestKey: randomUUID(),
    })
    expect(omitted.pumpOperatingHours).toBeNull()
  })

  it("allows adjacent meter intervals and blocks overlapping intervals even under concurrent inserts", async () => {
    const recorder = actor("u-rec", ["production.view", "production.create"])

    const first = await service.createInterval(recorder, {
      schemeId: "s-1",
      sourceId: "src-1",
      meterRef: "M-SRC1",
      openingReading: "0.00",
      openingTimestamp: "2026-10-01T05:00:00Z",
      closingReading: "100.00",
      closingTimestamp: "2026-10-04T05:00:00Z",
      requestKey: randomUUID(),
    })
    expect(first.calculatedVolumeM3).toBe("100.00")

    // Exact boundary handoff [2026-10-04T05:00Z, 2026-10-07T05:00Z) is allowed
    const adjacent = await service.createInterval(recorder, {
      schemeId: "s-1",
      sourceId: "src-1",
      meterRef: "M-SRC1",
      openingReading: "100.00",
      openingTimestamp: "2026-10-04T05:00:00Z",
      closingReading: "220.00",
      closingTimestamp: "2026-10-07T05:00:00Z",
      requestKey: randomUUID(),
    })
    expect(adjacent.calculatedVolumeM3).toBe("120.00")

    // Concurrent overlapping raw SQL inserts on two pooled connections: advisory lock + trigger guarantees 1 winner, 1 23P01
    const insertOverlap = (id: string, openIso: string, closeIso: string, hours: string) =>
      pool.query(
        `INSERT INTO water_production_interval (
          id, "schemeId", "sourceId", "meterRef", "openingReading", "openingTimestamp",
          "closingReading", "closingTimestamp", "meterUnit", multiplier, "calculatedVolumeM3",
          "coverageHours", "coverageStartDate", "coverageEndDate", "isCrossMonth",
          status, "recordedById", "requestKey", "requestFingerprint"
        ) VALUES (
          $1, 's-1', 'src-1b', 'M-CONC', 0.00, $2::timestamp,
          50.00, $3::timestamp, 'm3', 1.00, 50.00,
          $4::numeric, '2026-10-10', '2026-10-12', false,
          'entered', 'u-rec', $5, $6
        )`,
        [id, openIso, closeIso, hours, randomUUID(), HASH],
      )

    const results = await Promise.allSettled([
      insertOverlap("conc-a", "2026-10-10T06:00:00Z", "2026-10-12T06:00:00Z", "48.00"),
      insertOverlap("conc-b", "2026-10-10T18:00:00Z", "2026-10-12T18:00:00Z", "48.00"),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!
    expect((rejected.reason as { code?: string }).code).toBe("23P01")
  })

  it("aggregates cross-month intervals without double counting and traces executive-report billed volume to meter_reading", async () => {
    // Dedicated clean scheme s-2 (1 active source src-2) in August & September 2026:
    // - Cross-month generator fuel on asset-s2: 2026-08-29..2026-09-04 (7 days: 3 in Aug, 4 in Sept), 140.00 L consumed
    // - Full September daily verified production on src-2 (30 days x 100 m3 produced, 95 m3 supplied -> 3000 produced / 2850 supplied)
    // - One verified customer meter reading for September 2026 with consumption = 2280 m3, linked to a billing_record whose
    //   billAmount is 99,000,000 UGX (proving billAmount/2000 = 49,500 m3 is GONE).
    const recorder = actor("u-rec", ["production.view", "production.create"], "s-2")
    const verifier = actor("u-ver", ["production.view", "production.verify"], "s-2")

    const crossFuel = await service.createFuel(recorder, {
      schemeId: "s-2",
      assetId: "asset-s2",
      fuelType: "diesel",
      openingStockLitres: "200.00",
      fuelPurchasedLitres: "0.00",
      closingStockLitres: "60.00",
      coverageStartDate: "2026-08-29",
      coverageEndDate: "2026-09-04",
      fuelExpenditureUgx: "700000.00",
      requestKey: randomUUID(),
    })
    expect(crossFuel.calculatedConsumedLitres).toBe("140.00")
    expect(crossFuel.isCrossMonth).toBe(true)
    await pool.query(
      `UPDATE water_production_fuel SET status = 'verified', "verifiedById" = 'u-ver', "verifiedAt" = NOW(), version = version + 1 WHERE id = $1`,
      [crossFuel.id],
    )

    for (let day = 1; day <= 30; day++) {
      const date = `2026-09-${String(day).padStart(2, "0")}`
      const log = await service.create(recorder, {
        schemeId: "s-2",
        sourceId: "src-2",
        productionDate: date,
        waterProducedM3: "100.00",
        waterSuppliedM3: "95.00",
        operatingHours: "10.00",
        requestKey: randomUUID(),
      })
      await service.transition(verifier, { id: log.id, expectedVersion: 1, operation: "verify" })
    }

    await pool.query(`
      INSERT INTO billing_period (id, month, year, "periodName", "startDate", "endDate", status)
      VALUES ('bp-2026-09', 9, 2026, 'September 2026', '2026-09-01', '2026-09-30', 'closed');

      INSERT INTO customer (id, "customerAccount", name, "waterSchemeId", "meterRef", active)
      VALUES ('cust-s2-1', 'ACC-S2-001', 'Hospital Bulk Meter', 's-2', 'MTR-CUST-1', true);

      INSERT INTO billing_run (id, "schemeId", "billingPeriodId", "uploadedById", status)
      VALUES ('brun-s2-1', 's-2', 'bp-2026-09', 'u-rec', 'completed');

      INSERT INTO billing_record (id, "billingRunId", "customerId", "billingPeriodId", "accountNumber", "billAmount", "totalDue", "dueDate")
      VALUES ('br-s2-1', 'brun-s2-1', 'cust-s2-1', 'bp-2026-09', 'ACC-S2-001', 99000000, 99000000, '2026-09-30');

      INSERT INTO meter_reading (
        id, "customerId", "billingPeriodId", "billingRecordId", "recordedById",
        "previousReading", "currentReading", consumption
      ) VALUES (
        'mr-s2-1', 'cust-s2-1', 'bp-2026-09', 'br-s2-1', 'u-rec',
        10000, 12280, 2280
      );
    `)

    const [augSum] = await loadProductionSummary(database, ["s-2"], "2026-08")
    const [sepSum] = await loadProductionSummary(database, ["s-2"], "2026-09")

    // Cross-month fuel is NOT counted in full (140 L) in both months and NOT mixed into measured energy.totalFuelLitres
    expect(augSum.energy.totalFuelLitres).toBe(0)
    expect(sepSum.energy.totalFuelLitres).toBe(0)
    expect(augSum.estimatedAllocation.fuelLitres).toBe(60)
    expect(sepSum.estimatedAllocation.fuelLitres).toBe(80)
    expect(augSum.estimatedAllocation.fuelLitres + sepSum.estimatedAllocation.fuelLitres).toBe(140)

    const execViewer = actor("u-ver", ["reports.view"], null)
    execViewer.role = "head_commercial"
    execViewer.roleLevel = 9
    const report = await generateMonthlyWaterProductionReport(execViewer, { month: "2026-09", schemeId: "s-2" }, database)
    expect(report.items).toHaveLength(1)
    const item = report.items[0]
    expect(item.verifiedProducedM3).toBe(3000)
    expect(item.verifiedSuppliedM3).toBe(2850)
    expect(item.billedConsumptionM3).toBe(2280) // Traced to meter_reading.consumption, NOT 99,000,000 / 2000 = 49,500
    expect(item.nrwStatus).toBe("AVAILABLE")
    expect(item.nrwPercent).toBe(20) // (2850 supplied - 2280 billed) / 2850 = 20.0%
    expect(item.estimatedAllocation.fuelLitres).toBe(80)
  })

  it("fails closed on preflight if a legacy draft energy_asset_assignment table exists without schemeId", async () => {
    const legacySchema = `${namespace}_legacy`
    const legacyPool = new Pool({
      connectionString: productionTestDatabaseUrl(),
      max: 1,
      options: `-c search_path=${legacySchema} -c statement_timeout=10000`,
    })
    await adminPool.query(`CREATE SCHEMA ${legacySchema}`)
    try {
      await legacyPool.query(`CREATE TABLE energy_asset_assignment (id text PRIMARY KEY, "assetId" text NOT NULL, "sourceId" text NOT NULL)`)
      await expect(legacyPool.query(migration("0075_production_energy.sql"))).rejects.toThrow(
        /Preflight failed: legacy draft energy_asset_assignment exists without schemeId/i,
      )
    } finally {
      await legacyPool.end()
      await adminPool.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`)
    }
  })
})
