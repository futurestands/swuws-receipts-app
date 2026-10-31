import { z } from "zod"
import { kampalaCalendarDate } from "@/lib/billing/period-dates"
import { MeterReadingError, meterDeltaCents } from "./decimal"

export const opaqueId = z.string().trim().min(1).max(200)
// Input is text deliberately: accepting JS numbers would lose lexical precision/exponent evidence.
export function decimal(max = "9999999999.99") {
  return z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a non-negative decimal with at most two decimal places")
    .refine(v => Number(v) <= Number(max), `Maximum is ${max}`)
    .transform(v => { const [a, b = ""] = v.split("."); return `${BigInt(a)}.${b.padEnd(2, "0")}` })
}
const optionalDecimal = (max?: string) => z.preprocess(v => v === "" || v === undefined ? null : v, decimal(max).nullable())
const elapsedMilliseconds = (opening: string, closing: string) => new Date(closing).getTime() - new Date(opening).getTime()
const FUTURE_SKEW_MS = 5 * 60_000
/** Closing must follow opening, and a reading cannot be taken in the future (small clock-skew allowance). */
function validateElapsedWindow(opening: string, closing: string, ctx: z.RefinementCtx) {
  if (elapsedMilliseconds(opening, closing) <= 0) ctx.addIssue({ code: "custom", path: ["closingTimestamp"], message: "Closing timestamp must be after opening timestamp" })
  else if (new Date(closing).getTime() > Date.now() + FUTURE_SKEW_MS) ctx.addIssue({ code: "custom", path: ["closingTimestamp"], message: "Closing timestamp cannot be in the future" })
}
/** Surfaces rollover/reset mistakes as field errors instead of silently producing a wrong volume. */
function validateMeterDelta(opening: string, closing: string, rollover: string | null, isReset: boolean, closingPath: string, rolloverPath: string, ctx: z.RefinementCtx) {
  try { meterDeltaCents(opening, closing, rollover, isReset) } catch (error) {
    if (!(error instanceof MeterReadingError)) throw error
    ctx.addIssue({ code: "custom", path: [rollover === null ? closingPath : rolloverPath], message: error.message })
  }
}
export const productionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(v => Number(v.slice(0, 4)) >= 1900 && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, "Enter a real calendar date")
  .refine(v => v <= kampalaCalendarDate(new Date()), "Production date cannot be in the future")
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v => Number(v.slice(0, 4)) >= 1900)
export const measurementSchema = z.object({
  schemeId: opaqueId,
  sourceId: opaqueId,
  productionDate: productionDateSchema,
  waterProducedM3: decimal(),
  waterSuppliedM3: optionalDecimal(),
  operatingHours: optionalDecimal("24.00"),
  notes: z.string().trim().max(2000).default(""),
  billingPeriodId: opaqueId.nullable().optional(),
}).strict()
export const createLogSchema = measurementSchema.extend({ requestKey: z.string().uuid() })
export const editLogSchema = measurementSchema.extend({ id: opaqueId, expectedVersion: z.number().int().positive() })
export const reasonSchema = z.string().trim().min(10).max(1000)
export const transitionSchema = z.object({
  id: opaqueId, expectedVersion: z.number().int().positive(),
  operation: z.enum(["verify", "flag", "revoke", "void"]), reason: z.string().trim().max(1000).default(""),
}).strict().superRefine((v, ctx) => {
  if (v.operation !== "verify" && !reasonSchema.safeParse(v.reason).success) ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason of 10–1000 characters is required" })
})
export const sourceSchema = z.object({
  id: opaqueId.optional(), expectedVersion: z.number().int().positive().optional(), schemeId: opaqueId,
  sourceName: z.string().trim().min(1).max(150),
  technology: z.enum(["gravity", "pumped_grid", "pumped_solar", "pumped_generator", "hybrid"]),
  capacityMethod: z.enum(["unknown", "measured_hourly", "bucket_test"]),
  installedPumpCapacityM3Hr: optionalDecimal(), regimeHoursPerDay: optionalDecimal("24.00"),
  containerVolumeLitres: optionalDecimal(), averageFillTimeSeconds: optionalDecimal(),
}).strict().superRefine((v, ctx) => {
  if (v.id && !v.expectedVersion) ctx.addIssue({ code: "custom", path: ["expectedVersion"], message: "Reload the source version" })
  if (v.capacityMethod === "measured_hourly" && v.installedPumpCapacityM3Hr === null) ctx.addIssue({ code: "custom", path: ["installedPumpCapacityM3Hr"], message: "Measured hourly yield is required" })
  if ((v.containerVolumeLitres === null) !== (v.averageFillTimeSeconds === null) || (v.containerVolumeLitres !== null && (Number(v.containerVolumeLitres) <= 0 || Number(v.averageFillTimeSeconds) <= 0)) || (v.capacityMethod === "bucket_test" && v.containerVolumeLitres === null)) ctx.addIssue({ code: "custom", path: ["containerVolumeLitres"], message: "Provide positive bucket litres and fill seconds together" })
})
export const archiveSourceSchema = z.object({ id: opaqueId, expectedVersion: z.number().int().positive() }).strict()
export const legacyReviewSchema = editLogSchema.extend({ reason: reasonSchema, requestKey: z.string().uuid() })

