import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  date,
  integer,
  smallint,
  foreignKey,
  check,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { organization, cluster, branch, waterScheme } from "./hierarchy"
import { billingPeriod } from "./billing"

/**
 * Water Scheme Sources (Gravity springs, pumped boreholes, solar/grid/generator).
 */
export const waterSchemeSource = pgTable(
  "water_scheme_source",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "cascade" }),
    sourceName: text("sourceName").notNull(),
    technology: text("technology").notNull().default("gravity"), // 'gravity' | 'pumped_grid' | 'pumped_solar' | 'pumped_generator' | 'hybrid'
    installedPumpCapacityM3Hr: numeric("installedPumpCapacityM3Hr", { precision: 12, scale: 2 }),
    regimeHoursPerDay: numeric("regimeHoursPerDay", { precision: 5, scale: 2 }),
    containerVolumeLitres: numeric("containerVolumeLitres", { precision: 12, scale: 2 }),
    averageFillTimeSeconds: numeric("averageFillTimeSeconds", { precision: 12, scale: 2 }),
    productionCapacityLSec: numeric("productionCapacityLSec", { precision: 12, scale: 4 }).default("0"),
    currentCapacityM3Day: numeric("currentCapacityM3Day", { precision: 12, scale: 2 }),
    practicalCapacityM3Month: numeric("practicalCapacityM3Month", { precision: 12, scale: 2 }),
    active: boolean("active").notNull().default(true),
    capacityMethod: text("capacityMethod").notNull().default("unknown"),
    capacityConfirmedAt: timestamp("capacityConfirmedAt"),
    capacityConfirmedById: text("capacityConfirmedById").references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("water_scheme_source_scheme_idx").on(table.schemeId),
    idSchemeUnq: uniqueIndex("production_source_id_scheme_unq").on(table.id, table.schemeId),
    sourceValues: check("production_source_values", sql`
      ${table.version} > 0 AND ${table.technology} IN ('gravity','pumped_grid','pumped_solar','pumped_generator','hybrid')
      AND ${table.capacityMethod} IN ('unknown','measured_hourly','bucket_test')
      AND (${table.installedPumpCapacityM3Hr} IS NULL OR (${table.installedPumpCapacityM3Hr} >= 0 AND ${table.installedPumpCapacityM3Hr}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.regimeHoursPerDay} IS NULL OR (${table.regimeHoursPerDay} BETWEEN 0 AND 24 AND ${table.regimeHoursPerDay}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.containerVolumeLitres} IS NULL OR (${table.containerVolumeLitres} >= 0 AND ${table.containerVolumeLitres}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.averageFillTimeSeconds} IS NULL OR (${table.averageFillTimeSeconds} >= 0 AND ${table.averageFillTimeSeconds}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.currentCapacityM3Day} IS NULL OR (${table.currentCapacityM3Day} >= 0 AND ${table.currentCapacityM3Day}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.productionCapacityLSec} IS NULL OR (${table.productionCapacityLSec} >= 0 AND ${table.productionCapacityLSec}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.practicalCapacityM3Month} IS NULL OR (${table.practicalCapacityM3Month} >= 0 AND ${table.practicalCapacityM3Month}::text NOT IN ('NaN','Infinity','-Infinity')))
      AND (${table.capacityConfirmedAt} IS NULL OR (${table.capacityConfirmedById} IS NOT NULL AND
        (${table.capacityMethod} = 'unknown' OR (${table.capacityMethod} = 'measured_hourly' AND ${table.installedPumpCapacityM3Hr} IS NOT NULL)
          OR (${table.capacityMethod} = 'bucket_test' AND ${table.containerVolumeLitres} IS NOT NULL AND ${table.averageFillTimeSeconds} IS NOT NULL AND ${table.containerVolumeLitres} > 0 AND ${table.averageFillTimeSeconds} > 0))))`),
  })
)

/**
 * Water Production Log (Daily/Monthly produced & supplied m3).
 */
