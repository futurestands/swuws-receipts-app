import { db } from "@/lib/db"
import { auditLog, smsGatewayConfig } from "@/lib/db/schema"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"

/**
 * Enterprise SMS Gateway Service
 *
 * Config-driven: primarily reads provider/apiKey/username/senderId from
 * the sms_gateway_config table (admin-managed via the SMS Gateway panel
 * in /admin -- see app/actions/sms-gateway-settings.ts), so subscribing to
 * or changing providers is an admin action, not a code deploy. Falls back
 * to SMS_PROVIDER / SMS_API_KEY / SMS_USERNAME / SMS_SENDER_ID environment
 * variables only if the DB isn't configured, purely so nothing breaks for
 * any environment that already had those env vars set before this table
 * existed. When neither is configured, this stays a safe simulated no-op
 * — billing runs must never be blocked just because SMS isn't set up yet.
 *
 * Currently wired for Africa's Talking (common for Uganda/East Africa).
 * To add a different provider, add another branch in sendViaProvider()
 * keyed off provider — the public sendSMS() signature doesn't change.
 */

async function getGatewayCredentials() {
  const [row] = await db.select().from(smsGatewayConfig).where(eq(smsGatewayConfig.id, 1)).limit(1)

  if (row?.active && row.provider && row.apiKey && row.username) {
    return { provider: row.provider.toLowerCase(), apiKey: row.apiKey, username: row.username, senderId: row.senderId || undefined }
  }

  // Fallback for environments configured before this table existed.
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase()
  const apiKey = process.env.SMS_API_KEY
  const username = process.env.SMS_USERNAME
  const senderId = process.env.SMS_SENDER_ID
  if (provider && apiKey && username) {
    return { provider, apiKey, username, senderId }
  }

  return null
}

async function sendViaProvider(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const creds = await getGatewayCredentials()

  if (!creds) {
    // Not configured — caller records this as "simulated" below.
    return { ok: false, error: "not_configured" }
  }

  const { provider, apiKey, username, senderId } = creds

  if (provider === "africastalking") {
    try {
      const isSandbox = username === "sandbox"
      const url = isSandbox
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging"

      const body = new URLSearchParams({
        username,
        to,
        message,
        ...(senderId ? { from: senderId } : {}),
      })

      const res = await fetch(url, {
        method: "POST",
        headers: {
          apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        console.error("[SMS Gateway] Africa's Talking API error:", errText)
        return { ok: false, error: errText }
      }

      return { ok: true }
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Africa's Talking:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  console.error(`[SMS Gateway] Unknown SMS_PROVIDER "${provider}" — message not sent`)
  return { ok: false, error: `unknown_provider:${provider}` }
}

export async function sendSMS(to: string, message: string, userId?: string) {
  const result = await sendViaProvider(to, message)
  const isConfigured = result.error !== "not_configured"

  if (!isConfigured) {
    console.log(`[SMS Gateway] SMS_PROVIDER not configured — simulating send to ${to}: ${message}`)
  } else if (!result.ok) {
    console.error(`[SMS Gateway] Real send to ${to} failed: ${result.error}`)
  }

  // Always record for accountability, whether real, simulated, or failed —
  // this audit trail is what lets you tell the three cases apart later.
  const id = randomUUID()
  await db.insert(auditLog).values({
    id,
    userId,
    action: "billing.sms_sent",
    entityType: "sms_outbox",
    entityId: to,
    details: {
      message,
      recipient: to,
      status: !isConfigured ? "simulated" : result.ok ? "sent" : "failed",
      ...(result.error && isConfigured ? { error: result.error } : {}),
    },
    createdAt: new Date(),
  })

  // Never throw: a down/unconfigured SMS gateway must not block billing —
  // it's a secondary notification channel, not the source of truth. The
  // audit log above is what makes a failed/simulated send traceable.
  return { ok: true, id, delivered: isConfigured && result.ok }
}
