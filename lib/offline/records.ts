import { z } from "zod"

// Validate plugin reads without coercing balances, changing stored rows, or
// silently dropping malformed pending transactions.
export const cachedCustomersSchema = z.array(z.object({
  id: z.string(), name: z.string().nullish(), customerAccount: z.string().nullish(),
  phone: z.string().nullish(), accountBalance: z.union([z.string(), z.number()]).nullish(),
}).passthrough())

const queuedRow = z.object({
  id: z.string(), customerId: z.string(), customerName: z.string().nullish(),
  status: z.string(), error: z.string().nullish(), notes: z.string().nullish(),
  idempotencyKey: z.string().nullish(),
})

export const queuedReceiptsSchema = z.array(queuedRow.extend({
  billingRecordId: z.string().nullish(), amount: z.number(), paymentMethod: z.string(),
  paymentReference: z.string().nullish(), paymentDate: z.string(),
}).passthrough())
export const queuedReadingsSchema = z.array(queuedRow.extend({
  billingPeriodId: z.string(), currentReading: z.number(), previousReading: z.number(),
}).passthrough())
export const syncMetaSchema = z.object({ lastSuccessfulPullAt: z.string().nullish() }).passthrough().nullable()

export type CachedCustomer = z.infer<typeof cachedCustomersSchema>[number]
export type QueuedReceipt = z.infer<typeof queuedReceiptsSchema>[number]
export type QueuedReading = z.infer<typeof queuedReadingsSchema>[number]
export type SyncMeta = z.infer<typeof syncMetaSchema>

export function offlineErrorMessage(error: unknown, fallback: string): string {
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message || fallback : fallback
}
