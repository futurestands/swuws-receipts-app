import { z } from "zod"

export const updateBrandingSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name is required").optional(),
  logoUrl: z.string().trim().nullable().optional(),
  disclaimer: z.string().trim().min(1).optional(),
  footerText: z.string().trim().min(1).optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  billingGraceDays: z.number().int().min(0).max(365).optional(),
  currencyCode: z.string().trim().min(1).max(10).optional(),
  receiptPrefix: z.string().trim().min(1).max(20).optional(),
  developerCredit: z.string().trim().min(1).optional(),
  latestAppVersion: z.string().trim().optional(),
  maintenanceMode: z.boolean().optional(),
})

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>

export const createWaterSchemeSchema = z.object({
  name: z.string().trim().min(1, "Scheme name is required"),
  code: z.string().trim().min(1, "Scheme code is required"),
  branchId: z.string().trim().nullable().optional(),
  serviceArea: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
})

export type CreateWaterSchemeInput = z.input<typeof createWaterSchemeSchema>
