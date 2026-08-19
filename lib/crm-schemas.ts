import { z } from "zod"

/**
 * Legacy CSV Format Mapping:
 * Column A: Customer Ref No
 * Column B: Customer Phone number
 * Column C: Customer Name
 * Column D: Billing Period
 * Column E: Outstanding Balance
 */
export const smsImportSchema = z.object({
  customerRef: z.string().optional(),
  phoneNumber: z.string().min(9, "Invalid phone number"),
  customerName: z.string().optional(),
  billingPeriod: z.string().optional(),
  balance: z.string().or(z.number()).optional(),
})

export type SmsImportRow = z.infer<typeof smsImportSchema>

export const smsImportMapping = {
  customerRef: 0,
  phoneNumber: 1,
  customerName: 2,
  billingPeriod: 3,
  balance: 4,
}
