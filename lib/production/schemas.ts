import { z } from "zod"
import { kampalaCalendarDate } from "@/lib/billing/period-dates"

export const opaqueId = z.string().trim().min(1).max(200)
// Input is text deliberately: accepting JS numbers would lose lexical precision/exponent evidence.
export function decimal(max = "9999999999.99") {
  return z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a non-negative decimal with at most two decimal places")
    .refine(v => Number(v) <= Number(max), `Maximum is ${max}`)
    .transform(v => { const [a, b = ""] = v.split("."); return `${BigInt(a)}.${b.padEnd(2, "0")}` })
}
const optionalDecimal = (max?: string) => z.preprocess(v => v === "" || v === undefined ? null : v, decimal(max).nullable())
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
export type Measurement = z.infer<typeof measurementSchema>
export type ProductionCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "CONFIGURATION"
export class ProductionError extends Error {
  constructor(public code: ProductionCode, message: string) { super(message) }
}
export type ProductionResult<T> = { ok: true; data: T } | { ok: false; code: ProductionCode; message: string; fieldErrors?: Record<string, string[] | undefined> }