export const waterProductionLog = pgTable(
  "water_production_log",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "restrict" }),
    sourceId: text("sourceId"),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, { onDelete: "restrict" }),
    productionDate: date("productionDate"),
    workflowVersion: smallint("workflowVersion").notNull().default(0),
    version: integer("version").notNull().default(1),
    requestKey: text("requestKey"),
    requestFingerprint: text("requestFingerprint"),
    verifiedAt: timestamp("verifiedAt"),
    verifiedById: text("verifiedById").references(() => user.id, { onDelete: "restrict" }),
    logDate: timestamp("logDate").notNull(),
    waterProducedM3: numeric("waterProducedM3", { precision: 12, scale: 2 }).notNull().default("0"),
    waterSuppliedM3: numeric("waterSuppliedM3", { precision: 12, scale: 2 }),
    operatingHours: numeric("operatingHours", { precision: 5, scale: 2 }),
    status: text("status").notNull().default("entered"), // entered | verified | flagged | void
    recordedById: text("recordedById").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemePeriodIdx: index("water_production_log_scheme_period_idx").on(table.schemeId, table.billingPeriodId),
    logDateIdx: index("water_production_log_date_idx").on(table.logDate),
    monthIdx: index("production_scheme_date_status_idx").on(table.schemeId, table.productionDate, table.status),
    sourceDayUnq: uniqueIndex("production_source_day_unq").on(table.sourceId, table.productionDate).where(sql`${table.workflowVersion} = 1 AND ${table.status} <> 'void'`),
    requestUnq: uniqueIndex("production_request_unq").on(table.recordedById, table.requestKey).where(sql`${table.requestKey} IS NOT NULL`),
    sourceSchemeFk: foreignKey({ name: "production_source_scheme_fk", columns: [table.sourceId, table.schemeId], foreignColumns: [waterSchemeSource.id, waterSchemeSource.schemeId] }).onDelete("restrict"),
    workflowCheck: check("production_workflow_shape", sql`${table.workflowVersion} IN (0,1) AND ${table.version} > 0 AND (${table.workflowVersion} = 0 OR (${table.productionDate} IS NOT NULL AND ${table.sourceId} IS NOT NULL AND ${table.recordedById} IS NOT NULL AND ${table.requestKey} IS NOT NULL AND ${table.requestKey} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND ${table.requestFingerprint} IS NOT NULL AND ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'))`),
    valuesCheck: check("production_values", sql`${table.waterProducedM3} >= 0 AND ${table.waterProducedM3}::text NOT IN ('NaN','Infinity','-Infinity') AND (${table.waterSuppliedM3} IS NULL OR (${table.waterSuppliedM3} >= 0 AND ${table.waterSuppliedM3}::text NOT IN ('NaN','Infinity','-Infinity'))) AND (${table.operatingHours} IS NULL OR (${table.operatingHours} BETWEEN 0 AND 24 AND ${table.operatingHours}::text NOT IN ('NaN','Infinity','-Infinity')))`),
    stateCheck: check("production_state", sql`${table.status} IN ('entered','flagged','verified','void') AND (${table.workflowVersion} = 0 OR ((${table.status} = 'verified' AND ${table.verifiedById} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedById} <> ${table.recordedById}) OR (${table.status} <> 'verified' AND ${table.verifiedById} IS NULL AND ${table.verifiedAt} IS NULL)))`),
  })
)

/**
 * Multi-Day Interval Measurements (Cumulative Meter Readings).
 * Row immutability, state transitions, universal self-approval (0072), and concurrency-safe overlap
 * guards are enforced by PostgreSQL triggers installed in db/migrations/0075_production_energy.sql.
 */
