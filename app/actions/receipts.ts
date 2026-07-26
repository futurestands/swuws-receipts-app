"use server"

import { db } from "@/lib/db"
import {
  receipt,
  receiptAttachment,
  branch as branchTable,
  paymentMethod as paymentMethodTable,
  customer as customerTable,
  billingRecord,
  billingPeriod,
  waterScheme,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { getSettings } from "@/app/actions/settings"
import { and, desc, eq, gte, lte, sql, sum, inArray } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { put } from "@vercel/blob"
import { z } from "zod"
import { checkRateLimit } from "@/lib/rate-limit"
import { canViewAllData, canIssueReceipt, canPrintReceipt, canReprintReceipt } from "@/lib/permissions"
import { applyReceiptScope, validateWriteScope } from "@/lib/scopes"
import { receiptPrintHistory, user as userTable } from "@/lib/db/schema"
import { headers } from "next/headers"

const createReceiptSchema = z.object({
  billingRecordId: z.string().trim().optional(),
  billingPeriodId: z.string().trim().optional(),
  schemeId: z.string().trim().optional(),
  customerId: z.string().trim().optional(),
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

function generatePaymentReference(): string {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    1000 + Math.random() * 9000,
  )}`
}

async function assertPaymentMethodAllowed(code: string) {
  const [row] = await db
    .select({ id: paymentMethodTable.id })
    .from(paymentMethodTable)
    .where(and(eq(paymentMethodTable.code, code), eq(paymentMethodTable.active, true)))
    .limit(1)
  return Boolean(row)
}

export async function createReceipt(input: CreateReceiptInput) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  // Organizational Scope Validation:
  // Ensure the user is issuing a receipt for their assigned Area (Branch).
  if (!(await validateWriteScope(current, { branchId: input.branchId }))) {
    return { ok: false as const, error: "You are not authorized to issue receipts for this branch" }
  }

  const rate = await checkRateLimit(`receipt-create:${current.id}`, 30, 60)
  if (!rate.allowed) {
    return {
      ok: false as const,
      error: "Too many receipts created in a short time. Please wait a moment and try again.",
    }
  }

  const parsed = createReceiptSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  // Enforcement: Receipt creation must require an Active Collection Period.
  const [activePeriod] = await db
    .select({ id: billingPeriod.id })
    .from(billingPeriod)
    .where(eq(billingPeriod.status, 'active'))
    .limit(1)

  if (!activePeriod) {
    return { ok: false as const, error: "No Active Collection Period. Receipts cannot be issued until an administrator activates one." }
  }

  const amount = Math.round(data.amount)

  try {
    const row = await db.transaction(async (tx) => {
      let periodName: string | null = null
      let schemeName: string | null = null
      let targetSchemeId: string | null = data.schemeId || null
      let amountDueSnapshot: number | null = null
      let remainingBefore = 0
      let newStatus: string | null = null
      let previousAccountBalance = 0

      // 1. Lock Customer Row and get current balance (Critical for atomic updates)
      if (data.customerId) {
        const lockResult = await tx.execute<{ accountBalance: number, waterSchemeId: string | null }>(
          sql`SELECT "accountBalance", "waterSchemeId" FROM "customer" WHERE id = ${data.customerId} FOR UPDATE`
        )
        const c = lockResult.rows[0]
        if (!c) throw new Error("Selected customer profile was not found")
        previousAccountBalance = Number(c.accountBalance || 0)
        if (!targetSchemeId) targetSchemeId = c.waterSchemeId
      }

      const totalAvailable = previousAccountBalance + amount
      let appliedToBill = 0

      if (data.billingRecordId) {
        // 2. Verify Billing Record & Calculate Reconciliation
        const [rowWithHierarchy] = await tx
          .select({
            bill: billingRecord,
            periodName: billingPeriod.periodName,
            schemeName: waterScheme.name,
            schemeId: waterScheme.id,
          })
          .from(billingRecord)
          .innerJoin(
            billingPeriod,
            and(eq(billingRecord.id, data.billingRecordId), eq(billingRecord.billingPeriodId, billingPeriod.id)),
          )
          .innerJoin(customerTable, eq(billingRecord.customerId, customerTable.id))
          .innerJoin(waterScheme, eq(customerTable.waterSchemeId, waterScheme.id))
          .where(eq(billingRecord.id, data.billingRecordId))
          .limit(1)

        if (!rowWithHierarchy) throw new Error("Selected billing record not found")
        const { bill } = rowWithHierarchy
        periodName = rowWithHierarchy.periodName
        schemeName = rowWithHierarchy.schemeName
        targetSchemeId = rowWithHierarchy.schemeId
        amountDueSnapshot = bill.totalDue

        if (bill.status === "paid") throw new Error("This bill is already fully paid")

        // Enforce customer matching if profile is selected
        if (data.customerId && bill.customerId !== data.customerId) {
          throw new Error("Billing record does not belong to the selected customer")
        }

        // Calculate current outstanding amount (bill - previous receipts)
        const [agg] = await tx
          .select({ totalPaid: sum(receipt.amount) })
          .from(receipt)
          .where(eq(receipt.billingRecordId, data.billingRecordId))

        const previouslyPaid = Number(agg?.totalPaid || 0)
        remainingBefore = bill.totalDue - previouslyPaid

        if (remainingBefore <= 0) {
          await tx.update(billingRecord).set({ status: "paid" }).where(eq(billingRecord.id, bill.id))
          throw new Error("This bill is already fully paid")
        }

        // Apply totalAvailable to bill, capped at remainingBefore
        appliedToBill = Math.min(totalAvailable, remainingBefore)
        const outstandingAfter = remainingBefore - appliedToBill
        newStatus = outstandingAfter <= 0 ? "paid" : "partially_paid"

        // Update Billing Record Status
        await tx
          .update(billingRecord)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(billingRecord.id, data.billingRecordId))
      } else if (data.billingPeriodId) {
        // Manual entry snapshotting (no reconciliation)
        const [p] = await tx
          .select({ periodName: billingPeriod.periodName })
          .from(billingPeriod)
          .where(eq(billingPeriod.id, data.billingPeriodId))
          .limit(1)
        periodName = p?.periodName ?? null

        if (data.schemeId) {
          const [s] = await tx
            .select({ name: waterScheme.name })
            .from(waterScheme)
            .where(eq(waterScheme.id, data.schemeId))
            .limit(1)
          schemeName = s?.name ?? null
        }
      }

      const newAccountBalance = totalAvailable - appliedToBill
      const outstandingBalanceSnapshot = data.billingRecordId
        ? Math.max(0, remainingBefore - appliedToBill)
        : (data.outstandingBalance ?? null)

      // 3. Create Immutable Receipt
      const settings = await getSettings()
      const id = randomUUID()
      const paymentReference = data.paymentReference?.trim() || generatePaymentReference()
      const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date()

      // Snapshots for Customer Details
      let customerName = data.customerName
      let customerAccount = data.customerAccount || null
      let customerPhone = data.customerPhone || null
      let customerAddress = data.customerAddress || null
      if (data.customerId) {
        const [c] = await tx
          .select()
          .from(customerTable)
          .where(eq(customerTable.id, data.customerId))
          .limit(1)
        if (c) {
          customerName = c.name
          customerAccount = c.customerAccount
          customerPhone = c.phone
          customerAddress = c.address
        }
      }

      let branchName: string | null = null
      if (data.branchId) {
        const [b] = await tx
          .select({ name: branchTable.name })
          .from(branchTable)
          .where(and(eq(branchTable.id, data.branchId), eq(branchTable.active, true)))
          .limit(1)
        branchName = b?.name ?? null
      }

      const [inserted] = await tx
        .insert(receipt)
        .values({
          id,
          paymentReference,
          billingRecordId: data.billingRecordId || null,
          billingPeriodSnapshot: periodName,
          amountDueSnapshot: amountDueSnapshot,
          schemeNameSnapshot: schemeName,
          customerId: data.customerId || null,
          customerName,
          customerAccount,
          customerPhone,
          customerAddress,
          amount, // The actual money collected from the customer
          outstandingBalance: outstandingBalanceSnapshot,
          previousAccountBalanceSnapshot: previousAccountBalance,
          newAccountBalanceSnapshot: newAccountBalance,
          currency: "UGX",
          paymentMethod: data.paymentMethod,
          notes: data.notes || null,
          paymentDate,
          branchId: data.branchId || null,
          branchName,
          schemeId: targetSchemeId,
          agentId: current.id,
          agentName: current.name,
          agentEmail: current.email,
          orgNameSnapshot: settings.orgName,
          disclaimerSnapshot: settings.disclaimer,
          footerSnapshot: settings.footerText,
          logoUrlSnapshot: settings.logoUrl,
        })
        .returning()

      // 4. Update Customer Account Balance atomically
      if (data.customerId) {
        await tx
          .update(customerTable)
          .set({ accountBalance: newAccountBalance, updatedAt: new Date() })
          .where(eq(customerTable.id, data.customerId))
      }

      // 5. Audit Log
      await writeAudit(
        {
          user: current,
          action: "receipt.create",
          entityType: "receipt",
          entityId: id,
          details: {
            receiptNumber: inserted.receiptNumber,
            amount,
            appliedToBill,
            previousBalance: previousAccountBalance,
            newBalance: newAccountBalance,
            customerName: inserted.customerName,
            billingRecordId: data.billingRecordId || null,
            newBillStatus: newStatus,
          },
        },
        tx,
      )

      return inserted
    })

    revalidatePath("/dashboard")
    revalidatePath("/admin")
    return { ok: true as const, receipt: row }
  } catch (e: any) {
    console.error("createReceipt failed", e)
    return {
      ok: false as const,
      error: e.message || "Could not save the receipt. Nothing was charged or recorded — please try again.",
    }
  }
}

/** Agents see only their own receipts; admins see all. */
export async function getReceipts(limit = 100) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  return db
    .select()
    .from(receipt)
    .where(scope)
    .orderBy(desc(receipt.createdAt))
    .limit(limit)
}

export async function getReceiptById(id: string) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const [row] = await db
    .select()
    .from(receipt)
    .where(and(eq(receipt.id, id), scope))
    .limit(1)

  return row ?? null
}

export async function getReceiptAttachments(receiptId: string) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const [r] = await db
    .select({ agentId: receipt.agentId })
    .from(receipt)
    .where(and(eq(receipt.id, receiptId), scope))
    .limit(1)
  if (!r) return []

  // Deliberately not selecting `url`: the raw Blob URL must never reach the
  // browser (Certification Finding 6.1). Downloads go through the
  // authenticated proxy at app/api/attachments/[id]/route.ts instead, keyed
  // by attachment id.
  return db
    .select({
      id: receiptAttachment.id,
      receiptId: receiptAttachment.receiptId,
      fileName: receiptAttachment.fileName,
      fileSize: receiptAttachment.fileSize,
      uploadedById: receiptAttachment.uploadedById,
      uploadedByName: receiptAttachment.uploadedByName,
      createdAt: receiptAttachment.createdAt,
    })
    .from(receiptAttachment)
    .where(eq(receiptAttachment.receiptId, receiptId))
    .orderBy(desc(receiptAttachment.createdAt))
}

/**
 * Attachments are append-only (see schema comment on receiptAttachment):
 * this action only ever inserts a new row. There is no corresponding
 * update/delete action, by design.
 */
const ALLOWED_ATTACHMENT_TYPES: Record<string, true> = {
  "application/pdf": true,
  "image/png": true,
  "image/jpeg": true, // covers both .jpg and .jpeg
}

export async function uploadReceiptAttachment(receiptId: string, formData: FormData) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  const rate = await checkRateLimit(`attachment-upload:${current.id}`, 20, 60)
  if (!rate.allowed) {
    return { ok: false as const, error: "Too many uploads. Please wait a moment and try again." }
  }

  const target = await getReceiptById(receiptId)
  if (!target) {
    return { ok: false as const, error: "Receipt not found or not accessible" }
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) {
    return { ok: false as const, error: "No file provided" }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false as const, error: "File must be under 10MB" }
  }
  // Certification Finding 6.2: previously any file type was accepted.
  // Allow-list only the types the business actually needs (proof-of-payment
  // scans/photos), rejecting HTML/SVG/executables/scripts/archives/etc.
  if (!ALLOWED_ATTACHMENT_TYPES[file.type]) {
    return {
      ok: false as const,
      error: "Only PDF, PNG, JPG, or JPEG files are accepted as attachments",
    }
  }

  const blob = await put(`receipts/${receiptId}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  })

  const [row] = await db
    .insert(receiptAttachment)
    .values({
      id: randomUUID(),
      receiptId,
      url: blob.url,
      fileName: file.name,
      fileSize: file.size,
      uploadedById: current.id,
      uploadedByName: current.name,
    })
    .returning()

  await writeAudit({
    user: current,
    action: "receipt.attachment.add",
    entityType: "receipt",
    entityId: receiptId,
    details: { fileName: file.name },
  })

  revalidatePath(`/dashboard/receipts/${receiptId}`)
  // Certification Finding 6.1: never return the raw Blob url to the client.
  // Downloads happen only through the authenticated proxy route, keyed by id.
  const { url: _url, ...attachmentWithoutUrl } = row
  return { ok: true as const, attachment: attachmentWithoutUrl }
}

