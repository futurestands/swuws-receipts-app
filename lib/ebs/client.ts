import { db } from "@/lib/db"
import { ebsGatewayConfig } from "@/lib/db/schema"
import { decryptSecret } from "./crypto"

/**
 * Standardized responses for the Hybrid Integration Architecture.
 * This prevents fake values and clearly signals the feature's status.
 */
export type EbsIntegrationStatus =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"

export interface EbsResponse<T> {
  status: EbsIntegrationStatus
  data?: T
  error?: string
}

/**
 * Validates whether the integration is globally active and configured.
 */
async function getActiveConfig() {
  const [config] = await db.select().from(ebsGatewayConfig).limit(1)
  if (!config || !config.active) {
    return { active: false, config: null }
  }
  return { active: true, config }
}

/**
 * EBS Integration Foundation (Phase 1)
 *
 * Provides safe stubs that respect the feature flags in ebs_gateway_config.
 * When disabled (default), returns "DISABLED" to allow the system to fall back
 * to existing manual Excel/CSV workflows without interruption.
 */
export const ebsClient = {

  /**
   * Fetch a customer's live balance directly from Pegasus.
   */
  async fetchLiveCustomerBalance(accountNumber: string): Promise<EbsResponse<{ balance: number; arrears: number }>> {
    const { active, config } = await getActiveConfig()
    if (!active || !config?.liveBalanceCheck) {
      return { status: "DISABLED" }
    }

    // Phase 1: Real API calls are not implemented yet pending vendor documentation.
    return { status: "NOT_IMPLEMENTED", error: "Pegasus API documentation pending." }
  },

  /**
   * Push a fresh meter reading directly to Pegasus for real-time billing approval.
   */
  async pushMeterReading(readingData: { accountNumber: string; reading: number; date: Date }): Promise<EbsResponse<any>> {
    const { active, config } = await getActiveConfig()
    if (!active || !config?.pushMeterReadings) {
      return { status: "DISABLED" }
    }

    // Phase 1: Real API calls are not implemented yet pending vendor documentation.
    return { status: "NOT_IMPLEMENTED", error: "Pegasus API documentation pending." }
  },

  /**
   * Background job: Sync new customers from Pegasus.
   */
  async syncNewCustomers(): Promise<EbsResponse<any>> {
    const { active, config } = await getActiveConfig()
    if (!active || !config?.syncCustomers) {
      return { status: "DISABLED" }
    }

    // Phase 1: Real API calls are not implemented yet pending vendor documentation.
    return { status: "NOT_IMPLEMENTED", error: "Pegasus API documentation pending." }
  },

  /**
   * Background job: Sync new monthly bills from Pegasus.
   */
  async syncBills(): Promise<EbsResponse<any>> {
    const { active, config } = await getActiveConfig()
    if (!active || !config?.syncBills) {
      return { status: "DISABLED" }
    }

    // Phase 1: Real API calls are not implemented yet pending vendor documentation.
    return { status: "NOT_IMPLEMENTED", error: "Pegasus API documentation pending." }
  }
}