export const waterProductionInterval = pgTable(
  "water_production_interval",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "restrict" }),
    sourceId: text("sourceId").notNull(),
    meterRef: text("meterRef").notNull(),
    openingReading: numeric("openingReading", { precision: 12, scale: 2 }).notNull(),
    openingTimestamp: timestamp("openingTimestamp").notNull(),
    closingReading: numeric("closingReading", { precision: 12, scale: 2 }).notNull(),
    closingTimestamp: timestamp("closingTimestamp").notNull(),
    meterUnit: text("meterUnit").notNull().default("m3"), // m3 | litres | gallons
    multiplier: numeric("multiplier", { precision: 6, scale: 2 }).notNull().default("1.00"),
    rolloverValue: numeric("rolloverValue", { precision: 12, scale: 2 }),
    isReset: boolean("isReset").notNull().default(false),
    calculatedVolumeM3: numeric("calculatedVolumeM3", { precision: 12, scale: 2 }).notNull(),
    coverageHours: numeric("coverageHours", { precision: 8, scale: 2 }).notNull(),
    coverageStartDate: date("coverageStartDate").notNull(),
    coverageEndDate: date("coverageEndDate").notNull(),
    isCrossMonth: boolean("isCrossMonth").notNull().default(false),
    status: text("status").notNull().default("entered"), // entered | verified | flagged | void
    version: integer("version").notNull().default(1),
    recordedById: text("recordedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    verifiedById: text("verifiedById").references(() => user.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verifiedAt"),
    requestKey: text("requestKey").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    requestUnq: uniqueIndex("water_prod_int_request_unq").on(table.recordedById, table.requestKey),
    schemeIntervalIdx: index("water_production_interval_scheme_idx").on(table.schemeId, table.sourceId),
    datesIdx: index("water_production_interval_dates_idx").on(table.coverageStartDate, table.coverageEndDate),
    sourceSchemeFk: foreignKey({
      name: "water_production_interval_source_scheme_fk",
      columns: [table.sourceId, table.schemeId],
      foreignColumns: [waterSchemeSource.id, waterSchemeSource.schemeId],
    }).onDelete("restrict"),
    datesCheck: check("water_prod_int_dates", sql`
      ${table.closingTimestamp} > ${table.openingTimestamp}
      AND ${table.coverageEndDate} >= ${table.coverageStartDate}
      AND ${table.coverageStartDate} = ((${table.openingTimestamp} + interval '3 hours')::date)
      AND ${table.coverageEndDate} = GREATEST(
        ((${table.openingTimestamp} + interval '3 hours')::date),
        (((${table.closingTimestamp} - interval '1 millisecond') + interval '3 hours')::date)
      )
      AND ${table.isCrossMonth} = (to_char(${table.coverageStartDate}, 'YYYY-MM') <> to_char(${table.coverageEndDate}, 'YYYY-MM'))
    `),
    volCheck: check("water_prod_int_vol", sql`
      ${table.calculatedVolumeM3} >= 0 AND ${table.calculatedVolumeM3}::text NOT IN ('NaN', 'Infinity', '-Infinity')
    `),
    reconciliationCheck: check("water_prod_int_reconciliation", sql`
      (
        ((${table.isReset} OR ${table.closingReading} < ${table.openingReading}) AND ${table.rolloverValue} IS NOT NULL AND ${table.rolloverValue} >= ${table.openingReading})
        OR (NOT ${table.isReset} AND ${table.closingReading} >= ${table.openingReading} AND ${table.rolloverValue} IS NULL)
      )
      AND ${table.calculatedVolumeM3} = round(
        (
          CASE
            WHEN ${table.isReset} OR ${table.closingReading} < ${table.openingReading}
              THEN (${table.rolloverValue} - ${table.openingReading}) + ${table.closingReading}
            ELSE ${table.closingReading} - ${table.openingReading}
          END
        ) * ${table.multiplier} * (
          CASE ${table.meterUnit}
            WHEN 'm3' THEN 1::numeric
            WHEN 'litres' THEN 0.001::numeric
            WHEN 'gallons' THEN 0.00378541::numeric
          END
        ),
        2
      )
      AND ${table.coverageHours} > 0
      AND abs(${table.coverageHours} - (extract(epoch from (${table.closingTimestamp} - ${table.openingTimestamp})) / 3600.0)::numeric) <= 0.01
    `),
    statusCheck: check("water_prod_int_status", sql`
      ${table.status} IN ('entered', 'flagged', 'verified', 'void')
      AND (
        (${table.status} = 'verified' AND ${table.verifiedById} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedById} <> ${table.recordedById})
        OR (${table.status} <> 'verified' AND ${table.verifiedById} IS NULL AND ${table.verifiedAt} IS NULL)
      )
    `),
    valuesCheck: check("water_prod_int_values", sql`
      ${table.version} > 0
      AND btrim(${table.meterRef}) <> ''
      AND ${table.meterUnit} IN ('m3', 'litres', 'gallons')
      AND ${table.openingReading} >= 0 AND ${table.openingReading}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.closingReading} >= 0 AND ${table.closingReading}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.multiplier} > 0 AND ${table.multiplier}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND (${table.rolloverValue} IS NULL OR (${table.rolloverValue} >= 0 AND ${table.rolloverValue}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND ${table.coverageHours}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.requestKey} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'
    `),
  })
)