export async function getDailyTotals(dateISO?: string) {
  const current = await requireUser()
  const day = dateISO ? new Date(dateISO) : new Date()
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(day)
  end.setHours(23, 59, 59, 999)

  const scope = applyReceiptScope(current)
  const conditions = [gte(receipt.createdAt, start), lte(receipt.createdAt, end)]
  if (scope) conditions.push(scope)

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${receipt.amount}), 0)::bigint`,
    })
    .from(receipt)
    .where(and(...conditions))

  return {
    count: Number(totals?.count ?? 0),
    total: Number(totals?.total ?? 0),
  }
}

export async function listActivePaymentMethods() {
  await requireUser()
  return db
    .select()
    .from(paymentMethodTable)
    .where(eq(paymentMethodTable.active, true))
    .orderBy(paymentMethodTable.name)
}

export async function listActiveBranches() {
  await requireUser()
  return db.select().from(branchTable).where(eq(branchTable.active, true)).orderBy(branchTable.name)
}

export async function recordReceiptPrint(receiptId: string) {
  const current = await requireUser()

  // Scope Check
  const scope = applyReceiptScope(current)
  const [target] = await db
    .select()
    .from(receipt)
    .where(and(eq(receipt.id, receiptId), scope))
    .limit(1)

  if (!target) {
    throw new Error("Receipt not found or you don't have access to it.")
  }

  const isReprint = target.printCount > 0

  // Permission Check
  if (!isReprint && !canPrintReceipt(current)) {
    throw new Error("You don't have permission to print receipts.")
  }
  if (isReprint && !canReprintReceipt(current)) {
    throw new Error("You don't have permission to reprint receipts.")
  }

  // Fraud Detection: Repeated printing within a short period
  const rate = await checkRateLimit(`receipt-print:${current.id}:${receiptId}`, 5, 60)
  if (!rate.allowed) {
    await writeAudit({
      user: current,
      action: "receipt.print.warning",
      entityType: "receipt",
      entityId: receiptId,
      details: { warning: "Excessive printing attempt", printCount: target.printCount },
    })
    // Do not block printing as per Rule 8, but we already rate limited it?
    // Actually Rule 8 says "Do not block printing. Only flag suspicious activity."
    // So maybe I shouldn't use checkRateLimit to BLOCK, but to FLAG.
  }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const userAgent = h.get("user-agent") || "unknown"

  const newPrintCount = target.printCount + 1
  const now = new Date()

  // Transactional Update
  await db.transaction(async (tx) => {
    await tx
      .update(receipt)
      .set({
        printCount: newPrintCount,
        firstPrintedAt: target.firstPrintedAt || now,
        lastPrintedAt: now,
        lastPrintedBy: current.name,
      })
      .where(eq(receipt.id, receiptId))

    await tx.insert(receiptPrintHistory).values({
      id: randomUUID(),
      receiptId,
      printedById: current.id,
      printedByName: current.name,
      printNumber: newPrintCount,
      isReprint,
      ipAddress: ip,
      userAgent,
      // browser and device could be parsed if we had a library,
      // for now we store the raw user agent in userAgent field
      // and we can extract it later or store it in these fields if we want.
      printedAt: now,
    })

    await writeAudit(
      {
        user: current,
        action: isReprint ? "receipt.reprint" : "receipt.print",
        entityType: "receipt",
        entityId: receiptId,
        details: {
          receiptNumber: target.receiptNumber,
          printNumber: newPrintCount,
          isReprint,
          ipAddress: ip,
          role: current.role,
          organizationId: current.organizationId,
          clusterId: current.clusterId,
          branchId: current.branchId,
          schemeId: current.schemeId,
        },
      },
      tx,
    )

    // Fraud Detection Flags
    if (newPrintCount > 5) {
      await writeAudit(
        {
          user: current,
          action: "receipt.fraud.warning",
          entityType: "receipt",
          entityId: receiptId,
          details: { reason: "excessive printing", printCount: newPrintCount },
        },
        tx,
      )
    }

    if (target.lastPrintedBy && target.lastPrintedBy !== current.name) {
      await writeAudit(
        {
          user: current,
          action: "receipt.fraud.warning",
          entityType: "receipt",
          entityId: receiptId,
          details: {
            reason: "printing by multiple users",
            previousUser: target.lastPrintedBy,
            currentUser: current.name,
          },
        },
        tx,
      )
    }
  })

  revalidatePath(`/dashboard/receipts/${receiptId}`)
  revalidatePath(`/verify`)

  return { ok: true, printCount: newPrintCount, isReprint }
}

export async function getPrintHistory(receiptId: string) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  // Verify access to receipt
  const [r] = await db
    .select({ id: receipt.id })
    .from(receipt)
    .where(and(eq(receipt.id, receiptId), scope))
    .limit(1)

  if (!r) return []

  return db
    .select()
    .from(receiptPrintHistory)
    .where(eq(receiptPrintHistory.receiptId, receiptId))
    .orderBy(desc(receiptPrintHistory.printedAt))
}
