import { db } from "@/lib/db"
import { auditLog, smsGatewayConfig } from "@/lib/db/schema"
import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { normalizeSendablePhone } from "@/lib/phone"

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

type ProviderResult = { ok: boolean; error?: string; messageId?: string }

function africastalkingRecipientResult(data: unknown): ProviderResult {
  const rec = (data as { SMSMessageData?: { Recipients?: Array<{ status?: string; messageId?: string }> } })
    ?.SMSMessageData?.Recipients?.[0]
  const status = String(rec?.status || "")
  const messageId = rec?.messageId ? String(rec.messageId) : undefined
  if (/invalid/i.test(status) || /unknownsubscriber/i.test(status) || /black.?list/i.test(status)) {
    return { ok: false, error: "invalid_number", messageId }
  }
  if (status && status.toLowerCase() !== "success") {
    return { ok: false, error: status, messageId }
  }
  return { ok: true, messageId }
}

async function sendViaProvider(to: string, message: string): Promise<ProviderResult> {
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

      const data = await res.json().catch(() => null)
      return africastalkingRecipientResult(data)
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Africa's Talking:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  if (provider === "twilio") {
    try {
      // Twilio uses Basic Auth (Username: Account SID, Password: Auth Token)
      const auth = Buffer.from(`${username}:${apiKey}`).toString('base64')
      const url = `https://api.twilio.com/2010-04-01/Accounts/${username}/Messages.json`

      const body = new URLSearchParams({
        To: to,
        From: senderId || "", // Twilio requires a From number or Messaging Service SID
        Body: message,
      })

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        console.error("[SMS Gateway] Twilio API error:", errData)
        return { ok: false, error: errData.message || res.statusText }
      }

      return { ok: true }
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Twilio:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  if (provider === "infobip") {
    try {
      // Infobip uses API Key in Authorization header
      const url = `https://${username}.api.infobip.com/sms/2/text/advanced`

      const body = JSON.stringify({
        messages: [
          {
            destinations: [{ to }],
            from: senderId || "SWUWS",
            text: message,
          },
        ],
      })

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `App ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        console.error("[SMS Gateway] Infobip API error:", errData)
        return { ok: false, error: res.statusText }
      }

      return { ok: true }
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Infobip:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  console.error(`[SMS Gateway] Unknown SMS_PROVIDER "${provider}" — message not sent`)
  return { ok: false, error: `unknown_provider:${provider}` }
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

  // Normalise before anything else: gateways reject local trunk formats
  // ("0770000001"), and a whole imported batch is usually in that form.
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

  // Always record for accountability, whether real, simulated, or failed —
  // this audit trail is what lets you tell the cases apart later.
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

  // Never throw: a down/unconfigured SMS gateway must not block billing —
  // it's a secondary notification channel, not the source of truth. The
  // audit log above is what makes a failed/simulated send traceable.
  return {
    ok: true,
    id,
    delivered: reason === null,
    reason,
    error: result.error,
    gatewayRef: result.messageId,
  }
}