/**
 * Energy Assets (Electricity Meters & Generators) which can be shared across multiple sources within the same scheme.
 */
export const waterSchemeEnergyAsset = pgTable(
  "water_scheme_energy_asset",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    assetType: text("assetType").notNull(), // 'electricity_meter' | 'generator'
    assetRef: text("assetRef").notNull(), // Serial number or nameplate
    fuelType: text("fuelType"), // 'diesel' | 'petrol' (for generators)
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    idSchemeUnq: uniqueIndex("energy_asset_id_scheme_unq").on(table.id, table.schemeId),
    schemeTypeRefUnq: uniqueIndex("energy_asset_scheme_type_ref_unq").on(table.schemeId, table.assetType, table.assetRef),
    schemeIdx: index("water_scheme_energy_asset_scheme_idx").on(table.schemeId),
    valuesCheck: check("energy_asset_values", sql`
      ${table.assetType} IN ('electricity_meter', 'generator')
      AND btrim(${table.assetRef}) <> ''
      AND (
        (${table.assetType} = 'generator' AND (${table.fuelType} IS NULL OR ${table.fuelType} IN ('diesel', 'petrol')))
        OR (${table.assetType} = 'electricity_meter' AND ${table.fuelType} IS NULL)
      )
    `),
  })
)

/**
 * Assignment of Energy Assets to Water Sources (strictly co-located within the same scheme).
 */
export const energyAssetAssignment = pgTable(
  "energy_asset_assignment",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    assetId: text("assetId").notNull(),
    sourceId: text("sourceId").notNull(),
    assignedAt: timestamp("assignedAt").notNull().defaultNow(),
  },
  (table) => ({
    assignmentUnq: uniqueIndex("energy_asset_assignment_unq").on(table.assetId, table.sourceId),
    schemeIdx: index("energy_asset_assignment_scheme_idx").on(table.schemeId),
    assetSchemeFk: foreignKey({
      name: "energy_asset_assignment_asset_scheme_fk",
      columns: [table.assetId, table.schemeId],
      foreignColumns: [waterSchemeEnergyAsset.id, waterSchemeEnergyAsset.schemeId],
    }).onDelete("cascade"),
    sourceSchemeFk: foreignKey({
      name: "energy_asset_assignment_source_scheme_fk",
      columns: [table.sourceId, table.schemeId],
      foreignColumns: [waterSchemeSource.id, waterSchemeSource.schemeId],
    }).onDelete("cascade"),
  })
)

/**
 * Grid Electricity Consumption Logs.
 * Asset-type check, pump-hour cap (elapsed duration x supported units), row immutability, self-approval,
 * and concurrency-safe overlap guards are enforced by triggers in db/migrations/0075_production_energy.sql.
 */
