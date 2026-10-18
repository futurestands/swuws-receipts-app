import { db } from "@/lib/db"
import { pegasusEvent, customer, billingRecord, billingPeriod, reconciliationException, user as userTable } from "@/lib/db/schema"
import { eq, ne, or } from "drizzle-orm"
import { randomUUID } from "crypto"
import { writeAudit } from "@/lib/audit"
import { createNotification } from "@/app/actions/notifications"
import { resolvePeriodIdForCustomerPayment } from "@/lib/billing/period-dates"

/**
 * Pegasus Event Processor (Step 4)
 *
 * Re-runnable and idempotent processor that consumes durable pegasus_event records.
 * Matches account numbers to customers, uses taken-date cutoff rules, creates
 * reconciliation exceptions (matched_pending_review, partial_payment, amount_mismatch),
 * and notifies real administrators/supervisors.
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

      if (!event) {
        return { ok: false, reason: "not_found" }
      }

      // Idempotency check: if already reviewed, processed, or needs_review, return current status
      if (["matched_pending_review", "processed", "needs_review", "failed"].includes(event.status)) {
        return { ok: event.status === "matched_pending_review" || event.status === "processed", status: event.status }
      }

      // Helper to notify real users with admin role or ebs.events.view / view reports permission
      const notifyRealUsers = async (title: string, message: string, priority: "normal" | "high" | "low" | "critical" = "high") => {
        const admins = await tx
          .select({ id: userTable.id, role: userTable.role })
          .from(userTable)
          .where(
            or(
              eq(userTable.role, "SYSTEM_ADMIN"),
              eq(userTable.role, "HEAD_COMMERCIAL"),
              eq(userTable.role, "FINANCE_OFFICER")
            )
          )

        if (admins.length > 0) {
          for (const admin of admins) {
            await createNotification({
              userId: admin.id,
              type: "ebs_exception_unmatched",
              title,
              message,
              priority,
              relatedEntityType: "pegasus_event",
              relatedEntityId: eventId,
            }).catch(() => {})
          }
        } else {
          // Fallback audit entry if no real user found
          await writeAudit({
            user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
            action: "ebs.notification.fallback",
            entityType: "pegasus_event",
            entityId: eventId,
            details: { title, message },
          })
        }
      }

      if (!event.accountNumber || !event.amount) {
        const errorMsg = "Missing accountNumber or amount in payment event."
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          pegasusEventId: eventId,
          exceptionType: "missing_fields",
          reason: errorMsg,
          priority: "high",
          status: "open",
        }).onConflictDoNothing()

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
          pegasusEventId: eventId,
          exceptionType: "unmatched_payment",
          reason: errorMsg,
          priority: "high",
          status: "open",
        }).onConflictDoNothing()

        await notifyRealUsers(
          "EBS Payment Unmatched Account",
          `Payment of UGX ${event.amount} received for unknown account ${event.accountNumber}.`,
          "high"
        )

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
      const rawPaidAt = event.paidAt ? new Date(event.paidAt) : new Date()
      const validPaidAt = isNaN(rawPaidAt.getTime()) ? new Date() : rawPaidAt

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
        validPaidAt,
        customerBills.map(b => ({ ...b, takenAt: b.billingDate || b.createdAt || validPaidAt })),
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
          pegasusEventId: eventId,
          exceptionType: "unmatched_bill",
          reason: errorMsg,
          priority: "normal",
          status: "open",
        }).onConflictDoNothing()

        await notifyRealUsers(
          "EBS Payment Unmatched Bill",
          `Payment of UGX ${event.amount} for account ${cust.customerAccount} has no matching bill in the billing period.`,
          "normal"
        )

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.needs_review",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "bill_not_found", accountNumber: cust.customerAccount },
        })

        return { ok: false, reason: "bill_not_found" }
      }

      // 4. Amount Matching / Partial Payment Check
      const billAmountDue = Number(targetBill.totalDue)
      const paidAmount = Number(event.amount)

      if (paidAmount < billAmountDue) {
        const errorMsg = `Partial payment: Bill due is ${billAmountDue}, payment received is ${paidAmount}.`
        await tx
          .update(pegasusEvent)
          .set({ status: "matched_pending_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          pegasusEventId: eventId,
          exceptionType: "partial_payment",
          reason: errorMsg,
          priority: "normal",
          status: "open",
        }).onConflictDoNothing()

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.partial_payment",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "partial_payment", expected: billAmountDue, received: paidAmount },
        })

        return { ok: true, status: "partial_payment" }
      }

      if (paidAmount > billAmountDue) {
        const errorMsg = `Overpayment / amount mismatch: Bill due is ${billAmountDue}, payment received is ${paidAmount}.`
        await tx
          .update(pegasusEvent)
          .set({ status: "needs_review", errorMessage: errorMsg })
          .where(eq(pegasusEvent.id, eventId))

        await tx.insert(reconciliationException).values({
          id: `exc-${randomUUID()}`,
          pegasusEventId: eventId,
          exceptionType: "amount_mismatch",
          reason: errorMsg,
          priority: "high",
          status: "open",
        }).onConflictDoNothing()

        await notifyRealUsers(
          "EBS Payment Amount Mismatch",
          `Overpayment of UGX ${paidAmount} received for account ${cust.customerAccount} (Bill due: ${billAmountDue}).`,
          "high"
        )

        await writeAudit({
          user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
          action: "ebs.event.needs_review",
          entityType: "pegasus_event",
          entityId: eventId,
          details: { reason: "amount_mismatch", expected: billAmountDue, received: paidAmount },
        })

        return { ok: false, reason: "amount_mismatch" }
      }

      // 5. Exact match -> Mark event as matched_pending_review (Do NOT modify balance or create receipt automatically)
      await tx
        .update(pegasusEvent)
        .set({
          status: "matched_pending_review",
          processedAt: new Date(),
          reconciliationBatchId: "ebs-webhook-batch",
        })
        .where(eq(pegasusEvent.id, eventId))

      await writeAudit({
        user: { id: "system", name: "EBS Processor", email: "system@swuws.local" },
        action: "ebs.event.matched_pending_review",
        entityType: "pegasus_event",
        entityId: eventId,
        details: { accountNumber: cust.customerAccount, amount: paidAmount },
      })

      return { ok: true, status: "matched_pending_review" }
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("processPegasusEvent failed:", msg)
    return { ok: false, error: msg }
  }
}
