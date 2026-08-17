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
  auditLog,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { getSettings } from "@/app/actions/settings"
import { and, desc, eq, gte, lte, sql, sum, inArray, getTableColumns, count } from "drizzle-orm"
import { randomUUID } from "crypto"
import { revalidatePath, revalidateTag } from "next/cache"
import { put } from "@vercel/blob"
import { checkRateLimit } from "@/lib/rate-limit"
import { ROLES } from "@/lib/permissions/roles"
import { canViewAllData, canIssueReceipt, canPrintReceipt, canReprintReceipt } from "@/lib/permissions"
import { applyReceiptScope, validateWriteScope } from "@/lib/scopes"
import { hasPermission } from "@/lib/iam"
import { receiptPrintHistory, user as userTable } from "@/lib/db/schema"
import { headers } from "next/headers"
import { logEvent, logFinancial, logSecurity } from "@/lib/logger"
import { createReceiptSchema, type CreateReceiptInput } from "@/lib/finance-schemas"

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

export async function createReceipt(input: CreateReceiptInput & { idempotencyKey?: string }) {
  const current = await requireUser()
  if (!canIssueReceipt(current)) throw new Error("Forbidden")

  // 0. Idempotency Guard (Check if this receipt already exists)
  if (input.idempotencyKey) {
    const [existing] = await db
      .select({ id: receipt.id, receiptNumber: receipt.receiptNumber })
      .from(receipt)
      .where(eq(receipt.idempotencyKey, input.idempotencyKey))
      .limit(1)

    if (existing) {
      return { ok: true as const, receipt: existing }
    }
  }

  // Organizational Scope Validation:
  // Ensure the user is issuing a receipt for their assigned Area (Branch).
  if (!(await validateWriteScope(current, "receipts.create", { branchId: input.branchId }))) {
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

  const amount = data.amount

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

        // Double-submission guard: a rapid double-click/double-tap on
        // "Issue receipt" (network lag, a slow re-render before the
        // button visually disables, or a retried request after a dropped
        // response) could otherwise create two real receipts for the
        // same payment. Because this check runs after the FOR UPDATE
        // lock above, two near-simultaneous requests for the same
        // customer genuinely serialize here — the second one only runs
        // this check after the first has committed, so it will actually
        // see the first one's receipt rather than racing past it.
        const dup = await tx.execute<{ id: string }>(
          data.billingRecordId
            ? sql`SELECT id FROM receipt WHERE "customerId" = ${data.customerId} AND "agentId" = ${current.id} AND amount = ${amount} AND "billingRecordId" = ${data.billingRecordId} AND "createdAt" > NOW() - INTERVAL '15 seconds' ORDER BY "createdAt" DESC LIMIT 1`
            : sql`SELECT id FROM receipt WHERE "customerId" = ${data.customerId} AND "agentId" = ${current.id} AND amount = ${amount} AND "billingRecordId" IS NULL AND "createdAt" > NOW() - INTERVAL '15 seconds' ORDER BY "createdAt" DESC LIMIT 1`
        )
        if (dup.rows[0]) {
          const err = new Error("DUPLICATE_RECEIPT")
          // @ts-expect-error - Custom property for error handling
          err.duplicateReceiptId = dup.rows[0].id
          throw err
        }
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
        amountDueSnapshot = Number(bill.totalDue)

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
        remainingBefore = Number(bill.totalDue) - previouslyPaid

        if (remainingBefore <= 0) {
          await tx.update(billingRecord).set({ status: "paid" }).where(eq(billingRecord.id, bill.id))
          throw new Error("This bill is already fully paid")
        }

        // Apply totalAvailable to bill, capped at remainingBefore
        appliedToBill = Math.min(totalAvailable, remainingBefore)
        const outstandingAfter = remainingBefore - appliedToBill
        // Goal Alignment: Bills only move to 'paid' AFTER bank reconciliation.
        // For now, we move them to 'pending_bank_confirmation'.
        newStatus = outstandingAfter <= 0 ? "pending_bank_confirmation" : "partially_paid"

        // Update Billing Record Status
        // Note: We only update status to 'partially_paid' or 'pending_bank_confirmation'
        // to track operational progress. Final 'paid' status requires bank sync.
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

      const newAccountBalance = previousAccountBalance - amount
      const outstandingBalanceSnapshot = data.billingRecordId
        ? Math.max(0, remainingBefore - appliedToBill)
        : (data.outstandingBalance ?? null)

      // 3. Create Immutable Receipt
      const settings = await getSettings()
      const id = randomUUID()
      const paymentReference = data.paymentReference?.trim() || generatePaymentReference()
      const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date()

      // Fetch next sequence value for dynamic receipt number
      const seqResult = await tx.execute<{ nextval: string }>(sql`SELECT nextval('receipt_seq')::text`)
      const nextId = seqResult.rows[0]?.nextval || "0"

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
          seq: Number(nextId),
          paymentReference,
          receiptNumber: `${settings.receiptPrefix}-${new Date().getFullYear()}-${nextId.padStart(6, "0")}`,
          billingRecordId: data.billingRecordId || null,
          billingPeriodId: data.billingPeriodId || activePeriod.id,
          billingPeriodSnapshot: periodName,
          amountDueSnapshot: String(amountDueSnapshot || 0),
          schemeNameSnapshot: schemeName,
          customerId: data.customerId || null,
          customerName,
          customerAccount,
          customerPhone,
          customerAddress,
          amount: String(amount), // The actual money collected from the customer
          outstandingBalance: String(outstandingBalanceSnapshot || 0),
          previousAccountBalanceSnapshot: String(previousAccountBalance),
          newAccountBalanceSnapshot: String(newAccountBalance),
          currency: settings.currencyCode,
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
          orgAddressSnapshot: settings.address,
          orgPhoneSnapshot: settings.phone,
          disclaimerSnapshot: settings.disclaimer,
          footerSnapshot: settings.footerText,
          logoUrlSnapshot: settings.logoUrl,
          idempotencyKey: input.idempotencyKey || null,
        })
        .returning()

      // NOTE: We NO LONGER update the customerTable.accountBalance or billingRecord status here.
      // Customer balances are only reduced when an EBS import (Daily/Monthly) is processed.

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

    logFinancial("Receipt Issued", {
      id: row.id,
      receiptNumber: row.receiptNumber,
      amount: row.amount,
      customer: row.customerName
    }, current)

    revalidatePath("/dashboard")
    revalidatePath("/admin")
    return { ok: true as const, receipt: row }
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'duplicateReceiptId' in e) {
      const duplicateReceiptId = (e as { duplicateReceiptId: string }).duplicateReceiptId
      // Not a real failure — a near-identical receipt was already created
      // moments ago (double-click, retry after a dropped response, etc).
      // Return the existing receipt so the UI shows the same success
      // state instead of a confusing error, without creating a second
      // real financial record.
      const [existing] = await db.select().from(receipt).where(eq(receipt.id, duplicateReceiptId)).limit(1)
      if (existing) {
        return { ok: true as const, receipt: existing, duplicate: true as const }
      }
    }
    logEvent({
      message: "createReceipt failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    const message = e instanceof Error ? e.message : "Could not save the receipt. Nothing was charged or recorded — please try again."
    return {
      ok: false as const,
      error: message,
    }
  }
}

