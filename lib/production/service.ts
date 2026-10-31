import "server-only"
import { createHash, randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, lt, notInArray, or, sql } from "drizzle-orm"
import { db as applicationDb, type DatabaseTransaction } from "@/lib/db"
import {
  auditLog,
  billingPeriod,
  energyAssetAssignment,
  waterProductionElectricity,
  waterProductionFuel,
  waterProductionInterval,
  waterProductionLog as logs,
  waterScheme,
  waterSchemeEnergyAsset as energyAssets,
  waterSchemeSource as sources,
} from "@/lib/db/schema"
import { writeAudit } from "@/lib/audit"
import { canViewIntelligence, canViewProduction } from "@/lib/permissions"
import type { SessionUser } from "@/lib/session"
import { coverageDates } from "./allocation"
import {
  divideRoundHalfUp,
  electricityKwhCents,
  fromCents,
  fuelConsumedCents,
  intervalVolumeCents,
  meterDeltaCents,
  MeterReadingError,
  toCents,
} from "./decimal"
import { ownLogFilter, ownMeasurementFilter, productionReadableSchemeFilter, productionSchemeFilter } from "./scope"
import {
  archiveEnergyAssetSchema,
  archiveSourceSchema,
  batchMeasurementSchema,
  createLogSchema,
  editLogSchema,
  electricityMeasurementSchema,
  energyAssetAssignmentSchema,
  energyAssetSchema,
  fuelMeasurementSchema,
  intervalMeasurementSchema,
  legacyReviewSchema,
  measurementHistorySchema,
  measurementTransitionSchema,
  monthSchema,
  opaqueId,
  ProductionError,
  sourceSchema,
  transitionSchema,
  type ElectricityMeasurement,
  type FuelMeasurement,
  type IntervalMeasurement,
  type Measurement,
  type ReviewableMeasurementKind,
} from "./schemas"
import { loadProductionSummary, productionMonth } from "./reporting"

