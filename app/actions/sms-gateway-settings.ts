"use server"

/**
 * SMS Gateway configuration -- deliberately its own action file, not part
 * of settings.ts. This holds a real credential (apiKey). Keeping it
 * separate from the general org settings (which many pages read via a
 * broadly cached getSettings() call) means there's no path by which this
 * ever accidentally ends up in a client-visible props object elsewhere in
 * the app. Only this file's own actions, and lib/sms-service.ts's actual
 * send call, should ever touch this table.
 */

import { db } from "@/lib/db"
import { smsGatewayConfig } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canConfigureSystem } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { normalizeSmsProvider, providerCredentialsReady } from "@/lib/sms-providers"

function maskKey(key: string | null) {
  if (!key) return null
  if (key.length <= 4) return "••••"
  return `••••••••${key.slice(-4)}`
}

/**
 * Returns the current config with the API key masked (last 4 characters
 * only). Never returns the real key to the client -- the admin panel shows
 * this masked value so an admin can confirm *something* is set without the
 * key ever leaving the server in readable form.
 */
export async function getSmsGatewaySettings() {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const [row] = await db.select().from(smsGatewayConfig).where(eq(smsGatewayConfig.id, 1)).limit(1)
  if (!row) {
    return { provider: null, username: null, senderId: null, active: false, maskedApiKey: null, hasApiKey: false }
  }
  return {
    provider: row.provider,
    username: row.username,
    senderId: row.senderId,
    active: row.active,
    maskedApiKey: maskKey(row.apiKey),
    hasApiKey: !!row.apiKey,
  }
}

/**
 * Updates SMS gateway config. apiKey is optional on purpose: if the admin
 * doesn't type a new one (leaves it blank, since the form only ever shows
 * a masked value), the existing key is left untouched rather than being
 * overwritten with an empty string -- the classic "blank field wipes a
 * secret" mistake.
 */
export async function updateSmsGatewaySettings(input: {
  provider: string
  username: string
  senderId?: string
  apiKey?: string // blank/omitted = keep existing key
  active: boolean
}) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const provider = normalizeSmsProvider(input.provider)
  if (!provider) {
    return { ok: false as const, error: "Choose Africa's Talking, Twilio, or Infobip" }
  }

  const [existing] = await db.select().from(smsGatewayConfig).where(eq(smsGatewayConfig.id, 1)).limit(1)
  const apiKey = input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : (existing?.apiKey ?? null)

  if (input.active && !providerCredentialsReady(provider, {
    active: true,
    apiKey,
    username: input.username,
    senderId: input.senderId,
  })) {
    const hint =
      provider === "twilio"
        ? "Twilio needs Account SID, Auth Token, and a From number (or Messaging Service SID)"
        : provider === "africastalking"
          ? "Africa's Talking needs a username and API key"
          : "Infobip needs an API key"
    return { ok: false as const, error: hint }
  }

  const values = {
    provider,
    username: input.username,
    senderId: input.senderId || null,
    active: input.active,
    apiKey,
    updatedById: current.id,
    updatedAt: new Date(),
  }

  if (existing) {
    await db.update(smsGatewayConfig).set(values).where(eq(smsGatewayConfig.id, 1))
  } else {
    await db.insert(smsGatewayConfig).values({ id: 1, ...values })
  }

  // Never write the actual key value into the audit log -- just that a
  // change happened and who made it.
  await writeAudit({
    user: current,
    action: "settings.sms_gateway.update",
    entityType: "sms_gateway_config",
    entityId: "1",
    details: { provider, keyChanged: !!(input.apiKey && input.apiKey.trim()), active: input.active }
  })

  revalidatePath("/admin")
  return { ok: true as const }
}

/**
 * Sends a single test message using whatever is currently saved, so an
 * admin can confirm the credentials actually work before relying on them
 * for a real campaign.
 */
export async function sendTestSms(phoneNumber: string) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) throw new Error("Forbidden")

  const { sendSMS } = await import("@/lib/sms-service")
  const result = await sendSMS(phoneNumber, "SWUWS Portal: this is a test message confirming your SMS gateway is configured correctly.", current.id)

  await writeAudit({
    user: current,
    action: "settings.sms_gateway.test",
    entityType: "sms_gateway_config",
    entityId: "1",
    details: { phoneNumber, delivered: result.delivered }
  })

  // sendSMS() itself never throws/reports ok:false (a down gateway must
  // never block billing elsewhere), so the real signal for this test
  // button is `delivered`, not `ok`.
  return { ok: result.delivered, id: result.id }
}
