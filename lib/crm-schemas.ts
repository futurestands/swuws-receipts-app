import { z } from "zod"
import { isSendablePhone } from "@/lib/phone"

/**
 * Complaint lifecycle vocabulary. Lives here rather than in
 * app/actions/crm.ts because that module is "use server", which may only
 * export async functions.
 */
export const COMPLAINT_STATUSES = ["open", "assigned", "in_progress", "resolved", "closed"] as const
export const COMPLAINT_PRIORITIES = ["low", "medium", "high", "critical"] as const

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number]
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number]

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
  // Rejected here rather than at send time: a number the gateway cannot
  // accept should show up in the import summary as an invalid row, not as a
  // queued message that silently fails hours later.
  phoneNumber: z
    .string()
    .min(9, "Invalid phone number")
    .refine(isSendablePhone, "Must be a Uganda 07 or 03 number, not 0700000000"),
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