export const waterProductionElectricity = pgTable(
  "water_production_electricity",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    assetId: text("assetId").notNull(),
    openingReadingKwh: numeric("openingReadingKwh", { precision: 12, scale: 2 }).notNull(),
    openingTimestamp: timestamp("openingTimestamp").notNull(),
    closingReadingKwh: numeric("closingReadingKwh", { precision: 12, scale: 2 }).notNull(),
    closingTimestamp: timestamp("closingTimestamp").notNull(),
    multiplier: numeric("multiplier", { precision: 6, scale: 2 }).notNull().default("1.00"),
    rolloverValueKwh: numeric("rolloverValueKwh", { precision: 12, scale: 2 }),
    isReset: boolean("isReset").notNull().default(false),
    calculatedConsumedKwh: numeric("calculatedConsumedKwh", { precision: 12, scale: 2 }).notNull(),
    pumpOperatingHours: numeric("pumpOperatingHours", { precision: 8, scale: 2 }),
    electricityCostUgx: numeric("electricityCostUgx", { precision: 12, scale: 2 }),
    coverageStartDate: date("coverageStartDate").notNull(),
    coverageEndDate: date("coverageEndDate").notNull(),
    isCrossMonth: boolean("isCrossMonth").notNull().default(false),
    status: text("status").notNull().default("entered"), // entered | verified | flagged | void
    version: integer("version").notNull().default(1),
    recordedById: text("recordedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    verifiedById: text("verifiedById").references(() => user.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verifiedAt"),
    requestKey: text("requestKey").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    requestUnq: uniqueIndex("water_prod_elec_request_unq").on(table.recordedById, table.requestKey),
    assetDatesIdx: index("water_prod_elec_dates_idx").on(table.assetId, table.coverageStartDate, table.coverageEndDate),
    assetSchemeFk: foreignKey({
      name: "water_production_electricity_asset_scheme_fk",
      columns: [table.assetId, table.schemeId],
      foreignColumns: [waterSchemeEnergyAsset.id, waterSchemeEnergyAsset.schemeId],
    }).onDelete("restrict"),
    consCheck: check("water_prod_elec_cons", sql`
      ${table.calculatedConsumedKwh} >= 0 AND ${table.calculatedConsumedKwh}::text NOT IN ('NaN', 'Infinity', '-Infinity')
    `),
    datesCheck: check("water_prod_elec_dates", sql`
      ${table.closingTimestamp} > ${table.openingTimestamp}
      AND ${table.coverageEndDate} >= ${table.coverageStartDate}
      AND ${table.coverageStartDate} = ((${table.openingTimestamp} + interval '3 hours')::date)
      AND ${table.coverageEndDate} = GREATEST(
        ((${table.openingTimestamp} + interval '3 hours')::date),
        (((${table.closingTimestamp} - interval '1 millisecond') + interval '3 hours')::date)
      )
      AND ${table.isCrossMonth} = (to_char(${table.coverageStartDate}, 'YYYY-MM') <> to_char(${table.coverageEndDate}, 'YYYY-MM'))
    `),
    reconciliationCheck: check("water_prod_elec_reconciliation", sql`
      (
        ((${table.isReset} OR ${table.closingReadingKwh} < ${table.openingReadingKwh}) AND ${table.rolloverValueKwh} IS NOT NULL AND ${table.rolloverValueKwh} >= ${table.openingReadingKwh})
        OR (NOT ${table.isReset} AND ${table.closingReadingKwh} >= ${table.openingReadingKwh} AND ${table.rolloverValueKwh} IS NULL)
      )
      AND ${table.calculatedConsumedKwh} = round(
        (
          CASE
            WHEN ${table.isReset} OR ${table.closingReadingKwh} < ${table.openingReadingKwh}
              THEN (${table.rolloverValueKwh} - ${table.openingReadingKwh}) + ${table.closingReadingKwh}
            ELSE ${table.closingReadingKwh} - ${table.openingReadingKwh}
          END
        ) * ${table.multiplier},
        2
      )
    `),
    statusCheck: check("water_prod_elec_status", sql`
      ${table.status} IN ('entered', 'flagged', 'verified', 'void')
      AND (
        (${table.status} = 'verified' AND ${table.verifiedById} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedById} <> ${table.recordedById})
        OR (${table.status} <> 'verified' AND ${table.verifiedById} IS NULL AND ${table.verifiedAt} IS NULL)
      )
    `),
    valuesCheck: check("water_prod_elec_values", sql`
      ${table.version} > 0
      AND ${table.openingReadingKwh} >= 0 AND ${table.openingReadingKwh}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.closingReadingKwh} >= 0 AND ${table.closingReadingKwh}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.multiplier} > 0 AND ${table.multiplier}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND (${table.rolloverValueKwh} IS NULL OR (${table.rolloverValueKwh} >= 0 AND ${table.rolloverValueKwh}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND (${table.pumpOperatingHours} IS NULL OR (${table.pumpOperatingHours} >= 0 AND ${table.pumpOperatingHours}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND (${table.electricityCostUgx} IS NULL OR (${table.electricityCostUgx} >= 0 AND ${table.electricityCostUgx}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND ${table.requestKey} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'
    `),
  })
)

/**
 * Generator Fuel Consumption Logs.
 * Asset-type/fuel-type check, row immutability, self-approval, and concurrency-safe stock-period overlap
 * guards are enforced by triggers in db/migrations/0075_production_energy.sql.
 */
