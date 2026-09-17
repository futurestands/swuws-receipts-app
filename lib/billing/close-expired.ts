import "server-only"
import { randomUUID } from "crypto"
import { db } from "@/lib/db"
import { billingPeriod } from "@/lib/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { writeAudit } from "@/lib/audit"
import { decideCalendarRoll } from "@/lib/billing/calendar-roll"

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
    if ("code" in current && String(current.code) === "23505") return true
    current = "cause" in current ? current.cause : null
  }
  return false
}

/**
 * Closes collection periods whose Kampala month has ended, then opens
 * the current calendar month if none is active. Pass { open: false }
 * when creating a period so the wizard does not also auto-open one.
 */
export async function closeExpiredActivePeriods(
  now = new Date(),
  options: { open?: boolean } = {},
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(87201617)`)

    const periods = await tx
      .select({
        id: billingPeriod.id,
        status: billingPeriod.status,
        periodName: billingPeriod.periodName,
        month: billingPeriod.month,
        year: billingPeriod.year,
        startDate: billingPeriod.startDate,
        endDate: billingPeriod.endDate,
        createdAt: billingPeriod.createdAt,
        closedById: billingPeriod.closedById,
      })
      .from(billingPeriod)

    const plan = decideCalendarRoll(now, periods, options)
    const closedIds: string[] = []
    const clampById = new Map(plan.clampEnds.map((c) => [c.id, c.endDate]))
    const extendById = new Map(plan.extendEnds.map((c) => [c.id, c.endDate]))

    for (const id of plan.closeIds) {
      const period = periods.find((p) => p.id === id)
      const clampedEnd = clampById.get(id)
      const updated = await tx
        .update(billingPeriod)
        .set({
          status: "closed",
          isOpen: false,
          closedAt: now,
          updatedAt: now,
          ...(clampedEnd ? { endDate: clampedEnd } : {}),
        })
        .where(and(eq(billingPeriod.id, id), eq(billingPeriod.status, "active")))
        .returning({ id: billingPeriod.id })

      if (updated.length === 0) continue
      closedIds.push(id)
      await writeAudit({
        user: null,
        action: "collection.period.auto_close",
        entityType: "billing_period",
        entityId: id,
        details: {
          name: period?.periodName,
          endDate: (clampedEnd ?? period?.endDate)?.toISOString(),
          reason: clampedEnd ? "collection_month_ended" : "calendar_roll",
        },
      }, tx)
    }

    for (const [id, endDate] of extendById) {
      await tx
        .update(billingPeriod)
        .set({ endDate, updatedAt: now })
        .where(eq(billingPeriod.id, id))
    }

    const [stillActive] = await tx
      .select({ id: billingPeriod.id })
      .from(billingPeriod)
      .where(eq(billingPeriod.status, "active"))
      .limit(1)

    if (stillActive) return closedIds

    if (plan.activateId) {
      const extendedEnd = extendById.get(plan.activateId)
      const activated = await tx
        .update(billingPeriod)
        .set({
          status: "active",
          isOpen: true,
          activatedAt: now,
          closedAt: null,
          closedById: null,
          updatedAt: now,
          ...(extendedEnd ? { endDate: extendedEnd } : {}),
        })
        .where(and(
          eq(billingPeriod.id, plan.activateId),
          inArray(billingPeriod.status, ["draft", "validated", "closed"]),
        ))
        .returning({ id: billingPeriod.id, periodName: billingPeriod.periodName })

      if (activated[0]) {
        await writeAudit({
          user: null,
          action: "collection.period.auto_open",
          entityType: "billing_period",
          entityId: activated[0].id,
          details: {
            name: activated[0].periodName,
            reason: "reuse_bill_month",
          },
        }, tx)
      }
      return closedIds
    }

    if (plan.create) {
      const id = randomUUID()
      try {
        await tx.insert(billingPeriod).values({
          id,
          month: plan.create.month,
          year: plan.create.year,
          periodName: plan.create.periodName,
          startDate: plan.create.startDate,
          endDate: plan.create.endDate,
          description: plan.create.description,
          status: "active",
          isOpen: true,
          activatedAt: now,
        })
        await writeAudit({
          user: null,
          action: "collection.period.auto_open",
          entityType: "billing_period",
          entityId: id,
          details: {
            name: plan.create.periodName,
            startDate: plan.create.startDate.toISOString(),
            endDate: plan.create.endDate.toISOString(),
            reason: "calendar_month",
          },
        }, tx)
      } catch (err) {
        if (!isUniqueViolation(err)) throw err
      }
    }

    return closedIds
  })
}
