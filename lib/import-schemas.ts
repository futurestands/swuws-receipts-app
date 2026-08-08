import { z } from "zod"
import type { ImportSummary } from "./import-engine"

export const hierarchyImportSchema = z.object({
  type: z.enum(["Cluster", "Branch", "Scheme"]).default("Scheme"),
  name: z.string().trim().min(1, "Name is required"),
  code: z.preprocess(
    (val) => (val === undefined || val === null ? "" : val),
    z.coerce.string().trim().min(1, "Code is required"),
  ),
  parentName: z.string().trim().optional(),
  serviceArea: z.string().trim().optional(),
  status: z.string().trim().default("Active"),
})

export type HierarchyImportRow = z.infer<typeof hierarchyImportSchema>
export type HierarchyImportSummary = ImportSummary<HierarchyImportRow>

export const userImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email format").toLowerCase(),
  password: z.string().trim().min(8, "Password must be at least 8 characters").optional(),
  role: z.string().trim(),
  cluster: z.string().trim().optional(),
  area: z.string().trim().optional(),
  scheme: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  status: z.string().trim().default("Active"),
})

export type UserImportRow = z.infer<typeof userImportSchema>

export const customerImportSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  customerAccount: z.coerce.string().trim().min(1, "Account number is required"),
  phone: z.coerce.string().trim().optional(),
  address: z.string().trim().optional(),
  schemeName: z.coerce.string().trim().min(1, "Water Scheme is required"),
  meterRef: z.coerce.string().trim().optional(),
  serialNo: z.coerce.string().trim().optional(),
  lastReading: z.coerce.number().default(0),
  openingArrears: z.coerce.number().default(0),
  category: z.string().trim().toLowerCase().default("domestic"),
  notes: z.string().trim().optional(),
})

export type CustomerImportRow = z.infer<typeof customerImportSchema>

export const billingImportSchema = z.object({
  accountNumber: z.coerce.string().trim().min(1, "Account number is required"),
  billAmount: z.coerce.number().min(0).default(0),
  arrears: z.coerce.number().min(0).default(0),
  currentCharges: z.coerce.number().min(0).default(0),
  totalDue: z.coerce.number().min(0).default(0),
  dueDate: z.coerce.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid due date format",
  }),
})

export type BillingImportRow = z.infer<typeof billingImportSchema>

export const tariffImportSchema = z.object({
  targetType: z.enum(["branch", "scheme"]),
  targetName: z.coerce.string().trim().min(1, "Area name is required"),
  customerCategory: z.string().trim().toLowerCase().default("domestic"),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
  serviceFee: z.coerce.number().min(0, "Service fee cannot be negative"),
  vatPercentage: z.coerce.number().min(0).max(100).default(18),
  active: z.coerce.boolean().default(true),
})

export type TariffImportRow = z.infer<typeof tariffImportSchema>