export const waterProductionFuel = pgTable(
  "water_production_fuel",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    assetId: text("assetId").notNull(),
    fuelType: text("fuelType").notNull().default("diesel"),
    openingStockLitres: numeric("openingStockLitres", { precision: 10, scale: 2 }),
    fuelPurchasedLitres: numeric("fuelPurchasedLitres", { precision: 10, scale: 2 }).notNull().default("0"),
    fuelTransfersInLitres: numeric("fuelTransfersInLitres", { precision: 10, scale: 2 }).notNull().default("0"),
    fuelTransfersOutLitres: numeric("fuelTransfersOutLitres", { precision: 10, scale: 2 }).notNull().default("0"),
    fuelAdjustmentsLitres: numeric("fuelAdjustmentsLitres", { precision: 10, scale: 2 }).notNull().default("0"),
    closingStockLitres: numeric("closingStockLitres", { precision: 10, scale: 2 }),
    calculatedConsumedLitres: numeric("calculatedConsumedLitres", { precision: 10, scale: 2 }), // Null unless both stock readings are measured
    generatorOperatingHours: numeric("generatorOperatingHours", { precision: 8, scale: 2 }),
    fuelExpenditureUgx: numeric("fuelExpenditureUgx", { precision: 12, scale: 2 }),
    coverageStartDate: date("coverageStartDate").notNull(),
    coverageEndDate: date("coverageEndDate").notNull(),
    isCrossMonth: boolean("isCrossMonth").notNull().default(false),
    status: text("status").notNull().default("entered"), // entered | verified | flagged | void
    version: integer("version").notNull().default(1),
    recordedById: text("recordedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    verifiedById: text("verifiedById").references(() => user.id, { onDelete: "restrict" }),
    verifiedAt: timestamp("verifiedAt"),
    requestKey: text("requestKey").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    requestUnq: uniqueIndex("water_prod_fuel_request_unq").on(table.recordedById, table.requestKey),
    assetDatesIdx: index("water_prod_fuel_dates_idx").on(table.assetId, table.coverageStartDate, table.coverageEndDate),
    assetSchemeFk: foreignKey({
      name: "water_production_fuel_asset_scheme_fk",
      columns: [table.assetId, table.schemeId],
      foreignColumns: [waterSchemeEnergyAsset.id, waterSchemeEnergyAsset.schemeId],
    }).onDelete("restrict"),
    consCheck: check("water_prod_fuel_cons", sql`
      ${table.calculatedConsumedLitres} IS NULL
      OR (${table.calculatedConsumedLitres} >= 0 AND ${table.calculatedConsumedLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity'))
    `),
    datesCheck: check("water_prod_fuel_dates", sql`
      ${table.coverageEndDate} >= ${table.coverageStartDate}
      AND ${table.isCrossMonth} = (to_char(${table.coverageStartDate}, 'YYYY-MM') <> to_char(${table.coverageEndDate}, 'YYYY-MM'))
    `),
    reconciliationCheck: check("water_prod_fuel_reconciliation", sql`
      ((${table.openingStockLitres} IS NULL) = (${table.closingStockLitres} IS NULL))
      AND (
        (${table.openingStockLitres} IS NULL AND ${table.closingStockLitres} IS NULL AND ${table.calculatedConsumedLitres} IS NULL)
        OR (
          ${table.openingStockLitres} IS NOT NULL
          AND ${table.closingStockLitres} IS NOT NULL
          AND ${table.calculatedConsumedLitres} IS NOT NULL
          AND ${table.calculatedConsumedLitres} = round(
            ${table.openingStockLitres}
            + ${table.fuelPurchasedLitres}
            + ${table.fuelTransfersInLitres}
            - ${table.fuelTransfersOutLitres}
            + ${table.fuelAdjustmentsLitres}
            - ${table.closingStockLitres},
            2
          )
        )
      )
    `),
    statusCheck: check("water_prod_fuel_status", sql`
      ${table.status} IN ('entered', 'flagged', 'verified', 'void')
      AND (
        (${table.status} = 'verified' AND ${table.verifiedById} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedById} <> ${table.recordedById})
        OR (${table.status} <> 'verified' AND ${table.verifiedById} IS NULL AND ${table.verifiedAt} IS NULL)
      )
    `),
    valuesCheck: check("water_prod_fuel_values", sql`
      ${table.version} > 0
      AND ${table.fuelType} IN ('diesel', 'petrol')
      AND (${table.openingStockLitres} IS NULL OR (${table.openingStockLitres} >= 0 AND ${table.openingStockLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND ${table.fuelPurchasedLitres} >= 0 AND ${table.fuelPurchasedLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.fuelTransfersInLitres} >= 0 AND ${table.fuelTransfersInLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.fuelTransfersOutLitres} >= 0 AND ${table.fuelTransfersOutLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND ${table.fuelAdjustmentsLitres} >= 0 AND ${table.fuelAdjustmentsLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND (${table.closingStockLitres} IS NULL OR (${table.closingStockLitres} >= 0 AND ${table.closingStockLitres}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND (
        ${table.generatorOperatingHours} IS NULL
        OR (
          ${table.generatorOperatingHours} >= 0
          AND ${table.generatorOperatingHours}::text NOT IN ('NaN', 'Infinity', '-Infinity')
          AND ${table.generatorOperatingHours} <= ((${table.coverageEndDate} - ${table.coverageStartDate} + 1)::numeric * 24)
        )
      )
      AND (${table.fuelExpenditureUgx} IS NULL OR (${table.fuelExpenditureUgx} >= 0 AND ${table.fuelExpenditureUgx}::text NOT IN ('NaN', 'Infinity', '-Infinity')))
      AND ${table.requestKey} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'
    `),
  })
)

