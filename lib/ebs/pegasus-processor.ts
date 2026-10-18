import { db } from "@/lib/db"
import { pegasusEvent, customer, billingRecord, billingPeriod, reconciliationException } from "@/lib/db/schema"
import { eq, ne } from "drizzle-orm"
import { randomUUID } from "crypto"
import { writeAudit } from "@/lib/audit"
import { createNotification } from "@/app/actions/notifications"
import { resolvePeriodIdForCustomerPayment } from "@/lib/billing/period-dates"

/**
 * Pegasus Event Processor (Step 4)
 *
 * Re-runnable and idempotent processor that consumes durable pegasus_event records.
 * Matches account numbers to customers, uses the taken-date cutoff rule, and creates
 * reconciliation exceptions without automatically writing money or receipts.
 */
export async function processPegasusEvent(eventId: string) {
  try {
    return await db.transaction(async (tx) => {
      // 1. Fetch event from pegasusEvent inbox
      const [event] = await tx
        .select()
        .from(pegasusEvent)
        .where(eq(pegasusEvent.id, eventId))
        .limit(1)

      if (!event || event.status === "processed" || event.status === "ignored") {
        return { ok: true, status: event?.status || "not_found" }
      }

      if (!event.accountNumber || !event.amount) {
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: "Missing accountNumber or amount in payment event." })
          .where(eq(pegasusEvent.id, eventId))
        return { ok: false, reason: "missing_fields" }
      }

      // 2. Match account number to customer (customer.customerAccount)
      const [cust] = await tx
        .select()
        .from(customer)
        .where(eq(customer.customerAccount, event.accountNumber))
        .limit(1)

      if (!cust) {
        const errorMsg = `Customer account ${event.accountNumber} not found in system.`
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          exceptionType: "unmatched_payment",
          reason: errorMsg,
          priority: "high",
          status: "open",
        }).onConflictDoNothing()

        await createNotification({
          userId: "system-admin",
          type: "ebs_exception_unmatched",
          title: "EBS Payment Unmatched Account",
          message: `Payment of UGX ${event.amount} received for unknown account ${event.accountNumber}.`,
          priority: "high",
          relatedEntityType: "pegasus_event",
          relatedEntityId: eventId,
        }).catch(() => {})

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.needs_review",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "customer_not_found", accountNumber: event.accountNumber },
        })

        return { ok: false, reason: "customer_not_found" }
      }

      // 3. Resolve target bill using billing periods and customer bills
      const customerBills = await tx
        .select({
          id: billingRecord.id,
          billingPeriodId: billingRecord.billingPeriodId,
          totalDue: billingRecord.totalDue,
          billingDate: billingRecord.billingDate,
          createdAt: billingRecord.createdAt,
        })
        .from(billingRecord)
        .where(eq(billingRecord.customerId, cust.id))

      const periods = await tx
        .select({
          id: billingPeriod.id,
          status: billingPeriod.status,
          startDate: billingPeriod.startDate,
          endDate: billingPeriod.endDate,
        })
        .from(billingPeriod)
        .where(ne(billingPeriod.status, "archived"))

      const targetPeriodId = resolvePeriodIdForCustomerPayment(
        event.paidAt,
        customerBills.map(b => ({ ...b, takenAt: b.billingDate || b.createdAt })),
        periods,
        periods[0]?.id
      )

      const targetBill = customerBills.find(b => b.billingPeriodId === targetPeriodId)

      if (!targetBill) {
        const errorMsg = `No active or matching billing record found for customer ${cust.customerAccount}.`
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          exceptionType: "unmatched_bill",
          reason: errorMsg,
          priority: "medium",
          status: "open",
        }).onConflictDoNothing()

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.needs_review",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "bill_not_found", accountNumber: cust.customerAccount },
        })

        return { ok: false, reason: "bill_not_found" }
      }

      // 4. Amount Mismatch Check
      const billAmountDue = Number(targetBill.totalDue)
      const paidAmount = Number(event.amount)

      if (Math.abs(billAmountDue - paidAmount) > 100) {
        const errorMsg = `Amount mismatch: Bill due is ${billAmountDue}, payment received is ${paidAmount}.`
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          exceptionType: "amount_mismatch",
          reason: errorMsg,
          priority: "warning",
          status: "open",
        }).onConflictDoNothing()

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.needs_review",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "amount_mismatch", expected: billAmountDue, received: paidAmount },
        })

        return { ok: false, reason: "amount_mismatch" }
      }

      // 5. Successful Processing -> Mark event as processed (Do NOT modify balance or create receipt automatically)
      await tx
        .update(pegasusEvent)
        .set({
          status: "processed",
          processedAt: new Date(),
          reconciliationBatchId: "ebs-webhook-batch",
        })
        .where(eq(pegasusEvent.id, eventId))

      await writeAudit({
        user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
        action: "ebs.event.processed",
        entityType: "pegasus_event",
        entityId: eventId,
        details: { accountNumber: cust.customerAccount, amount: paidAmount },
      })

      return { ok: true, status: "processed" }
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("processPegasusEvent failed:", msg)
    return { ok: false, error: msg }
  }
}
