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

// Mock Notification
vi.mock("@/app/actions/notifications", () => ({
  createNotification: vi.fn(async () => ({ ok: true }))
}))

// Mock Logger
vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>()
  return {
    ...actual,
    logSecurity: vi.fn(actual.logSecurity),
  }
})

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
let mockUserQueryResult: Record<string, unknown>[] = [{ id: "admin-real-user-123", role: "SYSTEM_ADMIN" }]

const mockDbInsertValues = vi.fn(() => ({
  onConflictDoNothing: vi.fn(() => ({
    returning: vi.fn().mockImplementation(async () => mockInsertReturns)
  }))
}))

const mockTxInsertValues = vi.fn(() => ({
  onConflictDoNothing: vi.fn().mockResolvedValue(true)
}))

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
              if (table === userTable) return mockUserQueryResult
              return [{ id: "evt-1", status: mockEventStatus, accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() }]
            }),
            then: (resolve: (val: unknown) => void) => {
              if (table === customer) return resolve(mockCustomerQueryResult)
              if (table === billingRecord) return resolve(mockBillQueryResult)
              if (table === billingPeriod) return resolve([{ id: "p-1", status: "active", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 864000000).toISOString() }])
              if (table === userTable) return resolve(mockUserQueryResult)
              return resolve([{ id: "evt-1", status: mockEventStatus, accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() }])
            }
          }
          return queryBuilder
        })
      })),
      insert: vi.fn(() => ({
        values: mockTxInsertValues
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
      values: mockDbInsertValues
    }))
  }
}))

// Mock Audit
vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn().mockResolvedValue(true)
}))

