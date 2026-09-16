/**
 * Provider HTTP for Africa's Talking, Twilio, and Infobip.
 * No database — sms-service.ts decides whether a send is configured.
 */

export type SmsProvider = "africastalking" | "twilio" | "infobip"

export type GatewayCreds = {
  provider: SmsProvider
  apiKey: string
  username: string
  senderId?: string
}

export type ProviderResult = { ok: boolean; error?: string; messageId?: string }

export function normalizeSmsProvider(value: string | null | undefined): SmsProvider | null {
  const p = (value || "").trim().toLowerCase()
  if (p === "africastalking" || p === "twilio" || p === "infobip") return p
  return null
}

/** True when this provider can place a real send with the saved fields. */
export function providerCredentialsReady(
  provider: string | null | undefined,
  fields: { active?: boolean; apiKey?: string | null; username?: string | null; senderId?: string | null },
): boolean {
  if (!fields.active || !fields.apiKey?.trim()) return false
  const p = normalizeSmsProvider(provider)
  if (!p) return false
  if (p === "africastalking") return !!fields.username?.trim()
  if (p === "twilio") return !!fields.username?.trim() && !!fields.senderId?.trim()
  return true
}

export function infobipBaseUrl(username?: string | null) {
  const raw = (username || "api.infobip.com").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  if (!raw) return "https://api.infobip.com"
  if (raw.includes(".")) return `https://${raw}`
  return `https://${raw}.api.infobip.com`
}

export function twilioMessageParams(to: string, message: string, senderId: string) {
  const body = new URLSearchParams({ To: to, Body: message })
  if (senderId.startsWith("MG")) body.set("MessagingServiceSid", senderId)
  else body.set("From", senderId)
  return body
}

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

function infobipRecipientResult(data: unknown): ProviderResult {
  const msg = (data as { messages?: Array<{ messageId?: string; status?: { groupName?: string; description?: string; name?: string } }> })
    ?.messages?.[0]
  const messageId = msg?.messageId ? String(msg.messageId) : undefined
  const group = String(msg?.status?.groupName || "").toUpperCase()
  if (group.includes("REJECT") || group.includes("UNDELIVER") || group.includes("EXPIRED")) {
    return { ok: false, error: msg?.status?.description || msg?.status?.name || group, messageId }
  }
  return { ok: true, messageId }
}

export async function sendWithProvider(creds: GatewayCreds, to: string, message: string): Promise<ProviderResult> {
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
    if (!username || !senderId) {
      return { ok: false, error: "Twilio needs Account SID, Auth Token, and a From number or Messaging Service SID" }
    }
    try {
      const auth = Buffer.from(`${username}:${apiKey}`).toString("base64")
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(username)}/Messages.json`

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: twilioMessageParams(to, message, senderId),
      })

      const data = await res.json().catch(() => ({})) as { sid?: string; message?: string }
      if (!res.ok) {
        console.error("[SMS Gateway] Twilio API error:", data)
        return { ok: false, error: data.message || res.statusText }
      }
      return { ok: true, messageId: data.sid }
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Twilio:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  if (provider === "infobip") {
    try {
      const url = `${infobipBaseUrl(username)}/sms/2/text/advanced`
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

      const data = await res.json().catch(() => ({})) as {
        requestError?: { serviceException?: { text?: string } }
        messages?: Array<{ messageId?: string; status?: { groupName?: string; description?: string; name?: string } }>
      }
      if (!res.ok) {
        const errText = data.requestError?.serviceException?.text || res.statusText
        console.error("[SMS Gateway] Infobip API error:", data)
        return { ok: false, error: errText }
      }
      return infobipRecipientResult(data)
    } catch (e) {
      console.error("[SMS Gateway] Failed to reach Infobip:", e)
      return { ok: false, error: e instanceof Error ? e.message : "unknown_error" }
    }
  }

  return { ok: false, error: `unknown_provider:${provider}` }
}
