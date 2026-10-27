import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm"
import { db as applicationDb, type DatabaseTransaction } from "@/lib/db"
import { auditLog, billingPeriod, waterProductionLog as logs, waterScheme, waterSchemeSource as sources } from "@/lib/db/schema"
import { writeAudit } from "@/lib/audit"
import { canViewIntelligence, canViewProduction } from "@/lib/permissions"
import type { SessionUser } from "@/lib/session"
import { intelligenceHierarchyFilter, productionGrantScope, productionSchemeFilter } from "./scope"
import { archiveSourceSchema, createLogSchema, editLogSchema, legacyReviewSchema, monthSchema, opaqueId, ProductionError, sourceSchema, transitionSchema, type Measurement } from "./schemas"
import { loadProductionSummary } from "./reporting"

type Client = typeof applicationDb | DatabaseTransaction
const fail = (code: ConstructorParameters<typeof ProductionError>[0], message: string): never => { throw new ProductionError(code, message) }
function fingerprint(data: Measurement) {
  return createHash("sha256").update(JSON.stringify([data.schemeId, data.sourceId, data.productionDate, data.waterProducedM3, data.waterSuppliedM3, data.operatingHours, data.notes])).digest("hex")
}
function readFilter(user: SessionUser, target?: string): SQL {
  return or(productionSchemeFilter(user, "production.view", target), intelligenceHierarchyFilter(user, target))!
}
function ownReadFilter(user: SessionUser): SQL | undefined {
  // Legacy intelligence viewing remains read-only, but only inside its own authorised scheme set.
  if (productionGrantScope(user, "production.view") !== "own") return undefined
  return or(eq(logs.recordedById, user.id), inArray(logs.schemeId, sql`(select ${waterScheme.id} from ${waterScheme} where ${intelligenceHierarchyFilter(user)})`))
}
async function assertScheme(client: Client, user: SessionUser, schemeId: string, permission?: string, active = false) {
  const filter = permission ? and(productionSchemeFilter(user, "production.view", schemeId), productionSchemeFilter(user, permission, schemeId)) : readFilter(user, schemeId)
  const [scheme] = await client.select().from(waterScheme).where(and(filter, active ? eq(waterScheme.active, true) : undefined)).limit(1).for("share")
  if (!scheme) fail("FORBIDDEN", "Scheme is unavailable or outside your access")
  return scheme
}
async function resolvePeriod(client: Client, data: Measurement) {
  const [year, month] = data.productionDate.split("-").map(Number)
  const periods = await client.select({ id: billingPeriod.id }).from(billingPeriod).where(and(eq(billingPeriod.year, year), eq(billingPeriod.month, month))).limit(2).for("share")
  if (periods.length > 1) fail("CONFIGURATION", "Multiple billing periods match this production month; reconcile them first")
  const id = periods[0]?.id ?? null
  if (data.billingPeriodId != null && data.billingPeriodId !== id) fail("VALIDATION", "Billing period does not match the production month")
  return id
}
async function assertSource(client: Client, data: Pick<Measurement, "sourceId" | "schemeId">, active: boolean) {
  const [source] = await client.select().from(sources).where(and(eq(sources.id, data.sourceId), eq(sources.schemeId, data.schemeId), active ? eq(sources.active, true) : undefined)).limit(1).for("share")
  if (!source) fail("FORBIDDEN", "Source is unavailable or outside this scheme")
  return source
}
function checkVersion(row: { version: number }, expected: number) {
  if (row.version !== expected) fail("CONFLICT", "This record changed. Reload before continuing")
}
const measurementValues = (data: Measurement) => ({ waterProducedM3: data.waterProducedM3, waterSuppliedM3: data.waterSuppliedM3, operatingHours: data.operatingHours, notes: data.notes || null })