/**
 * Operational Scheme Targets.
 */
export const schemeTarget = pgTable(
  "scheme_target",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "cascade" }),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    targetProductionM3: numeric("targetProductionM3", { precision: 12, scale: 2 }),
    targetNrwPercent: numeric("targetNrwPercent", { precision: 5, scale: 2 }),
    targetCapacityUtilisationPercent: numeric("targetCapacityUtilisationPercent", { precision: 5, scale: 2 }),
    targetCollectionEfficiencyPercent: numeric("targetCollectionEfficiencyPercent", { precision: 5, scale: 2 }),
    targetBillingUgx: numeric("targetBillingUgx", { precision: 12, scale: 2 }),
    targetArrearsRecoveryUgx: numeric("targetArrearsRecoveryUgx", { precision: 12, scale: 2 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemePeriodUnq: uniqueIndex("scheme_target_scheme_period_unq").on(table.schemeId, table.billingPeriodId),
  })
)

/**
 * Intelligence Finding (Evidence-based anomaly detection).
 */
export const intelligenceFinding = pgTable(
  "intelligence_finding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").references(() => organization.id, { onDelete: "set null" }),
    clusterId: text("clusterId").references(() => cluster.id, { onDelete: "set null" }),
    branchId: text("branchId").references(() => branch.id, { onDelete: "set null" }),
    schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    sourceId: text("sourceId").references(() => waterSchemeSource.id, { onDelete: "set null" }),

    category: text("category").notNull(), // 'data_quality' | 'production' | 'capacity' | 'nrw' | 'commercial' | 'target' | 'trend'
    severity: text("severity").notNull(), // 'critical' | 'high' | 'watch' | 'info'
    title: text("title").notNull(),
    description: text("description").notNull(),
    observation: text("observation"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    recommendation: text("recommendation"),
    confidence: text("confidence").notNull().default("HIGH"), // 'HIGH' | 'MEDIUM' | 'LOW'

    reportingPeriod: text("reportingPeriod"),
    status: text("status").notNull().default("OPEN"), // 'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'DISMISSED'
    assignedToUserId: text("assignedToUserId").references(() => user.id, { onDelete: "set null" }),
    resolutionNotes: text("resolutionNotes"),
    resolvedAt: timestamp("resolvedAt"),

    detectedAt: timestamp("detectedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("intel_finding_scheme_idx").on(table.schemeId),
    categoryIdx: index("intel_finding_cat_idx").on(table.category),
    severityIdx: index("intel_finding_sev_idx").on(table.severity),
    statusIdx: index("intel_finding_status_idx").on(table.status),
    detectedIdx: index("intel_finding_detected_idx").on(table.detectedAt),
  })
)

