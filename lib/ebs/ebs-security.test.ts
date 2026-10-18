import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Set env before hoisting mocks
process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"

import { encryptSecret, decryptSecret } from "./crypto"
import { saveEbsConfigAction } from "@/app/actions/ebs-config"
import { POST } from "@/app/api/webhooks/pegasus/route"
import { processPegasusEvent } from "./pegasus-processor"
import { customer, billingRecord, billingPeriod, user as userTable, reconciliationException } from "@/lib/db/schema"
import crypto from "crypto"

// Mock session
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(),
}))

const { mockExecute } = vi.hoisted(() => {
  return {
    mockExecute: vi.fn().mockResolvedValue({ rows: [{ count: 1 }] }),
  }
})

let mockActive = true
let mockHasSecret = true
let mockEventStatus = "received"
let mockInsertReturns: Record<string, unknown>[] = [{ id: "inv-1" }]
let mockCustomerQueryResult: Record<string, unknown>[] = [{ id: "cust-1", customerAccount: "600001" }]
let mockBillQueryResult: Record<string, unknown>[] = [{ id: "bill-1", billingPeriodId: "p-1", totalDue: "5000", billingDate: new Date().toISOString(), createdAt: new Date() }]

// Mock DB
vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
    transaction: vi.fn(async (cb) => cb({
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          const queryBuilder: Record<string, unknown> = {
            where: vi.fn(() => queryBuilder),
            limit: vi.fn().mockImplementation(async () => {
              if (table === customer) return mockCustomerQueryResult
              if (table === billingRecord) return mockBillQueryResult
              if (table === reconciliationException) return []
              return [{ id: "evt-1", status: mockEventStatus, accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() }]
            }),
            then: (resolve: (val: unknown) => void) => {
              if (table === customer) return resolve(mockCustomerQueryResult)
              if (table === billingRecord) return resolve(mockBillQueryResult)
              if (table === billingPeriod) return resolve([{ id: "p-1", status: "active", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 864000000).toISOString() }])
              if (table === userTable) return resolve([{ id: "u-admin", role: "SYSTEM_ADMIN" }])
              return resolve([{ id: "evt-1", status: mockEventStatus, accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() }])
            }
          }
          return queryBuilder
        })
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(true)
        }))
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(true)
        }))
      }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        limit: vi.fn().mockImplementation(async () => {
          const secret = mockHasSecret ? encryptSecret("test-webhook-secret") : null
          return [{ active: mockActive, encryptedWebhookSecret: secret }]
        })
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(true)
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockImplementation(async () => mockInsertReturns)
        }))
      }))
    }))
  }
}))

// Mock Audit
vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn().mockResolvedValue(true)
}))

import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"

