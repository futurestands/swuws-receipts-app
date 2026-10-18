/**
 * Pegasus EBS Adapter Boundary (Phase 1 / Phase 2)
 *
 * Encapsulates all vendor-specific parsing, signature verification, and event mapping.
 * Until official Pegasus API documentation is provided, default methods throw NotConfiguredError.
 * A test-only fake adapter is provided for end-to-end pipeline testing.
 */

export interface NormalizedPaymentEvent {
  providerEventId: string
  accountNumber: string
  amount: number // Integer UGX (positive integer)
  paidAt: Date
  channel?: string
  providerReference?: string
  rawPayload: Record<string, unknown>
}

export class NotConfiguredError extends Error {
  constructor(message = "Pegasus adapter is not configured or vendor documentation is pending.") {
    super(message)
    this.name = "NotConfiguredError"
  }
}

export class ParseError extends Error {
  constructor(message = "Failed to parse Pegasus payment event payload.") {
    super(message)
    this.name = "ParseError"
  }
}

export interface PegasusAdapter {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean
  parsePaymentEvent(rawBody: string): NormalizedPaymentEvent
  mapEventId(event: NormalizedPaymentEvent): string
}

/**
 * Default production adapter.
 * TODO: Replace with official Pegasus HMAC signature verification when vendor docs arrive.
 * TODO: Replace with official Pegasus JSON/XML payload schema when vendor docs arrive.
 */
export const defaultPegasusAdapter: PegasusAdapter = {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    void rawBody
    void headers
    void secret
    // TODO: Implement official Pegasus signature validation algorithm (e.g. HMAC-SHA256)
    throw new NotConfiguredError("Pegasus signature verification is not configured.")
  },

  parsePaymentEvent(rawBody: string): NormalizedPaymentEvent {
    void rawBody
    // TODO: Parse official Pegasus payment payload structure
    throw new ParseError("Pegasus payment parser is not configured pending vendor documentation.")
  },

  mapEventId(event: NormalizedPaymentEvent): string {
    return event.providerEventId
  }
}

/**
 * Test-only fake adapter for robust pipeline and webhook hardening tests.
 * Computes a standard HMAC-SHA256 hex digest for verification.
 */
import crypto from "crypto"

export const fakePegasusAdapter: PegasusAdapter = {
  verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
    const signature = headers.get("x-pegasus-signature") || headers.get("authorization")
    if (!signature || !secret) return false

    const hmac = crypto.createHmac("sha256", secret)
    const digest = hmac.update(rawBody).digest("hex")

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
    } catch {
      return false
    }
  },

  parsePaymentEvent(rawBody: string): NormalizedPaymentEvent {
    try {
      const json = JSON.parse(rawBody)
      if (!json.providerEventId || !json.accountNumber || typeof json.amount !== "number") {
        throw new ParseError("Missing required fields in fake payment event.")
      }

      const amountVal = Number(json.amount)
      if (!Number.isInteger(amountVal) || amountVal <= 0) {
        throw new ParseError("Amount must be a positive integer in UGX.")
      }

      let paidAtDate = new Date()
      if (json.paidAt) {
        const parsed = new Date(json.paidAt)
        if (!isNaN(parsed.getTime())) {
          paidAtDate = parsed
        }
      }

      return {
        providerEventId: String(json.providerEventId),
        accountNumber: String(json.accountNumber),
        amount: amountVal,
        paidAt: paidAtDate,
        channel: json.channel ? String(json.channel) : "MOBILE_MONEY",
        providerReference: json.providerReference ? String(json.providerReference) : undefined,
        rawPayload: json,
      }
    } catch (err: unknown) {
      if (err instanceof ParseError) throw err
      const msg = err instanceof Error ? err.message : "Unknown parse error"
      throw new ParseError(msg)
    }
  },

  mapEventId(event: NormalizedPaymentEvent): string {
    return event.providerEventId
  }
}