export const batchMeasurementSchema = z.object({
  schemeId: opaqueId,
  sourceId: opaqueId,
  requestKey: z.string().uuid(),
  entries: z.array(measurementSchema).min(1).max(31),
}).strict()

export const intervalMeasurementSchema = z.object({
  schemeId: opaqueId,
  sourceId: opaqueId,
  meterRef: z.string().trim().min(1).max(100),
  openingReading: decimal(),
  openingTimestamp: z.string().datetime(),
  closingReading: decimal(),
  closingTimestamp: z.string().datetime(),
  meterUnit: z.enum(["m3", "litres", "gallons"]).default("m3"),
  multiplier: decimal().default("1.00"),
  rolloverValue: optionalDecimal(),
  isReset: z.boolean().default(false),
  requestKey: z.string().uuid(),
  notes: z.string().trim().max(2000).default(""),
}).strict().superRefine((v, ctx) => {
  validateElapsedWindow(v.openingTimestamp, v.closingTimestamp, ctx)
  validateMeterDelta(v.openingReading, v.closingReading, v.rolloverValue, v.isReset, "closingReading", "rolloverValue", ctx)
})

export const electricityMeasurementSchema = z.object({
  schemeId: opaqueId,
  assetId: opaqueId,
  openingReadingKwh: decimal(),
  openingTimestamp: z.string().datetime(),
  closingReadingKwh: decimal(),
  closingTimestamp: z.string().datetime(),
  multiplier: decimal().default("1.00"),
  rolloverValueKwh: optionalDecimal(),
  isReset: z.boolean().default(false),
  // Aggregate pump-hours over the whole interval. The upper bound depends on the interval length and the number of
  // pumps the meter supports, so it is enforced against the elapsed duration (here) and the asset (service/database).
  pumpOperatingHours: optionalDecimal(),
  electricityCostUgx: optionalDecimal(),
  requestKey: z.string().uuid(),
  notes: z.string().trim().max(2000).default(""),
}).strict().superRefine((v, ctx) => {
  validateElapsedWindow(v.openingTimestamp, v.closingTimestamp, ctx)
  validateMeterDelta(v.openingReadingKwh, v.closingReadingKwh, v.rolloverValueKwh, v.isReset, "closingReadingKwh", "rolloverValueKwh", ctx)
})

export const fuelMeasurementSchema = z.object({
  schemeId: opaqueId,
  assetId: opaqueId,
  fuelType: z.enum(["diesel", "petrol"]).default("diesel"),
  openingStockLitres: optionalDecimal(),
  fuelPurchasedLitres: optionalDecimal(),
  fuelTransfersInLitres: optionalDecimal(),
  fuelTransfersOutLitres: optionalDecimal(),
  fuelAdjustmentsLitres: optionalDecimal(),
  closingStockLitres: optionalDecimal(),
  // A generator is a single unit: running hours are bounded by the covered calendar days x 24 (checked below), not a fixed 24 h.
  generatorOperatingHours: optionalDecimal(),
  fuelExpenditureUgx: optionalDecimal(),
  requestKey: z.string().uuid(),
  notes: z.string().trim().max(2000).default(""),
  coverageStartDate: productionDateSchema,
  coverageEndDate: productionDateSchema,
}).strict().superRefine((v, ctx) => {
  if (v.coverageEndDate < v.coverageStartDate) {
    ctx.addIssue({ code: "custom", path: ["coverageEndDate"], message: "End date must be after or equal to start date" })
    return
  }
  if (v.generatorOperatingHours !== null) {
    const days = Math.round((Date.parse(`${v.coverageEndDate}T00:00:00Z`) - Date.parse(`${v.coverageStartDate}T00:00:00Z`)) / 86_400_000) + 1
    if (Number(v.generatorOperatingHours) > days * 24) ctx.addIssue({ code: "custom", path: ["generatorOperatingHours"], message: `Generator hours cannot exceed ${days * 24} h for ${days} covered day(s)` })
  }
  // Stock readings come as a pair; a lone reading cannot establish consumption.
  if ((v.openingStockLitres === null) !== (v.closingStockLitres === null)) ctx.addIssue({ code: "custom", path: ["closingStockLitres"], message: "Provide both opening and closing stock readings, or neither (purchases alone never establish consumption)" })
})


export type Measurement = z.infer<typeof measurementSchema>
export type BatchMeasurement = z.infer<typeof batchMeasurementSchema>
export type IntervalMeasurement = z.infer<typeof intervalMeasurementSchema>
export type ElectricityMeasurement = z.infer<typeof electricityMeasurementSchema>
export type FuelMeasurement = z.infer<typeof fuelMeasurementSchema>
export type ProductionCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "CONFIGURATION"
export class ProductionError extends Error {
  constructor(public code: ProductionCode, message: string) { super(message) }
}
export type ProductionResult<T> = { ok: true; data: T } | { ok: false; code: ProductionCode; message: string; fieldErrors?: Record<string, string[] | undefined> }
