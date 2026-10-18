"use server"

import { db } from "@/lib/db"
import { ebsGatewayConfig, pegasusEvent } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canConfigureSystem, canViewEbsEvents } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { encryptSecret } from "@/lib/ebs/crypto"
import { eq, desc } from "drizzle-orm"

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
      webhookSecretRotatedAt: null,
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
    webhookSecretRotatedAt: config.webhookSecretRotatedAt,
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
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("HTTPS")) throw err
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

export async function rotateWebhookSecretAction(newSecret: string) {
  const current = await requireUser()
  if (!canConfigureSystem(current)) {
    throw new Error("Access Denied: System configuration permissions required.")
  }

  if (!newSecret || newSecret.length < 8) {
    throw new Error("New webhook secret must be at least 8 characters long.")
  }

  const [existing] = await db.select().from(ebsGatewayConfig).limit(1)
  const encryptedWebhook = encryptSecret(newSecret)
  const rotatedAt = new Date()

  if (existing) {
    await db.update(ebsGatewayConfig).set({
      encryptedWebhookSecret: encryptedWebhook,
      webhookSecretRotatedAt: rotatedAt,
      updatedById: current.id,
      updatedAt: new Date(),
    }).where(eq(ebsGatewayConfig.id, existing.id))
  } else {
    await db.insert(ebsGatewayConfig).values({
      providerName: "pegasus",
      encryptedWebhookSecret: encryptedWebhook,
      webhookSecretRotatedAt: rotatedAt,
      updatedById: current.id,
    })
  }

  await writeAudit({
    user: { id: current.id, name: current.name || "System", email: current.email || "" },
    action: "ebs.webhook_secret.rotate",
    entityType: "ebs_gateway_config",
    details: { rotatedAt: rotatedAt.toISOString() }, // No secret value
  })

  return { success: true }
}

export async function getEbsEventsAction() {
  const current = await requireUser()
  if (!canViewEbsEvents(current)) {
    throw new Error("Access Denied: You do not have permission to view EBS events.")
  }

  const events = await db.select().from(pegasusEvent).orderBy(desc(pegasusEvent.receivedAt)).limit(100)
  return events
}
