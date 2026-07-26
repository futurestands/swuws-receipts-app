import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { randomUUID } from "crypto"

/**
 * Enterprise SMS Gateway Service
 *
 * To activate live SMS:
 * 1. Sign up for a provider (e.g., AfricasTalking, Twilio).
 * 2. Add their SDK/API call in the sendSMS function below.
 */
export async function sendSMS(to: string, message: string, userId?: string) {
  console.log(`[SMS Gateway] Sending to ${to}: ${message}`)

  // 1. PLACEHOLDER FOR LIVE API CALL
  // Example: await africasTalking.send({ to, message })

  // 2. LOG TO AUDIT (Always record for accountability)
  const id = randomUUID()
  await db.insert(auditLog).values({
    id,
    userId,
    action: "billing.sms_sent",
    entityType: "sms_outbox",
    entityId: to,
    details: { message, recipient: to, status: "simulated" },
    createdAt: new Date(),
  })

  return { ok: true, id }
}