/**
 * Intelligence Rule configuration.
 */
export const intelligenceRule = pgTable(
  "intelligence_rule",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(), // e.g. 'RULE_CAPACITY_OVER_UTILIZED'
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    threshold: jsonb("threshold").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    codeUnq: uniqueIndex("intel_rule_code_unq").on(table.code),
  })
)

export type WaterSchemeSource = typeof waterSchemeSource.$inferSelect
export type WaterProductionLog = typeof waterProductionLog.$inferSelect
export type SchemeTarget = typeof schemeTarget.$inferSelect
export type IntelligenceFinding = typeof intelligenceFinding.$inferSelect
export type IntelligenceRule = typeof intelligenceRule.$inferSelect

/**
 * Management Action Register.
 */
export const managementAction = pgTable(
  "management_action",
  {
    id: text("id").primaryKey(),
    findingId: text("findingId").references(() => intelligenceFinding.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    responsibleUserId: text("responsibleUserId").references(() => user.id, { onDelete: "set null" }),
    responsibleScope: text("responsibleScope"), // 'organization' | 'cluster' | 'branch' | 'scheme'
    dueDate: timestamp("dueDate").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN, ASSIGNED, IN_PROGRESS, PENDING_VERIFICATION, RESOLVED, CLOSED
    priority: text("priority").notNull().default("normal"), // critical, high, normal, low
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    resolutionNotes: text("resolutionNotes"),
    closureEvidenceUrl: text("closureEvidenceUrl"),
    closedAt: timestamp("closedAt"),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    findingIdx: index("mgmt_action_finding_idx").on(table.findingId),
    responsibleIdx: index("mgmt_action_resp_user_idx").on(table.responsibleUserId),
    statusIdx: index("mgmt_action_status_idx").on(table.status),
    dueDateIdx: index("mgmt_action_due_date_idx").on(table.dueDate),
  })
)

/**
 * Institutional Report & Board Pack Generation History.
 */
export const reportGenerationHistory = pgTable(
  "report_generation_history",
  {
    id: text("id").primaryKey(),
    reportType: text("reportType").notNull(), // 'board_pack_pptx' | 'monthly_management' | 'production_capacity' | 'nrw_loss' | 'commercial_performance'
    periodId: text("periodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    scopeLevel: text("scopeLevel").notNull().default("organization"), // 'organization' | 'cluster' | 'branch' | 'scheme'
    scopeId: text("scopeId"),
    generatedById: text("generatedById").references(() => user.id, { onDelete: "set null" }),
    fileFormat: text("fileFormat").notNull().default("pptx"), // 'pptx' | 'pdf' | 'html'
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    periodIdx: index("report_history_period_idx").on(table.periodId),
    userIdx: index("report_history_user_idx").on(table.generatedById),
    typeIdx: index("report_history_type_idx").on(table.reportType),
  })
)

export type ManagementAction = typeof managementAction.$inferSelect
export type ReportGenerationHistory = typeof reportGenerationHistory.$inferSelect

/**
 * Auditable Scheme Mapping between Excel Reference Names and Live DB water_scheme.id
 */
export const decisionSupportSchemeMapping = pgTable(
  "decision_support_scheme_mapping",
  {
    id: text("id").primaryKey(),
    waterSchemeId: text("waterSchemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    excelArea: text("excelArea").notNull(),
    excelSchemeName: text("excelSchemeName").notNull(),
    matchStatus: text("matchStatus").notNull(), // 'APPROVED_EXACT_MATCH' | 'APPROVED_NORMALIZED_MATCH' | 'REQUIRES_MANUAL_APPROVAL' | 'HIERARCHY_MISMATCH' | 'UNMATCHED_REFERENCE_SCHEME'
    matchMethod: text("matchMethod").notNull(),
    approved: boolean("approved").notNull().default(false),
    approvedById: text("approvedById").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approvedAt").defaultNow(),
    source: text("source").notNull().default("SWUWS Excel Reference Dataset (global target.xlsx)"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("ds_scheme_map_scheme_idx").on(table.waterSchemeId),
    statusIdx: index("ds_scheme_map_status_idx").on(table.matchStatus),
  })
)

export type DecisionSupportSchemeMapping = typeof decisionSupportSchemeMapping.$inferSelect