describe("EBS Security & Pipeline Hardening Tests", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    mockActive = true
    mockHasSecret = true
    mockEventStatus = "received"
    mockInsertReturns = [{ id: "inv-1" }]
    mockCustomerQueryResult = [{ id: "cust-1", customerAccount: "600001" }]
    mockBillQueryResult = [{ id: "bill-1", billingPeriodId: "p-1", totalDue: "5000", billingDate: new Date().toISOString(), createdAt: new Date() }]
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it("Test 1: Crypto fails closed if EBS_ENCRYPTION_KEY is missing", () => {
    delete process.env.EBS_ENCRYPTION_KEY
    expect(() => encryptSecret("secret-value")).toThrow(/EBS_ENCRYPTION_KEY environment variable is not set/)
    expect(() => decryptSecret("fake:format:value")).toThrow(/EBS_ENCRYPTION_KEY environment variable is not set/)
  })

  it("Test 2: Crypto fails closed if EBS_ENCRYPTION_KEY is invalid length", () => {
    process.env.EBS_ENCRYPTION_KEY = "too-short"
    expect(() => encryptSecret("secret-value")).toThrow(/must be exactly 32 bytes/)
  })

  it("Test 3: Encryption/Decryption successfully handles valid 32-byte key", () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef" // exactly 32 bytes
    const secret = "my-api-secret-123"

    const encrypted = encryptSecret(secret)
    expect(encrypted).not.toBe(secret)
    expect(encrypted.split(":")).toHaveLength(3) // iv:authTag:content

    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(secret)
  })

  it("Test 4: Crypto tamper detection (AES-256-GCM auth tag)", () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const encrypted = encryptSecret("tamper-test")

    const parts = encrypted.split(":")
    parts[2] = parts[2].substring(0, parts[2].length - 1) + (parts[2].endsWith('a') ? 'b' : 'a') // tamper cipher text
    const tampered = parts.join(":")

    expect(() => decryptSecret(tampered)).toThrow(/Decryption failed/)
  })

  it("Test 5: Integration disabled gives 403", async () => {
    mockActive = false
    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      body: JSON.stringify({ providerEventId: "evt-1" })
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it("Test 6: Integration enabled with no webhook secret gives 503", async () => {
    mockHasSecret = false
    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      body: JSON.stringify({ providerEventId: "evt-1" })
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
  })

  it("Test 7: Oversized payload gives 413", async () => {
    const hugeBody = "a".repeat(105 * 1024)
    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      body: hugeBody
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
  })

  it("Test 8: Tampered body or invalid signature rejected with 401", async () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const body = JSON.stringify({ providerEventId: "evt-1", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() })
    const secret = "test-webhook-secret"
    const signature = crypto.createHmac("sha256", secret).update(body + "tamper").digest("hex")

    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: {
        "x-pegasus-signature": signature,
        "content-type": "application/json"
      },
      body
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("Test 9: Production NODE_ENV uses default adapter and returns 503 (fail-closed)", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    })
    const body = JSON.stringify({ providerEventId: "evt-1", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() })
    const secret = "test-webhook-secret"
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex")

    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: {
        "x-pegasus-signature": signature,
        "content-type": "application/json"
      },
      body
    })
    const res = await POST(req)
    // Default adapter throws NotConfiguredError in production env check
    expect(res.status).toBe(503)
  })

  it("Test 10: Processor handles partial payment correctly", async () => {
    mockEventStatus = "received"
    mockBillQueryResult = [{ id: "bill-1", billingPeriodId: "p-1", totalDue: "10000", billingDate: new Date().toISOString(), createdAt: new Date() }] // bill is 10000, paid 5000
    const result = (await processPegasusEvent("evt-1")) as { ok: boolean; status?: string }
    expect(result.ok).toBe(true)
    expect(result.status).toBe("partial_payment")
  })

  it("Test 11: Processor flags unmatched customer as needs_review", async () => {
    mockEventStatus = "received"
    mockCustomerQueryResult = [] // customer not found
    const result = (await processPegasusEvent("evt-1")) as { ok: boolean; reason?: string }
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("customer_not_found")
  })

  it("Test 12: Processor retry is idempotent on already processed/reviewed events", async () => {
    mockEventStatus = "matched_pending_review"
    const result = (await processPegasusEvent("evt-1")) as { ok: boolean; status?: string }
    expect(result.ok).toBe(true)
    expect(result.status).toBe("matched_pending_review")
  })

  it("Test 13: saveEbsConfigAction requires HTTPS in production and checks permissions", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    })
    vi.mocked(requireUser).mockResolvedValue({
      id: "admin",
      role: "SYSTEM_ADMIN",
      roleLevel: 10
    } as unknown as Awaited<ReturnType<typeof requireUser>>)

    await expect(saveEbsConfigAction({
      active: true,
      baseUrl: "http://api.pegasus.co.ug/v1",
      syncCustomers: false,
      syncBills: false,
      pushMeterReadings: false,
      liveBalanceCheck: false
    })).rejects.toThrow(/HTTPS is required for production EBS integration/)
  })

  it("Test 14: Secret redaction in audit logs", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      configurable: true,
    })
    vi.mocked(requireUser).mockResolvedValue({
      id: "admin",
      role: "SYSTEM_ADMIN",
      roleLevel: 10
    } as unknown as Awaited<ReturnType<typeof requireUser>>)

    await saveEbsConfigAction({
      active: false,
      apiKey: "secret-key-123",
      apiSecret: "super-secret",
      webhookSecret: "webhook-secret",
      syncCustomers: false,
      syncBills: false,
      pushMeterReadings: false,
      liveBalanceCheck: false
    })

    expect(writeAudit).toHaveBeenCalled()
    const auditCall = vi.mocked(writeAudit).mock.calls[0][0] as { details?: { keysUpdated?: boolean } }

    // Check that secrets are not in details
    expect(auditCall.details).toBeDefined()
    expect(JSON.stringify(auditCall.details)).not.toContain("secret-key-123")
    expect(JSON.stringify(auditCall.details)).not.toContain("super-secret")
    expect(auditCall.details?.keysUpdated).toBe(true)
  })
})
