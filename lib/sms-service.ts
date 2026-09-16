import { db } from "@/lib/db"
import { auditLog, smsGatewayConfig } from "@/lib/db/schema"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { normalizeSendablePhone } from "@/lib/phone"
import {
  normalizeSmsProvider,
  providerCredentialsReady,
  sendWithProvider,
  type GatewayCreds,
} from "@/lib/sms-providers"

/**
 * Config-driven SMS. Admin picks Africa's Talking, Twilio, or Infobip on
 * /admin — all three send for real when the gateway is active and the
 * provider's required fields are present. Env vars are a fallback only.
 * Unconfigured stays a simulated no-op so billing is never blocked.
 */

async function getGatewayCredentials(): Promise<GatewayCreds | null> {
  const [row] = await db.select().from(smsGatewayConfig).where(eq(smsGatewayConfig.id, 1)).limit(1)
  const fromDb = row ? normalizeSmsProvider(row.provider) : null
  if (fromDb && providerCredentialsReady(fromDb, row)) {
    return {
      provider: fromDb,
      apiKey: row!.apiKey!.trim(),
      username: (row!.username || "").trim(),
      senderId: row!.senderId?.trim() || undefined,
    }
  }

  const provider = normalizeSmsProvider(process.env.SMS_PROVIDER)
  const apiKey = process.env.SMS_API_KEY
  const username = process.env.SMS_USERNAME
  const senderId = process.env.SMS_SENDER_ID
  if (provider && providerCredentialsReady(provider, { active: true, apiKey, username, senderId })) {
    return {
      provider,
      apiKey: apiKey!.trim(),
      username: (username || "").trim(),
      senderId: senderId?.trim() || undefined,
    }
  }

  return null
}

async function sendViaProvider(to: string, message: string) {
  const creds = await getGatewayCredentials()
  if (!creds) return { ok: false as const, error: "not_configured" }
  return sendWithProvider(creds, to, message)
}

/** Why a send did not reach the carrier. `null` means it did. */
export type SmsFailureReason = "invalid_number" | "not_configured" | "gateway_error"

export async function sendSMS(
  to: string,
  message: string,
  userId?: string,
  options?: {
    /**
     * Audit action to record under. Defaults to the billing channel for
     * backwards compatibility; CRM passes its own so campaign traffic can be
     * told apart from billing notifications in the audit log.
     */
    auditAction?: string
  },
) {
  const auditAction = options?.auditAction || "billing.sms_sent"

  const recipient = normalizeSendablePhone(to)

  const result = recipient
    ? await sendViaProvider(recipient, message)
    : { ok: false, error: "invalid_number" }

  const reason: SmsFailureReason | null = result.ok
    ? null
    : result.error === "invalid_number"
      ? "invalid_number"
      : result.error === "not_configured"
        ? "not_configured"
        : "gateway_error"

  if (reason === "invalid_number") {
    console.error(`[SMS Gateway] "${to}" is not a usable phone number — not sent`)
  } else if (reason === "not_configured") {
    console.log(`[SMS Gateway] Provider not configured — simulating send to ${recipient}: ${message}`)
  } else if (reason) {
    console.error(`[SMS Gateway] Real send to ${recipient} failed: ${result.error}`)
  }

  const id = randomUUID()
  await db.insert(auditLog).values({
    id,
    userId,
    action: auditAction,
    entityType: "sms_outbox",
    entityId: recipient || to,
    details: {
      message,
      recipient: recipient || to,
      ...(recipient && recipient !== to ? { submitted: to } : {}),
      status:
        reason === null ? "sent" : reason === "not_configured" ? "simulated" : "failed",
      ...(reason && reason !== "not_configured" ? { error: result.error } : {}),
    },
    createdAt: new Date(),
  })

  return {
    ok: true,
    id,
    delivered: reason === null,
    reason,
    error: result.error,
    gatewayRef: result.messageId,
  }
}