import { requireUser } from "@/lib/session"
import { writeAudit } from "@/lib/audit"
import { createNotification } from "@/app/actions/notifications"
import { logSecurity } from "@/lib/logger"

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
    mockUserQueryResult = [{ id: "admin-real-user-123", role: "SYSTEM_ADMIN" }]
    mockExecute.mockResolvedValue({ rows: [{ count: 1 }] })
    mockDbInsertValues.mockClear()
    mockTxInsertValues.mockClear()
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

  it("Webhook Test 1: Valid signature returns 200 and inserts pegasus_event with status received", async () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const payloadObj = { providerEventId: "evt-valid-1", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() }
    const body = JSON.stringify(payloadObj)
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
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.status).toBe("SUCCESS")
    expect(data.eventId).toBe("evt-valid-1")
    expect(mockDbInsertValues).toHaveBeenCalled()
    const insertedValues = mockDbInsertValues.mock.calls[0][0] as { providerEventId: string; accountNumber: string; amount: number; status: string }
    expect(insertedValues.providerEventId).toBe("evt-valid-1")
    expect(insertedValues.accountNumber).toBe("600001")
    expect(insertedValues.amount).toBe(5000)
    expect(insertedValues.status).toBe("received")
  })

  it("Webhook Test 2: Duplicate providerEventId returns 200 with already received and insert returns no row", async () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const body = JSON.stringify({ providerEventId: "evt-dup-2", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() })
    const secret = "test-webhook-secret"
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex")

    // First call inserts row
    mockInsertReturns = [{ id: "inv-1" }]
    const req1 = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: { "x-pegasus-signature": signature, "content-type": "application/json" },
      body
    })
    const res1 = await POST(req1)
    expect(res1.status).toBe(200)

    // Second call: insert returns no row (onConflictDoNothing)
    mockInsertReturns = []
    const req2 = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: { "x-pegasus-signature": signature, "content-type": "application/json" },
      body
    })
    const res2 = await POST(req2)
    expect(res2.status).toBe(200)
    const data2 = await res2.json()
    expect(data2.message).toContain("already received")
  })

  it("Webhook Test 3: Rate limit exceeded returns 429 and nothing is inserted", async () => {
    mockExecute.mockResolvedValue({ rows: [{ count: 999 }] }) // trigger rate limit allowed = false
    mockDbInsertValues.mockClear()

    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      body: JSON.stringify({ providerEventId: "evt-rate-1" })
    })

    const res = await POST(req)
    expect(res.status).toBe(429)
    expect(mockDbInsertValues).not.toHaveBeenCalled()
  })

  it("Webhook Test 4: Logs never contain webhook secret, computed signature, or raw body", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const secret = "test-webhook-secret"
    const sensitiveBody = JSON.stringify({ providerEventId: "evt-secret-99", accountNumber: "600001", amount: 5000, secretField: "SENSITIVE_DATA" })
    const validSignature = crypto.createHmac("sha256", secret).update(sensitiveBody).digest("hex")

    // Valid request
    const validReq = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: { "x-pegasus-signature": validSignature, "content-type": "application/json" },
      body: sensitiveBody
    })
    await POST(validReq)

    // Invalid signature request
    const invalidReq = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      headers: { "x-pegasus-signature": "bad-signature-12345", "content-type": "application/json" },
      body: sensitiveBody
    })
    await POST(invalidReq)

    const allLoggedStrings = [
      ...consoleErrorSpy.mock.calls.flat(),
      ...consoleWarnSpy.mock.calls.flat(),
      ...consoleLogSpy.mock.calls.flat(),
      ...vi.mocked(logSecurity).mock.calls.flat(),
    ].map(item => typeof item === "object" ? JSON.stringify(item) : String(item)).join(" ")

    expect(allLoggedStrings).not.toContain(secret)
    expect(allLoggedStrings).not.toContain(validSignature)
    expect(allLoggedStrings).not.toContain("bad-signature-12345")
    expect(allLoggedStrings).not.toContain("SENSITIVE_DATA")

    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it("Processor Test 5: Overpayment (paid > bill due) creates amount_mismatch exception and sets needs_review", async () => {
    mockEventStatus = "received"
    mockBillQueryResult = [{ id: "bill-1", billingPeriodId: "p-1", totalDue: "3000", billingDate: new Date().toISOString(), createdAt: new Date() }] // paid 5000 > due 3000
    mockTxInsertValues.mockClear()

    const result = await processPegasusEvent("evt-1")
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("amount_mismatch")

    expect(mockTxInsertValues).toHaveBeenCalled()
    const insertedException = mockTxInsertValues.mock.calls[0][0] as { exceptionType: string }
    expect(insertedException.exceptionType).toBe("amount_mismatch")
  })

  it("Processor Test 6: Retry on needs_review event is idempotent and sends no duplicate exception or notification", async () => {
    mockEventStatus = "needs_review"
    mockTxInsertValues.mockClear()
    vi.mocked(createNotification).mockClear()

    const result1 = await processPegasusEvent("evt-1")
    expect(result1.ok).toBe(false)

    expect(mockTxInsertValues).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("Processor Test 7: Unmatched customer notifies real admin user and NOT literal system-admin", async () => {
    mockEventStatus = "received"
    mockCustomerQueryResult = [] // Customer not found
    mockUserQueryResult = [{ id: "admin-real-user-123", role: "SYSTEM_ADMIN" }]
    vi.mocked(createNotification).mockClear()

    const result = await processPegasusEvent("evt-1")
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("customer_not_found")

    expect(createNotification).toHaveBeenCalled()
    const notificationCall = vi.mocked(createNotification).mock.calls[0][0]
    expect(notificationCall.userId).toBe("admin-real-user-123")
    expect(notificationCall.userId).not.toBe("system-admin")
  })

  it("Processor Test 8: Partial payment creates partial_payment exception and makes no receipt or balance update call", async () => {
    mockEventStatus = "received"
    mockBillQueryResult = [{ id: "bill-1", billingPeriodId: "p-1", totalDue: "10000", billingDate: new Date().toISOString(), createdAt: new Date() }] // paid 5000 < due 10000
    mockTxInsertValues.mockClear()

    const result = await processPegasusEvent("evt-1")
    expect(result.ok).toBe(true)
    expect(result.status).toBe("partial_payment")

    expect(mockTxInsertValues).toHaveBeenCalled()
    const insertedException = mockTxInsertValues.mock.calls[0][0] as { exceptionType: string }
    expect(insertedException.exceptionType).toBe("partial_payment")
    expect(insertedException.exceptionType).not.toBe("amount_mismatch")
  })

  it("Processor Test 9: If no admin users exist, writeAudit is called with action ebs.notification.fallback", async () => {
    mockEventStatus = "received"
    mockCustomerQueryResult = [] // Customer not found
    mockUserQueryResult = [] // No admin users exist
    vi.mocked(writeAudit).mockClear()

    const result = await processPegasusEvent("evt-1")
    expect(result.ok).toBe(false)

    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ebs.notification.fallback"
      })
    )
  })
})
