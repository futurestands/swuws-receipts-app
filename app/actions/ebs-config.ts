"use server"

import { db } from "@/lib/db"
import { ebsGatewayConfig } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canConfigureSystem } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { encryptSecret } from "@/lib/ebs/crypto"
import { eq } from "drizzle-orm"

export async function getEbsConfigAction() {
  const current = await requireUser()
  if (!canConfigureSystem(current)) {
    throw new Error("Access Denied: System configuration permissions required.")
  }

  const [config] = await db.select().from(ebsGatewayConfig).limit(1)

  if (!config) {
    return {
      active: false,
      providerName: "pegasus",
      baseUrl: "",
      syncCustomers: false,
      syncBills: false,
      pushMeterReadings: false,
      liveBalanceCheck: false,
      hasApiKey: false,
      hasApiSecret: false,
      hasWebhookSecret: false,
      updatedAt: null
    }
  }

  // Never return secrets to the client. Only return boolean flags indicating presence.
  return {
    active: config.active,
    providerName: config.providerName,
    baseUrl: config.baseUrl || "",
    syncCustomers: config.syncCustomers,
    syncBills: config.syncBills,
    pushMeterReadings: config.pushMeterReadings,
    liveBalanceCheck: config.liveBalanceCheck,
    hasApiKey: !!config.encryptedApiKey,
    hasApiSecret: !!config.encryptedApiSecret,
    hasWebhookSecret: !!config.encryptedWebhookSecret,
    updatedAt: config.updatedAt
  }
}

export async function saveEbsConfigAction(data: {
  active: boolean
  baseUrl?: string
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
  syncCustomers: boolean
  syncBills: boolean
  pushMeterReadings: boolean
  liveBalanceCheck: boolean
}) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) {
    throw new Error("Access Denied: System configuration permissions required.")
  }

  if (data.active) {
    if (!data.baseUrl) {
      throw new Error("A valid Base URL is required when enabling integration.")
    }
    try {
      const url = new URL(data.baseUrl)
      if (process.env.NODE_ENV !== "development" && url.protocol !== "https:") {
        throw new Error("HTTPS is required for production EBS integration.")
      }
    } catch (err: any) {
      if (err.message.includes("HTTPS")) throw err
      throw new Error("Invalid Base URL format.")
    }
  }

  const [existing] = await db.select().from(ebsGatewayConfig).limit(1)

  // Preserve existing credentials when replacement fields are blank
  const encryptedKey = data.apiKey ? encryptSecret(data.apiKey) : existing?.encryptedApiKey
  const encryptedSecret = data.apiSecret ? encryptSecret(data.apiSecret) : existing?.encryptedApiSecret
  const encryptedWebhook = data.webhookSecret ? encryptSecret(data.webhookSecret) : existing?.encryptedWebhookSecret

  const finalBaseUrl = data.baseUrl !== undefined ? data.baseUrl : existing?.baseUrl

  if (existing) {
    await db.update(ebsGatewayConfig).set({
      active: data.active,
      baseUrl: finalBaseUrl,
      encryptedApiKey: encryptedKey,
      encryptedApiSecret: encryptedSecret,
      encryptedWebhookSecret: encryptedWebhook,
      syncCustomers: data.syncCustomers,
      syncBills: data.syncBills,
      pushMeterReadings: data.pushMeterReadings,
      liveBalanceCheck: data.liveBalanceCheck,
      updatedById: current.id,
      updatedAt: new Date()
    }).where(eq(ebsGatewayConfig.id, existing.id))
  } else {
    await db.insert(ebsGatewayConfig).values({
      active: data.active,
      providerName: "pegasus",
      baseUrl: finalBaseUrl,
      encryptedApiKey: encryptedKey,
      encryptedApiSecret: encryptedSecret,
      encryptedWebhookSecret: encryptedWebhook,
      syncCustomers: data.syncCustomers,
      syncBills: data.syncBills,
      pushMeterReadings: data.pushMeterReadings,
      liveBalanceCheck: data.liveBalanceCheck,
      updatedById: current.id,
      updatedAt: new Date()
    })
  }

  await writeAudit({
    user: { id: current.id, name: current.name || "System", email: current.email || "" },
    action: "ebs.config.update",
    entityType: "ebs_gateway_config",
    details: {
      active: data.active,
      provider: "pegasus",
      keysUpdated: !!(data.apiKey || data.apiSecret || data.webhookSecret)
    } // No secrets written to audit logs
  })

  return { success: true }
}
