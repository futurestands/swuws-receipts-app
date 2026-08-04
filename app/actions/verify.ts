"use server"

import { db } from "@/lib/db"
import { receipt, receiptPrintHistory } from "@/lib/db/schema"
import { eq, count, sql } from "drizzle-orm"
import { checkRateLimit } from "@/lib/rate-limit"
import { headers } from "next/headers"

/**
 * This is intentionally the one action in the app with no requireUser()/
 * requireAdmin() call — it's the public verification page, and the whole
 * point is that an unauthenticated customer or third party can use it.
 *
 * Two deliberate safeguards given that receipt numbers are sequential (and
 * therefore guessable/enumerable), unlike e.g. a random API key:
 *  - heavy IP-based rate limiting, since this is the only public surface
 *    in the whole app that doesn't require a login;
 *  - the customer's name is masked in the response (only initials shown),
 *    and phone/address/account/notes are never included at all — enough
 *    to let someone confirm a receipt they were given is genuine, without
 *    turning this into a way to scrape the full customer ledger by
 *    iterating receipt numbers.
 */
function maskName(name: string) {
  return name
    .split(" ")
    .map((part) => (part.length <= 1 ? part : part[0] + "*".repeat(part.length - 1)))
    .join(" ")
}

export type VerifyResult = {
  receiptNumber: string
  status: "valid"
  amount: number
  currency: string
  paymentDate: Date
  orgName: string
  customerName: string
  branchName: string | null
  printCount: number
  lastPrintedAt: Date | null
  verifiedAt: Date
}

export async function verifyReceipt(receiptNumberInput: string) {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"

  const rate = await checkRateLimit(`verify:${ip}`, 20, 300, { failClosed: true })
  if (!rate.allowed) {
    return {
      ok: false as const,
      error: "Too many verification attempts from this connection. Please try again in a few minutes.",
    }
  }

  const cleaned = receiptNumberInput.trim().toUpperCase()
  if (!cleaned) {
    return { ok: false as const, error: "Enter a receipt number" }
  }

  const [row] = await db.select().from(receipt).where(eq(receipt.receiptNumber, cleaned)).limit(1)
  if (!row) {
    return { ok: false as const, error: "No receipt was found with that number" }
  }

  // Calculate print metadata from history (since receipt table is immutable)
  const [historyRes] = await db
    .select({
      count: count(),
      last: sql<Date | null>`max(${receiptPrintHistory.printedAt})`,
    })
    .from(receiptPrintHistory)
    .where(eq(receiptPrintHistory.receiptId, row.id))

  const result: VerifyResult = {
    receiptNumber: row.receiptNumber,
    status: "valid",
    amount: Number(row.amount),
    currency: row.currency,
    paymentDate: row.paymentDate,
    orgName: row.orgNameSnapshot,
    customerName: maskName(row.customerName),
    branchName: row.branchName,
    printCount: Number(historyRes?.count || 0),
    lastPrintedAt: historyRes?.last || null,
    verifiedAt: new Date(),
  }
  return { ok: true as const, result }
}