/** Dependency injection lets real PostgreSQL tests use only their disposable connection. */
export function productionService(database = applicationDb, audit = writeAudit) {
  async function getLockedLog(tx: DatabaseTransaction, user: SessionUser, id: string, permission: string) {
    // Authorised subquery prevents foreign row locking or existence disclosure.
    const [row] = await tx.select().from(logs).where(and(eq(logs.id, id), inArray(logs.schemeId,
      sql`(select ${waterScheme.id} from ${waterScheme} where ${productionSchemeFilter(user, "production.view")} and ${productionSchemeFilter(user, permission)})`))).limit(1).for("update")
    if (!row) fail("FORBIDDEN", "Record is unavailable or outside your access")
    await assertScheme(tx, user, row.schemeId, permission)
    return row
  }
  async function logAudit(tx: DatabaseTransaction, user: SessionUser, action: string, id: string, before: unknown, after: unknown, reason?: string) {
    await audit({ user, action: `production.log.${action}`, entityType: "water_production_log", entityId: id, details: { before, after, reason: reason || null } }, tx)
  }
  return {
    async workspace(user: SessionUser, schemeId?: string, month?: string, cursor?: string) {
      if (!canViewProduction(user) && !canViewIntelligence(user)) fail("FORBIDDEN", "Production viewing is not permitted")
      if (schemeId) opaqueId.parse(schemeId)
      if (cursor) opaqueId.parse(cursor)
      const selectedMonth = monthSchema.parse(month ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7))
      const schemes = await database.select({ id: waterScheme.id, name: waterScheme.name }).from(waterScheme).where(readFilter(user)).orderBy(asc(waterScheme.name))
      const selectedId = schemeId ?? schemes[0]?.id
      if (!selectedId) return { schemes, scheme: null, sources: [], records: [], nextCursor: null, summary: null, month: selectedMonth, userId: user.id, capabilities: { create: false, verify: false, sources: false } }
      const scheme = await assertScheme(database, user, selectedId)
      const sourceRows = await database.select().from(sources).where(eq(sources.schemeId, selectedId)).orderBy(asc(sources.sourceName))
      const records = await database.select().from(logs).where(and(eq(logs.schemeId, selectedId), ownReadFilter(user),
        // Legacy dates are not inferred. They remain visible for explicit review.
        or(sql`to_char(${logs.productionDate}, 'YYYY-MM') = ${selectedMonth}`, eq(logs.workflowVersion, 0)), cursor ? lt(logs.id, cursor) : undefined,
      )).orderBy(desc(logs.id)).limit(31)
      const permitted = async (code: string) => {
        const [row] = await database.select({ id: waterScheme.id }).from(waterScheme).where(and(productionSchemeFilter(user, "production.view", selectedId), productionSchemeFilter(user, code, selectedId))).limit(1)
        return !!row
      }
      const [create, verify, manage] = await Promise.all([permitted("production.create"), permitted("production.verify"), permitted("production.sources.manage")])
      const summary = await loadProductionSummary(database, [selectedId], selectedMonth, ownReadFilter(user))
      return { schemes, scheme, sources: sourceRows, records: records.slice(0, 30), nextCursor: records.length > 30 ? records[29].id : null, summary: summary[0] ?? null, month: selectedMonth, userId: user.id, capabilities: { create, verify, sources: manage } }
    },
    async history(user: SessionUser, id: unknown) {
      const parsedId = opaqueId.parse(id)
      const [row] = await database.select().from(logs).where(and(eq(logs.id, parsedId), ownReadFilter(user), inArray(logs.schemeId, sql`(select ${waterScheme.id} from ${waterScheme} where ${readFilter(user)})`))).limit(1)
      if (!row) fail("FORBIDDEN", "Record is unavailable or outside your access")
      return database.select({ id: auditLog.id, action: auditLog.action, createdAt: auditLog.createdAt, details: auditLog.details }).from(auditLog).where(and(eq(auditLog.entityType, "water_production_log"), eq(auditLog.entityId, row.id))).orderBy(desc(auditLog.createdAt)).limit(100)
    },
    async create(user: SessionUser, input: unknown) {
      const data = createLogSchema.parse(input)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.create", true)
        // Same actor/key serialises concurrent retries before lookup; no application-global lock.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${data.requestKey}`}, 0))`)
        const [existing] = await tx.select().from(logs).where(and(eq(logs.recordedById, user.id), eq(logs.requestKey, data.requestKey))).limit(1)
        if (existing) {
          await assertScheme(tx, user, existing.schemeId, "production.create")
          if (existing.requestFingerprint !== fingerprint(data)) fail("CONFLICT", "Retry key already belongs to a different submission")
          return existing
        }
        await assertSource(tx, data, true)
        const billingPeriodId = await resolvePeriod(tx, data)
        const [row] = await tx.insert(logs).values({ id: `prod-${randomUUID()}`, schemeId: data.schemeId, sourceId: data.sourceId,
          productionDate: data.productionDate, logDate: new Date(`${data.productionDate}T00:00:00Z`), billingPeriodId,
          ...measurementValues(data), workflowVersion: 1, version: 1, status: "entered", recordedById: user.id, requestKey: data.requestKey, requestFingerprint: fingerprint(data),
        }).returning()
        await logAudit(tx, user, "create", row.id, null, row)
        return row
      })
    },
    async edit(user: SessionUser, input: unknown) {
      const data = editLogSchema.parse(input)
      return database.transaction(async tx => {
        const before = await getLockedLog(tx, user, data.id, "production.create")
        checkVersion(before, data.expectedVersion)
        if (before.recordedById !== user.id || before.workflowVersion !== 1 || !["entered", "flagged"].includes(before.status)) fail("FORBIDDEN", "Only the recorder can edit an unverified record; revoke verification first")
        if (before.schemeId !== data.schemeId || before.sourceId !== data.sourceId || before.productionDate !== data.productionDate) fail("VALIDATION", "Source and production date are immutable; void the incorrect entry and record a new one")
        await assertSource(tx, data, false)
        const billingPeriodId = await resolvePeriod(tx, data)
        const [after] = await tx.update(logs).set({ ...measurementValues(data), billingPeriodId, status: "entered", version: before.version + 1, updatedAt: new Date() }).where(and(eq(logs.id, before.id), eq(logs.version, before.version))).returning()
        await logAudit(tx, user, "edit", before.id, before, after)
        return after
      })
    },
    async transition(user: SessionUser, input: unknown) {
      const data = transitionSchema.parse(input)
      return database.transaction(async tx => {
        const before = await getLockedLog(tx, user, data.id, "production.verify")
        checkVersion(before, data.expectedVersion)
        if (before.recordedById === user.id) fail("FORBIDDEN", "An independent verifier must review this record")
        if (before.workflowVersion !== 1 && data.operation !== "void" && data.operation !== "revoke") fail("VALIDATION", "Review and validate the legacy record first")
        const next = { verify: "verified", flag: "flagged", revoke: "flagged", void: "void" }[data.operation]
        if (before.status === "void" || (data.operation === "verify" && before.status !== "entered") || (data.operation === "flag" && before.status !== "entered") || (data.operation === "revoke" && before.status !== "verified")) fail("CONFLICT", "This transition is not valid for the current state")
        if (data.operation === "verify") {
          createLogSchema.parse({ schemeId: before.schemeId, sourceId: before.sourceId, productionDate: before.productionDate, waterProducedM3: before.waterProducedM3, waterSuppliedM3: before.waterSuppliedM3, operatingHours: before.operatingHours, notes: before.notes ?? "", requestKey: before.requestKey })
          await assertSource(tx, { schemeId: before.schemeId, sourceId: before.sourceId! }, false)
          const periodId = await resolvePeriod(tx, { schemeId: before.schemeId, sourceId: before.sourceId!, productionDate: before.productionDate!, waterProducedM3: before.waterProducedM3, waterSuppliedM3: before.waterSuppliedM3, operatingHours: before.operatingHours, notes: before.notes ?? "", billingPeriodId: before.billingPeriodId })
          // A newly created matching period need not rewrite the record: date remains authoritative.
          void periodId
          if (before.waterSuppliedM3 !== null && Number(before.waterSuppliedM3) > Number(before.waterProducedM3) && (before.notes?.trim().length ?? 0) < 10) fail("VALIDATION", "Explain why supplied volume exceeds produced volume before verification")
        }
        const [after] = await tx.update(logs).set({ status: next, verifiedAt: next === "verified" ? new Date() : null, verifiedById: next === "verified" ? user.id : null, version: before.version + 1, updatedAt: new Date() }).where(and(eq(logs.id, before.id), eq(logs.version, before.version))).returning()
        await logAudit(tx, user, data.operation, before.id, before, after, data.reason)
        return after
      })
    },
    async reviewLegacy(user: SessionUser, input: unknown) {
      const data = legacyReviewSchema.parse(input)
      return database.transaction(async tx => {
        const before = await getLockedLog(tx, user, data.id, "production.verify")
        checkVersion(before, data.expectedVersion)
        if (before.workflowVersion !== 0 || !before.recordedById || before.status === "void" || before.status === "verified") fail("VALIDATION", "Legacy entry must be unverified and have a recorder; revoke legacy approval through an approved remediation first")
        if (data.schemeId !== before.schemeId) fail("FORBIDDEN", "Legacy review cannot move a record to another scheme")
        await assertSource(tx, data, false)
        const billingPeriodId = await resolvePeriod(tx, data)
        const [after] = await tx.update(logs).set({ ...measurementValues(data), sourceId: data.sourceId, productionDate: data.productionDate, logDate: new Date(`${data.productionDate}T00:00:00Z`), billingPeriodId, workflowVersion: 1, requestKey: data.requestKey, requestFingerprint: fingerprint(data), status: "entered", verifiedAt: null, verifiedById: null, version: before.version + 1, updatedAt: new Date() }).where(eq(logs.id, before.id)).returning()
        await logAudit(tx, user, "legacy_review", before.id, before, after, data.reason)
        return after
      })
    },
    async saveSource(user: SessionUser, input: unknown) {
      const data = sourceSchema.parse(input)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.sources.manage", true)
        const [before] = data.id ? await tx.select().from(sources).where(and(eq(sources.id, data.id), eq(sources.schemeId, data.schemeId))).limit(1).for("update") : []
        if (data.id && !before) fail("FORBIDDEN", "Source is unavailable or outside this scheme")
        if (before) checkVersion(before, data.expectedVersion!)
        // Numeric arithmetic stays in PostgreSQL, including bucket conversion and precision rounding.
        const yieldSql = data.capacityMethod === "bucket_test" ? sql`(${data.containerVolumeLitres}::numeric / ${data.averageFillTimeSeconds}::numeric) * 3.6` : data.capacityMethod === "measured_hourly" ? sql`${data.installedPumpCapacityM3Hr}::numeric` : sql`null::numeric`
        const daily = data.regimeHoursPerDay === null ? sql`null::numeric` : sql`(${yieldSql}) * ${data.regimeHoursPerDay}::numeric`
        const values = { sourceName: data.sourceName, technology: data.technology, capacityMethod: data.capacityMethod,
          installedPumpCapacityM3Hr: data.installedPumpCapacityM3Hr, regimeHoursPerDay: data.regimeHoursPerDay,
          containerVolumeLitres: data.containerVolumeLitres, averageFillTimeSeconds: data.averageFillTimeSeconds,
          productionCapacityLSec: sql`(${yieldSql}) / 3.6`, currentCapacityM3Day: daily, practicalCapacityM3Month: null,
          capacityConfirmedAt: new Date(), capacityConfirmedById: user.id, updatedAt: new Date(),
        }
        const [after] = before ? await tx.update(sources).set({ ...values, version: before.version + 1 }).where(eq(sources.id, before.id)).returning() : await tx.insert(sources).values({ ...values, id: `src-${randomUUID()}`, schemeId: data.schemeId, version: 1, active: true }).returning()
        await audit({ user, action: `production.source.${before ? "update" : "create"}`, entityType: "water_scheme_source", entityId: after.id, details: { before: before ?? null, after } }, tx)
        return after
      })
    },
    async archiveSource(user: SessionUser, input: unknown) {
      const data = archiveSourceSchema.parse(input)
      return database.transaction(async tx => {
        const [before] = await tx.select().from(sources).where(and(eq(sources.id, data.id), inArray(sources.schemeId, sql`(select ${waterScheme.id} from ${waterScheme} where ${productionSchemeFilter(user, "production.sources.manage")} and ${productionSchemeFilter(user, "production.view")})`))).limit(1).for("update")
        if (!before) fail("FORBIDDEN", "Source is unavailable or outside your access")
        checkVersion(before, data.expectedVersion)
        if (!before.active) fail("CONFLICT", "Source is already archived")
        const [after] = await tx.update(sources).set({ active: false, version: before.version + 1, updatedAt: new Date() }).where(eq(sources.id, before.id)).returning()
        await audit({ user, action: "production.source.archive", entityType: "water_scheme_source", entityId: before.id, details: { before, after } }, tx)
        return after
      })
    },
  }
}