type Client = typeof applicationDb | DatabaseTransaction
const ZERO = BigInt(0)
const ONE = BigInt(1)
const HUNDREDTH_HOUR_MS = BigInt(36_000)
const fail = (code: ConstructorParameters<typeof ProductionError>[0], message: string): never => { throw new ProductionError(code, message) }
function fingerprint(data: Measurement) {
  return createHash("sha256").update(JSON.stringify([data.schemeId, data.sourceId, data.productionDate, data.waterProducedM3, data.waterSuppliedM3, data.operatingHours, data.notes])).digest("hex")
}
function intervalFingerprint(data: IntervalMeasurement) {
  return createHash("sha256").update(JSON.stringify([
    data.schemeId, data.sourceId, data.meterRef, data.openingReading, data.openingTimestamp, data.closingReading, data.closingTimestamp, data.meterUnit, data.multiplier, data.rolloverValue, data.isReset, data.notes,
  ])).digest("hex")
}
function electricityFingerprint(data: ElectricityMeasurement) {
  return createHash("sha256").update(JSON.stringify([
    data.schemeId, data.assetId, data.openingReadingKwh, data.openingTimestamp, data.closingReadingKwh, data.closingTimestamp, data.multiplier, data.rolloverValueKwh, data.isReset, data.pumpOperatingHours, data.electricityCostUgx, data.notes,
  ])).digest("hex")
}
function fuelFingerprint(data: FuelMeasurement) {
  return createHash("sha256").update(JSON.stringify([
    data.schemeId, data.assetId, data.fuelType, data.openingStockLitres, data.fuelPurchasedLitres, data.fuelTransfersInLitres, data.fuelTransfersOutLitres, data.fuelAdjustmentsLitres, data.closingStockLitres, data.generatorOperatingHours, data.fuelExpenditureUgx, data.coverageStartDate, data.coverageEndDate, data.notes,
  ])).digest("hex")
}
async function assertScheme(client: Client, user: SessionUser, schemeId: string, permission?: string, active = false) {
  const filter = permission ? and(productionSchemeFilter(user, "production.view", schemeId), productionSchemeFilter(user, permission, schemeId)) : productionReadableSchemeFilter(user, schemeId)
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
async function assertAsset(client: Client, schemeId: string, assetId: string, expectedType: "electricity_meter" | "generator") {
  const [asset] = await client.select().from(energyAssets).where(and(eq(energyAssets.id, assetId), eq(energyAssets.schemeId, schemeId), eq(energyAssets.active, true))).limit(1).for("share")
  if (!asset) fail("FORBIDDEN", "Energy asset is unavailable or outside this scheme")
  if (asset.assetType !== expectedType) fail("VALIDATION", `This measurement requires an active ${expectedType} asset`)
  return asset
}
async function countSupportedUnits(client: Client, schemeId: string, assetId: string): Promise<number> {
  const [row] = await client.select({ count: sql<number>`count(*)::int` }).from(energyAssetAssignment).where(and(eq(energyAssetAssignment.assetId, assetId), eq(energyAssetAssignment.schemeId, schemeId)))
  return Math.max(1, Number(row?.count ?? 0))
}
function checkVersion(row: { version: number }, expected: number) {
  if (row.version !== expected) fail("CONFLICT", "This record changed. Reload before continuing")
}
function runExact<T>(compute: () => T): T {
  try { return compute() } catch (error) {
    if (error instanceof MeterReadingError) fail("VALIDATION", error.message)
    throw error
  }
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
      const schemes = await database.select({ id: waterScheme.id, name: waterScheme.name }).from(waterScheme).where(productionReadableSchemeFilter(user)).orderBy(asc(waterScheme.name))
      const selectedId = schemeId ?? schemes[0]?.id
      if (!selectedId) {
        return {
          schemes,
          scheme: null,
          sources: [],
          energyAssets: [],
          assetAssignments: [],
          records: [],
          intervals: [],
          electricityRecords: [],
          fuelRecords: [],
          nextCursor: null,
          summary: null,
          month: selectedMonth,
          userId: user.id,
          capabilities: { create: false, verify: false, sources: false },
        }
      }
      const scheme = await assertScheme(database, user, selectedId)
      const bounds = productionMonth(selectedMonth)
      const [tables] = await database.select({
        hasAsset: sql<boolean>`to_regclass('water_scheme_energy_asset') is not null`,
        hasAssign: sql<boolean>`to_regclass('energy_asset_assignment') is not null`,
        hasInterval: sql<boolean>`to_regclass('water_production_interval') is not null`,
        hasElectricity: sql<boolean>`to_regclass('water_production_electricity') is not null`,
        hasFuel: sql<boolean>`to_regclass('water_production_fuel') is not null`,
      }).from(sql`(select 1) as _workspace_probe`)
      const rowFilter = ownMeasurementFilter(user)

      const [sourceRows, records, assetRows, assignmentRows, intervalRows, electricityRows, fuelRows] = await Promise.all([
        database.select().from(sources).where(eq(sources.schemeId, selectedId)).orderBy(asc(sources.sourceName)),
        database.select().from(logs).where(and(eq(logs.schemeId, selectedId), ownLogFilter(user),
          // Legacy dates are not inferred. They remain visible for explicit review.
          or(sql`to_char(${logs.productionDate}, 'YYYY-MM') = ${selectedMonth}`, eq(logs.workflowVersion, 0)), cursor ? lt(logs.id, cursor) : undefined,
        )).orderBy(desc(logs.id)).limit(31),
        tables?.hasAsset
          ? database.select().from(energyAssets).where(eq(energyAssets.schemeId, selectedId)).orderBy(asc(energyAssets.assetType), asc(energyAssets.assetRef))
          : Promise.resolve([]),
        tables?.hasAssign
          ? database.select().from(energyAssetAssignment).where(eq(energyAssetAssignment.schemeId, selectedId)).orderBy(asc(energyAssetAssignment.assetId), asc(energyAssetAssignment.sourceId))
          : Promise.resolve([]),
        tables?.hasInterval
          ? database.select().from(waterProductionInterval).where(and(
            eq(waterProductionInterval.schemeId, selectedId),
            sql`${waterProductionInterval.coverageStartDate} < ${bounds.end}::date and ${waterProductionInterval.coverageEndDate} >= ${bounds.start}::date`,
            rowFilter?.(waterProductionInterval),
          )).orderBy(desc(waterProductionInterval.openingTimestamp), desc(waterProductionInterval.id)).limit(100)
          : Promise.resolve([]),
        tables?.hasElectricity
          ? database.select().from(waterProductionElectricity).where(and(
            eq(waterProductionElectricity.schemeId, selectedId),
            sql`${waterProductionElectricity.coverageStartDate} < ${bounds.end}::date and ${waterProductionElectricity.coverageEndDate} >= ${bounds.start}::date`,
            rowFilter?.(waterProductionElectricity),
          )).orderBy(desc(waterProductionElectricity.openingTimestamp), desc(waterProductionElectricity.id)).limit(100)
          : Promise.resolve([]),
        tables?.hasFuel
          ? database.select().from(waterProductionFuel).where(and(
            eq(waterProductionFuel.schemeId, selectedId),
            sql`${waterProductionFuel.coverageStartDate} < ${bounds.end}::date and ${waterProductionFuel.coverageEndDate} >= ${bounds.start}::date`,
            rowFilter?.(waterProductionFuel),
          )).orderBy(desc(waterProductionFuel.coverageStartDate), desc(waterProductionFuel.id)).limit(100)
          : Promise.resolve([]),
      ])

      // Immutable review actors remain disqualified even after later corrections.
      const legacyReviews = records.length ? await database.select({ entityId: auditLog.entityId, userId: auditLog.userId }).from(auditLog)
        .where(and(eq(auditLog.entityType, "water_production_log"), eq(auditLog.action, "production.log.legacy_review"), inArray(auditLog.entityId, records.map(r => r.id)))) : []
      const visibleRecords = records.slice(0, 30).map(row => ({ ...row, legacyReviewerIds: legacyReviews.filter(a => a.entityId === row.id).map(a => a.userId) }))
      const permitted = async (code: string) => {
        const [row] = await database.select({ id: waterScheme.id }).from(waterScheme).where(and(productionSchemeFilter(user, "production.view", selectedId), productionSchemeFilter(user, code, selectedId))).limit(1)
        return !!row
      }
      const [create, verify, manage] = await Promise.all([permitted("production.create"), permitted("production.verify"), permitted("production.sources.manage")])
      const summary = await loadProductionSummary(database, [selectedId], selectedMonth, ownLogFilter(user), ownMeasurementFilter(user))
      return {
        schemes,
        scheme,
        sources: sourceRows,
        energyAssets: assetRows,
        assetAssignments: assignmentRows,
        records: visibleRecords,
        intervals: intervalRows,
        electricityRecords: electricityRows,
        fuelRecords: fuelRows,
        nextCursor: records.length > 30 ? records[29].id : null,
        summary: summary[0] ?? null,
        month: selectedMonth,
        userId: user.id,
        capabilities: { create, verify, sources: manage },
      }
    },
    async history(user: SessionUser, id: unknown) {
      const parsedId = opaqueId.parse(id)
      const [row] = await database.select().from(logs).where(and(eq(logs.id, parsedId), ownLogFilter(user), inArray(logs.schemeId, sql`(select ${waterScheme.id} from ${waterScheme} where ${productionReadableSchemeFilter(user)})`))).limit(1)
      if (!row) fail("FORBIDDEN", "Record is unavailable or outside your access")
      return database.select({ id: auditLog.id, action: auditLog.action, createdAt: auditLog.createdAt, userId: auditLog.userId, userName: auditLog.userName, details: auditLog.details }).from(auditLog).where(and(eq(auditLog.entityType, "water_production_log"), eq(auditLog.entityId, row.id))).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(100)
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
    async createBatch(user: SessionUser, input: unknown) {
      const data = batchMeasurementSchema.parse(input)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.create", true)
        const results = []
        for (const entry of data.entries) {
          const entryKey = `${data.requestKey}:${entry.productionDate}`
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${entryKey}`}, 0))`)
          const [existing] = await tx.select().from(logs).where(and(eq(logs.recordedById, user.id), eq(logs.requestKey, entryKey))).limit(1)
          if (existing) {
            if (existing.requestFingerprint !== fingerprint(entry)) fail("CONFLICT", "Retry key already belongs to a different batch entry")
            results.push(existing)
            continue
          }
          await assertSource(tx, entry, true)
          const billingPeriodId = await resolvePeriod(tx, entry)
          const [row] = await tx.insert(logs).values({
            id: `prod-${randomUUID()}`,
            schemeId: entry.schemeId,
            sourceId: entry.sourceId,
            productionDate: entry.productionDate,
            logDate: new Date(`${entry.productionDate}T00:00:00Z`),
            billingPeriodId,
            ...measurementValues(entry),
            workflowVersion: 1,
            version: 1,
            status: "entered",
            recordedById: user.id,
            requestKey: entryKey,
            requestFingerprint: fingerprint(entry),
          }).returning()
          await logAudit(tx, user, "create_batch", row.id, null, row)
          results.push(row)
        }
        return results
      })
    },
    async createInterval(user: SessionUser, input: unknown) {
      const data = intervalMeasurementSchema.parse(input)
      const fp = intervalFingerprint(data)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.create", true)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${data.requestKey}`}, 0))`)
        const [existing] = await tx.select().from(waterProductionInterval).where(and(eq(waterProductionInterval.recordedById, user.id), eq(waterProductionInterval.requestKey, data.requestKey))).limit(1)
        if (existing) {
          await assertScheme(tx, user, existing.schemeId, "production.create")
          if (existing.requestFingerprint !== fp) fail("CONFLICT", "Retry key already belongs to a different submission")
          return existing
        }
        await assertSource(tx, { schemeId: data.schemeId, sourceId: data.sourceId }, true)

        const opening = new Date(data.openingTimestamp)
        const closing = new Date(data.closingTimestamp)
        const elapsedMs = closing.getTime() - opening.getTime()
        const coverageHoursCents = runExact(() => divideRoundHalfUp(BigInt(elapsedMs), HUNDREDTH_HOUR_MS))
        if (coverageHoursCents <= ZERO) fail("VALIDATION", "Interval duration must be at least 0.01 hours")

        const calculatedVolumeM3 = runExact(() => {
          const delta = meterDeltaCents(data.openingReading, data.closingReading, data.rolloverValue, data.isReset)
          return fromCents(intervalVolumeCents(delta, data.multiplier, data.meterUnit))
        })
        const { start: coverageStartDate, end: coverageEndDate } = coverageDates(opening, closing)
        const isCrossMonth = coverageStartDate.slice(0, 7) !== coverageEndDate.slice(0, 7)

        // Serialise per source (same lock key as trigger 0075) to reject overlapping meter intervals deterministically.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`water_production_interval:${data.sourceId}`}, 0))`)
        const [intervalOverlap] = await tx.select({ id: waterProductionInterval.id }).from(waterProductionInterval).where(and(
          eq(waterProductionInterval.sourceId, data.sourceId),
          sql`${waterProductionInterval.status} <> 'void'`,
          sql`${waterProductionInterval.openingTimestamp} < ${closing} and ${waterProductionInterval.closingTimestamp} > ${opening}`,
        )).limit(1)
        if (intervalOverlap) fail("CONFLICT", "This meter interval overlaps an existing non-void interval for this source")

        // Check overlap with daily observations on the same source (flagged for independent reconciliation).
        const [dailyOverlap] = await tx.select({ id: logs.id }).from(logs).where(and(
          eq(logs.sourceId, data.sourceId),
          sql`${logs.status} <> 'void'`,
          sql`${logs.productionDate} >= ${coverageStartDate}::date AND ${logs.productionDate} <= ${coverageEndDate}::date`,
        )).limit(1)

        const status = dailyOverlap ? "flagged" : "entered"
        const notes = dailyOverlap
          ? `OVERLAPPING_DAILY_DATA_CONFLICT: Daily logs exist for this source in range ${coverageStartDate} to ${coverageEndDate}. ${data.notes}`.trim()
          : (data.notes || null)

        const [row] = await tx.insert(waterProductionInterval).values({
          id: `int-${randomUUID()}`,
          schemeId: data.schemeId,
          sourceId: data.sourceId,
          meterRef: data.meterRef,
          openingReading: data.openingReading,
          openingTimestamp: opening,
          closingReading: data.closingReading,
          closingTimestamp: closing,
          meterUnit: data.meterUnit,
          multiplier: data.multiplier,
          rolloverValue: data.rolloverValue,
          isReset: data.isReset,
          calculatedVolumeM3,
          coverageHours: fromCents(coverageHoursCents),
          coverageStartDate,
          coverageEndDate,
          isCrossMonth,
          status,
          version: 1,
          recordedById: user.id,
          requestKey: data.requestKey,
          requestFingerprint: fp,
          notes,
        }).returning()

        await audit({ user, action: "production.interval.create", entityType: "water_production_interval", entityId: row.id, details: { after: row } }, tx)
        return row
      })
    },
    async createElectricity(user: SessionUser, input: unknown) {
      const data = electricityMeasurementSchema.parse(input)
      const fp = electricityFingerprint(data)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.create", true)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${data.requestKey}`}, 0))`)
        const [existing] = await tx.select().from(waterProductionElectricity).where(and(eq(waterProductionElectricity.recordedById, user.id), eq(waterProductionElectricity.requestKey, data.requestKey))).limit(1)
        if (existing) {
          await assertScheme(tx, user, existing.schemeId, "production.create")
          if (existing.requestFingerprint !== fp) fail("CONFLICT", "Retry key already belongs to a different submission")
          return existing
        }
        await assertAsset(tx, data.schemeId, data.assetId, "electricity_meter")
        const supportedUnits = await countSupportedUnits(tx, data.schemeId, data.assetId)

        const opening = new Date(data.openingTimestamp)
        const closing = new Date(data.closingTimestamp)
        const elapsedMs = closing.getTime() - opening.getTime()
        if (data.pumpOperatingHours !== null) {
          const maxHoursCents = runExact(() => divideRoundHalfUp(BigInt(elapsedMs) * BigInt(supportedUnits), HUNDREDTH_HOUR_MS))
          const reportedCents = runExact(() => toCents(data.pumpOperatingHours!))
          if (reportedCents > maxHoursCents + ONE) {
            fail("VALIDATION", `Pump operating hours (${data.pumpOperatingHours}) exceed elapsed interval capacity (${fromCents(maxHoursCents)} h across ${supportedUnits} supported unit(s))`)
          }
        }

        const calculatedConsumedKwh = runExact(() => {
          const delta = meterDeltaCents(data.openingReadingKwh, data.closingReadingKwh, data.rolloverValueKwh, data.isReset)
          return fromCents(electricityKwhCents(delta, data.multiplier))
        })
        const { start: coverageStartDate, end: coverageEndDate } = coverageDates(opening, closing)
        const isCrossMonth = coverageStartDate.slice(0, 7) !== coverageEndDate.slice(0, 7)

        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`water_production_electricity:${data.assetId}`}, 0))`)
        const [overlap] = await tx.select({ id: waterProductionElectricity.id }).from(waterProductionElectricity).where(and(
          eq(waterProductionElectricity.assetId, data.assetId),
          sql`${waterProductionElectricity.status} <> 'void'`,
          sql`${waterProductionElectricity.openingTimestamp} < ${closing} and ${waterProductionElectricity.closingTimestamp} > ${opening}`,
        )).limit(1)
        if (overlap) fail("CONFLICT", "This electricity meter interval overlaps an existing non-void interval for this meter")

        const [row] = await tx.insert(waterProductionElectricity).values({
          id: `elec-${randomUUID()}`,
          schemeId: data.schemeId,
          assetId: data.assetId,
          openingReadingKwh: data.openingReadingKwh,
          openingTimestamp: opening,
          closingReadingKwh: data.closingReadingKwh,
          closingTimestamp: closing,
          multiplier: data.multiplier,
          rolloverValueKwh: data.rolloverValueKwh,
          isReset: data.isReset,
          calculatedConsumedKwh,
          // Never fabricate pump operating hours from elapsed wall-clock duration when none were observed.
          pumpOperatingHours: data.pumpOperatingHours,
          electricityCostUgx: data.electricityCostUgx,
          coverageStartDate,
          coverageEndDate,
          isCrossMonth,
          status: "entered",
          version: 1,
          recordedById: user.id,
          requestKey: data.requestKey,
          requestFingerprint: fp,
          notes: data.notes || null,
        }).returning()

        await audit({ user, action: "production.electricity.create", entityType: "water_production_electricity", entityId: row.id, details: { after: row } }, tx)
        return row
      })
    },
    async createFuel(user: SessionUser, input: unknown) {
      const data = fuelMeasurementSchema.parse(input)
      const fp = fuelFingerprint(data)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.create", true)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${user.id}:${data.requestKey}`}, 0))`)
        const [existing] = await tx.select().from(waterProductionFuel).where(and(eq(waterProductionFuel.recordedById, user.id), eq(waterProductionFuel.requestKey, data.requestKey))).limit(1)
        if (existing) {
          await assertScheme(tx, user, existing.schemeId, "production.create")
          if (existing.requestFingerprint !== fp) fail("CONFLICT", "Retry key already belongs to a different submission")
          return existing
        }
        const asset = await assertAsset(tx, data.schemeId, data.assetId, "generator")
        if (asset.fuelType && asset.fuelType !== data.fuelType) {
          fail("VALIDATION", `Fuel type (${data.fuelType}) does not match generator configured fuel type (${asset.fuelType})`)
        }

        const consumedCents = runExact(() => fuelConsumedCents({
          openingStockLitres: data.openingStockLitres,
          closingStockLitres: data.closingStockLitres,
          fuelPurchasedLitres: data.fuelPurchasedLitres,
          fuelTransfersInLitres: data.fuelTransfersInLitres,
          fuelTransfersOutLitres: data.fuelTransfersOutLitres,
          fuelAdjustmentsLitres: data.fuelAdjustmentsLitres,
        }))
        if (consumedCents !== null && consumedCents < ZERO) {
          fail("VALIDATION", "Calculated fuel consumption cannot be negative. Check stock readings and transfers.")
        }
        const calculatedConsumedLitres = consumedCents !== null ? fromCents(consumedCents) : null

        if (calculatedConsumedLitres !== null) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`water_production_fuel:${data.assetId}`}, 0))`)
          const [overlap] = await tx.select({ id: waterProductionFuel.id }).from(waterProductionFuel).where(and(
            eq(waterProductionFuel.assetId, data.assetId),
            sql`${waterProductionFuel.status} <> 'void'`,
            sql`${waterProductionFuel.calculatedConsumedLitres} is not null`,
            sql`${waterProductionFuel.coverageStartDate} <= ${data.coverageEndDate}::date and ${waterProductionFuel.coverageEndDate} >= ${data.coverageStartDate}::date`,
          )).limit(1)
          if (overlap) fail("CONFLICT", "This fuel stock-reconciliation period overlaps an existing non-void period for this generator")
        }

        const isCrossMonth = data.coverageStartDate.slice(0, 7) !== data.coverageEndDate.slice(0, 7)
        const notes = calculatedConsumedLitres === null
          ? `UNAVAILABLE: Fuel consumption cannot be established due to missing opening or closing stock readings. ${data.notes}`.trim()
          : (data.notes || null)

        const [row] = await tx.insert(waterProductionFuel).values({
          id: `fuel-${randomUUID()}`,
          schemeId: data.schemeId,
          assetId: data.assetId,
          fuelType: data.fuelType,
          openingStockLitres: data.openingStockLitres,
          fuelPurchasedLitres: data.fuelPurchasedLitres ?? "0.00",
          fuelTransfersInLitres: data.fuelTransfersInLitres ?? "0.00",
          fuelTransfersOutLitres: data.fuelTransfersOutLitres ?? "0.00",
          fuelAdjustmentsLitres: data.fuelAdjustmentsLitres ?? "0.00",
          closingStockLitres: data.closingStockLitres,
          calculatedConsumedLitres,
          generatorOperatingHours: data.generatorOperatingHours,
          fuelExpenditureUgx: data.fuelExpenditureUgx,
          coverageStartDate: data.coverageStartDate,
          coverageEndDate: data.coverageEndDate,
          isCrossMonth,
          status: "entered",
          version: 1,
          recordedById: user.id,
          requestKey: data.requestKey,
          requestFingerprint: fp,
          notes,
        }).returning()

        await audit({ user, action: "production.fuel.create", entityType: "water_production_fuel", entityId: row.id, details: { after: row } }, tx)
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
          const [ownReview] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(
            eq(auditLog.entityType, "water_production_log"), eq(auditLog.entityId, before.id),
            eq(auditLog.action, "production.log.legacy_review"), eq(auditLog.userId, user.id),
          )).limit(1)
          if (ownReview) fail("FORBIDDEN", "A different verifier must approve a record you reviewed as legacy")
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
    async saveEnergyAsset(user: SessionUser, input: unknown) {
      const data = energyAssetSchema.parse(input)
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.sources.manage", !data.id)
        const [before] = data.id
          ? await tx.select().from(energyAssets).where(and(eq(energyAssets.id, data.id), eq(energyAssets.schemeId, data.schemeId))).limit(1).for("update")
          : []
        if (data.id && !before) fail("FORBIDDEN", "Energy asset is unavailable or outside this scheme")
        if (before) {
          if (before.assetType !== data.assetType) {
            fail("VALIDATION", "Energy asset type cannot be changed; archive this asset and register a new one")
          }
          if (before.assetType === "generator" && before.fuelType && before.fuelType !== data.fuelType) {
            const [existingFuel] = await tx.select({ id: waterProductionFuel.id }).from(waterProductionFuel).where(and(
              eq(waterProductionFuel.assetId, before.id),
              sql`${waterProductionFuel.status} <> 'void'`,
            )).limit(1)
            if (existingFuel) fail("CONFLICT", "Generator fuel type cannot be changed once non-void fuel records exist")
          }
          const [after] = await tx.update(energyAssets).set({
            assetRef: data.assetRef,
            fuelType: data.fuelType,
            updatedAt: new Date(),
          }).where(eq(energyAssets.id, before.id)).returning()
          await audit({ user, action: "production.energy_asset.update", entityType: "water_scheme_energy_asset", entityId: after.id, details: { before, after } }, tx)
          return after
        }
        const [after] = await tx.insert(energyAssets).values({
          id: `asset-${randomUUID()}`,
          schemeId: data.schemeId,
          assetType: data.assetType,
          assetRef: data.assetRef,
          fuelType: data.fuelType,
          active: true,
        }).returning()
        await audit({ user, action: "production.energy_asset.create", entityType: "water_scheme_energy_asset", entityId: after.id, details: { before: null, after } }, tx)
        return after
      })
    },
    async archiveEnergyAsset(user: SessionUser, input: unknown) {
      const data = archiveEnergyAssetSchema.parse(input)
      return database.transaction(async tx => {
        const [before] = await tx.select().from(energyAssets).where(and(
          eq(energyAssets.id, data.id),
          inArray(energyAssets.schemeId, sql`(select ${waterScheme.id} from ${waterScheme} where ${productionSchemeFilter(user, "production.sources.manage")} and ${productionSchemeFilter(user, "production.view")})`),
        )).limit(1).for("update")
        if (!before) fail("FORBIDDEN", "Energy asset is unavailable or outside your access")
        if (!before.active) fail("CONFLICT", "Energy asset is already archived")
        const [after] = await tx.update(energyAssets).set({ active: false, updatedAt: new Date() }).where(eq(energyAssets.id, before.id)).returning()
        await audit({ user, action: "production.energy_asset.archive", entityType: "water_scheme_energy_asset", entityId: before.id, details: { before, after } }, tx)
        return after
      })
    },
    async assignEnergyAssetSources(user: SessionUser, input: unknown) {
      const data = energyAssetAssignmentSchema.parse(input)
      const uniqueSourceIds = [...new Set(data.sourceIds)]
      return database.transaction(async tx => {
        await assertScheme(tx, user, data.schemeId, "production.sources.manage", true)
        const [asset] = await tx.select().from(energyAssets).where(and(
          eq(energyAssets.id, data.assetId),
          eq(energyAssets.schemeId, data.schemeId),
        )).limit(1).for("update")
        if (!asset) fail("FORBIDDEN", "Energy asset is unavailable or outside this scheme")
        if (!asset.active) fail("CONFLICT", "Cannot assign water sources to an archived energy asset")

        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`energy_asset_assignment:${asset.id}`}, 0))`)

        if (uniqueSourceIds.length > 0) {
          const validSources = await tx.select({ id: sources.id }).from(sources).where(and(
            eq(sources.schemeId, data.schemeId),
            inArray(sources.id, uniqueSourceIds),
          )).for("share")
          if (validSources.length !== uniqueSourceIds.length) {
            fail("FORBIDDEN", "One or more selected water sources do not belong to this scheme")
          }
        }

        if (asset.assetType === "electricity_meter") {
          const nextSupportedUnits = Math.max(1, uniqueSourceIds.length)
          const existingElec = await tx.select({
            id: waterProductionElectricity.id,
            openingTimestamp: waterProductionElectricity.openingTimestamp,
            closingTimestamp: waterProductionElectricity.closingTimestamp,
            pumpOperatingHours: waterProductionElectricity.pumpOperatingHours,
          }).from(waterProductionElectricity).where(and(
            eq(waterProductionElectricity.assetId, asset.id),
            sql`${waterProductionElectricity.status} <> 'void'`,
            sql`${waterProductionElectricity.pumpOperatingHours} is not null`,
          ))
          for (const row of existingElec) {
            const elapsedMs = row.closingTimestamp.getTime() - row.openingTimestamp.getTime()
            const maxHoursCents = divideRoundHalfUp(BigInt(elapsedMs) * BigInt(nextSupportedUnits), HUNDREDTH_HOUR_MS)
            if (toCents(row.pumpOperatingHours!) > maxHoursCents + ONE) {
              fail("CONFLICT", `Cannot reduce assigned sources below ${nextSupportedUnits} unit(s): existing electricity record ${row.id} recorded ${row.pumpOperatingHours} pump-hours`)
            }
          }
        }

        const before = await tx.select().from(energyAssetAssignment).where(and(
          eq(energyAssetAssignment.schemeId, data.schemeId),
          eq(energyAssetAssignment.assetId, asset.id),
        )).orderBy(asc(energyAssetAssignment.sourceId))

        if (uniqueSourceIds.length === 0) {
          await tx.delete(energyAssetAssignment).where(and(
            eq(energyAssetAssignment.schemeId, data.schemeId),
            eq(energyAssetAssignment.assetId, asset.id),
          ))
        } else {
          await tx.delete(energyAssetAssignment).where(and(
            eq(energyAssetAssignment.schemeId, data.schemeId),
            eq(energyAssetAssignment.assetId, asset.id),
            notInArray(energyAssetAssignment.sourceId, uniqueSourceIds),
          ))
          const existingSet = new Set(before.map(b => b.sourceId))
          const toInsert = uniqueSourceIds.filter(id => !existingSet.has(id)).map(sourceId => ({
            id: `assign-${randomUUID()}`,
            schemeId: data.schemeId,
            assetId: asset.id,
            sourceId,
          }))
          if (toInsert.length > 0) {
            await tx.insert(energyAssetAssignment).values(toInsert).onConflictDoNothing()
          }
        }

        const after = await tx.select().from(energyAssetAssignment).where(and(
          eq(energyAssetAssignment.schemeId, data.schemeId),
          eq(energyAssetAssignment.assetId, asset.id),
        )).orderBy(asc(energyAssetAssignment.sourceId))

        await audit({
          user,
          action: "production.energy_asset.assign_sources",
          entityType: "water_scheme_energy_asset",
          entityId: asset.id,
          details: { before, after },
        }, tx)
        return after
      })
    },
    async transitionMeasurement(user: SessionUser, input: unknown) {
      const data = measurementTransitionSchema.parse(input)
      const authorisedSchemes = sql`(select ${waterScheme.id} from ${waterScheme} where ${productionSchemeFilter(user, "production.view")} and ${productionSchemeFilter(user, "production.verify")})`
      const next = { verify: "verified", flag: "flagged", revoke: "flagged", void: "void" }[data.operation]

      const validateTransitionState = (before: { recordedById: string; status: string; version: number }) => {
        checkVersion(before, data.expectedVersion)
        if (before.recordedById === user.id) fail("FORBIDDEN", "An independent verifier must review this record")
        if (
          before.status === "void" ||
          (data.operation === "verify" && before.status !== "entered") ||
          (data.operation === "flag" && before.status !== "entered") ||
          (data.operation === "revoke" && before.status !== "verified")
        ) {
          fail("CONFLICT", "This transition is not valid for the current state")
        }
      }

      return database.transaction(async tx => {
        if (data.recordKind === "interval") {
          const [before] = await tx.select().from(waterProductionInterval).where(and(
            eq(waterProductionInterval.id, data.id),
            inArray(waterProductionInterval.schemeId, authorisedSchemes),
          )).limit(1).for("update")
          if (!before) fail("FORBIDDEN", "Record is unavailable or outside your access")
          await assertScheme(tx, user, before.schemeId, "production.verify")
          validateTransitionState(before)

          if (data.operation === "verify") {
            await assertSource(tx, { schemeId: before.schemeId, sourceId: before.sourceId }, false)
            const [dailyOverlap] = await tx.select({ id: logs.id }).from(logs).where(and(
              eq(logs.sourceId, before.sourceId),
              eq(logs.workflowVersion, 1),
              sql`${logs.status} <> 'void'`,
              sql`${logs.productionDate} >= ${before.coverageStartDate}::date AND ${logs.productionDate} <= ${before.coverageEndDate}::date`,
            )).limit(1)
            if (dailyOverlap) {
              fail("CONFLICT", "Cannot verify water interval while overlapping non-void daily production logs exist on this source; void or reconcile the duplicate records first")
            }
          }

          const [after] = await tx.update(waterProductionInterval).set({
            status: next,
            verifiedAt: next === "verified" ? new Date() : null,
            verifiedById: next === "verified" ? user.id : null,
            version: before.version + 1,
            updatedAt: new Date(),
          }).where(and(eq(waterProductionInterval.id, before.id), eq(waterProductionInterval.version, before.version))).returning()
          await audit({
            user,
            action: `production.interval.${data.operation}`,
            entityType: "water_production_interval",
            entityId: before.id,
            details: { before, after, reason: data.reason || null },
          }, tx)
          return after
        }

        if (data.recordKind === "electricity") {
          const [before] = await tx.select().from(waterProductionElectricity).where(and(
            eq(waterProductionElectricity.id, data.id),
            inArray(waterProductionElectricity.schemeId, authorisedSchemes),
          )).limit(1).for("update")
          if (!before) fail("FORBIDDEN", "Record is unavailable or outside your access")
          await assertScheme(tx, user, before.schemeId, "production.verify")
          validateTransitionState(before)

          if (data.operation === "verify" && before.pumpOperatingHours !== null) {
            const supportedUnits = await countSupportedUnits(tx, before.schemeId, before.assetId)
            const elapsedMs = before.closingTimestamp.getTime() - before.openingTimestamp.getTime()
            const maxHoursCents = divideRoundHalfUp(BigInt(elapsedMs) * BigInt(supportedUnits), HUNDREDTH_HOUR_MS)
            if (toCents(before.pumpOperatingHours) > maxHoursCents + ONE) {
              fail("VALIDATION", `Pump operating hours (${before.pumpOperatingHours}) exceed elapsed interval capacity (${fromCents(maxHoursCents)} h across ${supportedUnits} supported unit(s))`)
            }
          }

          const [after] = await tx.update(waterProductionElectricity).set({
            status: next,
            verifiedAt: next === "verified" ? new Date() : null,
            verifiedById: next === "verified" ? user.id : null,
            version: before.version + 1,
            updatedAt: new Date(),
          }).where(and(eq(waterProductionElectricity.id, before.id), eq(waterProductionElectricity.version, before.version))).returning()
          await audit({
            user,
            action: `production.electricity.${data.operation}`,
            entityType: "water_production_electricity",
            entityId: before.id,
            details: { before, after, reason: data.reason || null },
          }, tx)
          return after
        }

        const [before] = await tx.select().from(waterProductionFuel).where(and(
          eq(waterProductionFuel.id, data.id),
          inArray(waterProductionFuel.schemeId, authorisedSchemes),
        )).limit(1).for("update")
        if (!before) fail("FORBIDDEN", "Record is unavailable or outside your access")
        await assertScheme(tx, user, before.schemeId, "production.verify")
        validateTransitionState(before)

        const [after] = await tx.update(waterProductionFuel).set({
          status: next,
          verifiedAt: next === "verified" ? new Date() : null,
          verifiedById: next === "verified" ? user.id : null,
          version: before.version + 1,
          updatedAt: new Date(),
        }).where(and(eq(waterProductionFuel.id, before.id), eq(waterProductionFuel.version, before.version))).returning()
        await audit({
          user,
          action: `production.fuel.${data.operation}`,
          entityType: "water_production_fuel",
          entityId: before.id,
          details: { before, after, reason: data.reason || null },
        }, tx)
        return after
      })
    },
    async transitionInterval(user: SessionUser, input: Omit< { id: string; expectedVersion: number; operation: "verify" | "flag" | "revoke" | "void"; reason?: string }, "recordKind">) {
      return this.transitionMeasurement(user, { ...input, recordKind: "interval" as ReviewableMeasurementKind })
    },
    async transitionElectricity(user: SessionUser, input: Omit<{ id: string; expectedVersion: number; operation: "verify" | "flag" | "revoke" | "void"; reason?: string }, "recordKind">) {
      return this.transitionMeasurement(user, { ...input, recordKind: "electricity" as ReviewableMeasurementKind })
    },
    async transitionFuel(user: SessionUser, input: Omit<{ id: string; expectedVersion: number; operation: "verify" | "flag" | "revoke" | "void"; reason?: string }, "recordKind">) {
      return this.transitionMeasurement(user, { ...input, recordKind: "fuel" as ReviewableMeasurementKind })
    },
    async measurementHistory(user: SessionUser, input: unknown) {
      const data = measurementHistorySchema.parse(input)
      if (data.recordKind === "daily") return this.history(user, data.id)

      const readableSchemes = sql`(select ${waterScheme.id} from ${waterScheme} where ${productionReadableSchemeFilter(user)})`
      const rowFilter = ownMeasurementFilter(user)

      const config = {
        interval: { table: waterProductionInterval, entityType: "water_production_interval" },
        electricity: { table: waterProductionElectricity, entityType: "water_production_electricity" },
        fuel: { table: waterProductionFuel, entityType: "water_production_fuel" },
      }[data.recordKind]

      const [row] = await database.select({ id: config.table.id }).from(config.table).where(and(
        eq(config.table.id, data.id),
        rowFilter?.(config.table),
        inArray(config.table.schemeId, readableSchemes),
      )).limit(1)
      if (!row) fail("FORBIDDEN", "Record is unavailable or outside your access")

      return database.select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
        userName: auditLog.userName,
        details: auditLog.details,
      }).from(auditLog).where(and(
        eq(auditLog.entityType, config.entityType),
        eq(auditLog.entityId, row.id),
      )).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(100)
    },
  }
}
