import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import * as schema from "@/lib/db/schema"
import { productionTestDatabaseUrl } from "./test-database"
import { productionService } from "./service"
import type { SessionUser } from "@/lib/session"

const migration = (name: string) => readFileSync(`db/migrations/${name}`, "utf8")
const repairDraft = (name: string) => readFileSync(`outputs/hierarchy-repair-drafts/${name}`, "utf8")

const namespace = `repair_it_${randomUUID().replaceAll("-", "")}`
let pool: Pool
let adminPool: Pool
let database: ReturnType<typeof drizzle<typeof schema>>
let service: ReturnType<typeof productionService>

beforeAll(async () => {
  const url = productionTestDatabaseUrl()
  if (url.includes("supabase.com")) {
    throw new Error("SAFETY GUARD: Refusing to run disposable test suite against Supabase remote host")
  }

  adminPool = new Pool({ connectionString: url, max: 1 })
  await adminPool.query(`CREATE SCHEMA ${namespace}`)
  pool = new Pool({ connectionString: url, max: 6, options: `-c search_path=${namespace} -c statement_timeout=10000` })
  database = drizzle(pool, { schema })

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

  // Seed org_settings with canonical SWUWS identity
  await pool.query(`
    INSERT INTO org_settings (id, "orgName", "receiptPrefix")
    VALUES (1, 'South Western Umbrella of Water and Sanitation', 'SWUWS')
    ON CONFLICT (id) DO UPDATE SET "orgName" = EXCLUDED."orgName";
  `)

  // Seed unassigned hierarchy matching live database state (4 clusters, 11 branches, 64 schemes)
  await pool.query(`
    INSERT INTO cluster(id, name, code, "organizationId") VALUES
      ('c-kigezi', 'KIGEZI', 'kigezi', NULL),
      ('c-ankole', 'ANKOLE', 'ankole', NULL),
      ('c-rujumbura', 'RUJUMBURA', 'rujumbura', NULL),
      ('c-isingiro', 'ISINGIRO', 'isingiro', NULL);

    INSERT INTO branch(id, name, code, "clusterId") VALUES
      ('b-kabale', 'KABALE', 'kabale', 'c-kigezi'),
      ('b-ibanda', 'IBANDA', 'ibanda', 'c-ankole');
  `)

  // Seed 64 representative water schemes (24 in Kabale branch, 40 in Ibanda branch)
  for (let i = 1; i <= 64; i++) {
    const branchId = i <= 24 ? "b-kabale" : "b-ibanda"
    await pool.query(`
      INSERT INTO water_scheme(id, name, code, "branchId")
      VALUES ($1, $2, $3, $4)
    `, [`scheme-${i}`, `SCHEME_${i}`, `scheme_${i}`, branchId])
  }

  // Seed unassigned system user accounts
  await pool.query(`
    INSERT INTO "user"(id, name, email, role, "organizationId", active) VALUES
      ('u-admin', 'System Admin', 'admin@example.invalid', 'admin', NULL, true),
      ('u-hc', 'Head Commercial', 'hc@example.invalid', 'head_commercial', NULL, true),
      ('u-manager', 'Cluster Manager', 'cm@example.invalid', 'cluster_manager', NULL, true),
      ('u-unassigned', 'Unassigned User', 'unassigned@example.invalid', 'agent', NULL, false);
  `)

  // APPLY PROPOSED DRAFT REPAIR SCRIPTS FROM OUTPUTS DIRECTORY
  await pool.query(repairDraft("01-swuws-canonical-hierarchy-repair.draft.sql"))
  await pool.query(repairDraft("02-production-iam-role-grants.draft.sql"))

  service = productionService(database)
}, 60000)

afterAll(async () => {
  await pool?.end()
  if (adminPool) {
    await adminPool.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`)
    await adminPool.end()
  }
})

describe("Hierarchy & IAM Repair Validation on Disposable PostgreSQL", () => {
  it("grants full 64-scheme visibility to System Administrator after hierarchy repair", async () => {
    const admin: SessionUser = {
      id: "u-admin",
      name: "System Admin",
      email: "admin@example.invalid",
      role: "admin",
      active: true,
      organizationId: "org-swuws",
      clusterId: null,
      branchId: null,
      schemeId: null,
      iamRoleId: null,
      roleLevel: 100,
      permissions: [{ code: "production.view", scope: "global" }],
      grants: [],
    }

    const ws = await service.workspace(admin)
    expect(ws.schemes).toHaveLength(64)
  })

  it("restricts Kigezi Cluster Manager to their 24 assigned cluster schemes only", async () => {
    const clusterManager: SessionUser = {
      id: "u-manager",
      name: "Cluster Manager",
      email: "cm@example.invalid",
      role: "cluster_manager",
      active: true,
      organizationId: "org-swuws",
      clusterId: "c-kigezi",
      branchId: null,
      schemeId: null,
      iamRoleId: null,
      roleLevel: 50,
      permissions: [{ code: "production.view", scope: "cluster" }],
      grants: [],
    }

    const ws = await service.workspace(clusterManager)
    expect(ws.schemes).toHaveLength(24)
  })

  it("denies access to cross-tenant users belonging to a different organization", async () => {
    const foreignUser: SessionUser = {
      id: "u-foreign",
      name: "Foreign Admin",
      email: "foreign@example.invalid",
      role: "admin",
      active: true,
      organizationId: "org-foreign",
      clusterId: null,
      branchId: null,
      schemeId: null,
      iamRoleId: null,
      roleLevel: 100,
      permissions: [{ code: "production.view", scope: "global" }],
      grants: [],
    }

    const ws = await service.workspace(foreignUser)
    expect(ws.schemes).toHaveLength(0)
  })

  it("denies access to users with missing organizationId or missing production.view permission", async () => {
    const unassignedUser: SessionUser = {
      id: "u-unassigned",
      name: "Unassigned User",
      email: "unassigned@example.invalid",
      role: "agent",
      active: false,
      organizationId: null,
      clusterId: null,
      branchId: null,
      schemeId: null,
      iamRoleId: null,
      roleLevel: 10,
      permissions: [],
      grants: [],
    }

    await expect(service.workspace(unassignedUser)).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("retains scheme selection in workspace dropdown when scheme has 0 production sources", async () => {
    const admin: SessionUser = {
      id: "u-admin",
      name: "System Admin",
      email: "admin@example.invalid",
      role: "admin",
      active: true,
      organizationId: "org-swuws",
      clusterId: null,
      branchId: null,
      schemeId: null,
      iamRoleId: null,
      roleLevel: 100,
      permissions: [{ code: "production.view", scope: "global" }],
      grants: [],
    }

    const ws = await service.workspace(admin, "scheme-1")
    expect(ws.scheme).toMatchObject({ id: "scheme-1", name: "SCHEME_1" })
    expect(ws.sources).toHaveLength(0) // 0 sources configured
    expect(ws.records).toHaveLength(0) // 0 records logged
  })
})
