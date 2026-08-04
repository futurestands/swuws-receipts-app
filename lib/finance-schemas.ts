import { z } from "zod"

export const createReceiptSchema = z.object({
  billingRecordId: z.string().trim().optional(),
  billingPeriodId: z.string().trim().optional(),
  schemeId: z.string().trim().optional(),
  customerId: z.string().trim().min(1, "Customer ID is required"),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerAccount: z.string().trim().max(100).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  customerAddress: z.string().trim().max(300).optional(),
  amount: z
    .number()
    .finite()
    .positive("Amount must be greater than zero")
    .refine((v) => Math.round(v) > 0, "Amount is too small to record as a receipt"),
  outstandingBalance: z.number().finite().min(0).optional(),
  paymentMethod: z.string().trim().min(1, "Payment method is required"),
  paymentReference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  paymentDate: z.string().optional(),
  branchId: z.string().trim().optional(),
})

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>