export async function getReceipts(limit = 100) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const printCounts = db
    .select({
      receiptId: receiptPrintHistory.receiptId,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(receiptPrintHistory)
    .groupBy(receiptPrintHistory.receiptId)
    .as("print_counts")

  // SECURITY/UI HARDENING: Exclude voided/deleted receipts from normal lists.
  // They remain in the database for audit integrity but "disappear" from the UI.
  return db
    .select({
      ...getTableColumns(receipt),
      printCount: sql<number>`coalesce(${printCounts.count}, 0)`.as("printCount"),
    })
    .from(receipt)
    .leftJoin(printCounts, eq(receipt.id, printCounts.receiptId))
    // Optimized exclusion check
    .leftJoin(auditLog, and(eq(receipt.id, auditLog.entityId), eq(auditLog.action, 'receipt.void')))
    .where(and(
      scope,
      sql`${auditLog.id} IS NULL`
    ))
    .orderBy(desc(receipt.createdAt))
    .limit(limit)
}

export async function getReceiptById(id: string) {
  const current = await requireUser()
  const scope = applyReceiptScope(current)

  const printMeta = db
    .select({
      receiptId: receiptPrintHistory.receiptId,
      count: sql<number>`count(*)::int`.as("count"),
      first: sql<Date>`min(${receiptPrintHistory.printedAt})`.as("first"),
      last: sql<Date>`max(${receiptPrintHistory.printedAt})`.as("last"),
    })
    .from(receiptPrintHistory)
    .where(eq(receiptPrintHistory.receiptId, id))
    .groupBy(receiptPrintHistory.receiptId)
    .as("print_meta")

  const [row] = await db
    .select({
      ...getTableColumns(receipt),
      printCount: sql<number>`coalesce(${printMeta.count}, 0)`.as("printCount"),
      firstPrintedAt: printMeta.first,
      lastPrintedAt: printMeta.last,
    })
    .from(receipt)
    .leftJoin(printMeta, eq(receipt.id, printMeta.receiptId))
    .where(and(eq(receipt.id, id), scope))
    .limit(1)

  if (!row) return null

  // Fetch lastPrintedBy and check if voided separately for query simplicity
  const [last, voidEvent] = await Promise.all([
    row.printCount > 0
      ? db
          .select({ name: receiptPrintHistory.printedByName })
          .from(receiptPrintHistory)
          .where(eq(receiptPrintHistory.receiptId, id))
          .orderBy(desc(receiptPrintHistory.printedAt))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "receipt.void")))
      .limit(1)
  ])

  return {
    ...row,
    lastPrintedBy: last[0]?.name || null,
    isVoided: voidEvent.length > 0
  }
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

  // Audit Hardening: Magic-Byte Verification (Phase 2 Remediation)
  // Trust but verify: the client-supplied MIME type can be spoofed.
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer.slice(0, 8))

  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 // %PDF
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 // \x89PNG
  const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF // JPEG SOI

  if (!isPdf && !isPng && !isJpeg) {
    return {
      ok: false as const,
      error: "Security Alert: File content does not match the allowed types (PDF, PNG, JPEG). The upload has been blocked.",
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
  let current;
  try {
    current = await requireUser()
    const day = dateISO ? new Date(dateISO) : new Date()
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)

    const scope = applyReceiptScope(current)
    const voidedIdsSubquery = db
      .select({ id: auditLog.entityId })
      .from(auditLog)
      .where(eq(auditLog.action, 'receipt.void'))

    const conditions = [
      gte(receipt.createdAt, start),
      lte(receipt.createdAt, end),
      sql`${receipt.id} NOT IN (${voidedIdsSubquery})`
    ]
    if (scope) conditions.push(scope)

    const [totals] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${receipt.amount}), 0)::numeric`,
      })
      .from(receipt)
      .where(and(...conditions))

    return {
      count: Number(totals?.count ?? 0),
      total: Number(totals?.total ?? 0),
    }
  } catch (e) {
    console.warn("getDailyTotals failed - using empty fallback", e)
    return { count: 0, total: 0 }
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
  const current = await requireUser()
  const conditions = [eq(branchTable.active, true)]

  if (current.role !== ROLES.SYSTEM_ADMIN && (current.clusterId || current.branchId || current.schemeId)) {
    if (current.branchId) {
      conditions.push(eq(branchTable.id, current.branchId))
    } else if (current.clusterId) {
      conditions.push(eq(branchTable.clusterId, current.clusterId))
    }
  }

  return db
    .select()
    .from(branchTable)
    .where(and(...conditions))
    .orderBy(branchTable.name)
}

export async function recordReceiptPrint(receiptId: string) {
  const current = await requireUser()

  // Scope Check
  const scope = applyReceiptScope(current)
  const [target] = await db
    .select({ id: receipt.id, receiptNumber: receipt.receiptNumber })
    .from(receipt)
    .where(and(eq(receipt.id, receiptId), scope))
    .limit(1)

  if (!target) {
    throw new Error("Receipt not found or you don't have access to it.")
  }

  // Calculate print metadata from history (since receipt table is immutable)
  const [countRes] = await db
    .select({ count: count() })
    .from(receiptPrintHistory)
    .where(eq(receiptPrintHistory.receiptId, receiptId))
  const currentCount = Number(countRes?.count || 0)

  const isReprint = currentCount > 0

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
      details: { warning: "Excessive printing attempt", currentCount },
    })
  }

  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const userAgent = h.get("user-agent") || "unknown"

  const newPrintCount = currentCount + 1
  const now = new Date()

  // Transactional Update
  await db.transaction(async (tx) => {
    // Note: receipt table update removed to respect immutability triggers

    await tx.insert(receiptPrintHistory).values({
      id: randomUUID(),
      receiptId,
      printedById: current.id,
      printedByName: current.name,
      printNumber: newPrintCount,
      isReprint,
      ipAddress: ip,
      userAgent,
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

/**
 * Implements logic for the 'receipts.void' permission.
 * Since receipts are immutable in the DB, this creates a reversing
 * financial entry (restores customer balance) and logs the event.
 */
export async function requestReceiptVoid(receiptId: string, reason: string) {
  const current = await requireUser()
  if (!(await hasPermission(current, "receipts.void"))) throw new Error("Forbidden")

  if (!reason.trim()) throw new Error("Reason for voiding is required")

  const target = await getReceiptById(receiptId)
  if (!target) throw new Error("Receipt not found or access denied")

  if (target.reconciliationStatus === "matched") {
    throw new Error("This receipt has already been reconciled and cannot be voided.")
  }

  try {
    await db.transaction(async (tx) => {
      // 2. IDEMPOTENCY CHECK: Verify if already voided
      const [existingVoid] = await tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.entityId, receiptId), eq(auditLog.action, "receipt.void")))
        .limit(1)

      if (existingVoid) {
        throw new Error("This receipt has already been deleted.")
      }

      // NOTE: We DO NOT update the customerTable.accountBalance here.
      // Under our current architecture, receipt creation does not reduce the balance,
      // therefore receipt deletion does not need to increase it.
      // Financial truth is only updated via official EBS imports.

      // 3. insert Audit Log
      await writeAudit(
        {
          user: current,
          action: "receipt.void",
          entityType: "receipt",
          entityId: receiptId,
          details: {
            receiptNumber: target.receiptNumber,
            amount: target.amount,
            reason,
          },
        },
        tx,
      )
    })

    logFinancial("Receipt Voided (Reversed)", {
      id: receiptId,
      amount: target.amount,
      reason
    }, current)

    revalidatePath("/dashboard")
    revalidatePath(`/dashboard/receipts/${receiptId}`)
    return { ok: true as const }
  } catch (e: unknown) {
    logEvent({
      message: "voidReceipt failed",
      severity: "error",
      category: "system",
      error: e,
      user: current,
    })
    const message = e instanceof Error ? e.message : "Failed to void receipt"
    return { ok: false as const, error: message }
  }
}
