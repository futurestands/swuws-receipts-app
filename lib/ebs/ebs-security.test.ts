import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Set env before hoisting mocks
process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"

import { encryptSecret, decryptSecret } from "./crypto"
import { saveEbsConfigAction } from "@/app/actions/ebs-config"
import { POST } from "@/app/api/webhooks/pegasus/route"
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
let mockInsertReturns: Record<string, unknown>[] = [{ id: "inv-1" }]

// Mock DB
vi.mock("@/lib/db", () => ({
  db: {
    execute: mockExecute,
    transaction: vi.fn(async (cb) => cb({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: "cust-1", customerAccount: "600001" }])
          }))
        }))
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
          const secret = encryptSecret("test-webhook-secret")
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

describe("EBS Security Hardening Tests", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    mockActive = true
    mockInsertReturns = [{ id: "inv-1" }]
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

  it("Test 5: URL Validation requires HTTPS in production for active configuration", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    })
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
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

    await expect(saveEbsConfigAction({
      active: true,
      baseUrl: "not-a-url",
      syncCustomers: false,
      syncBills: false,
      pushMeterReadings: false,
      liveBalanceCheck: false
    })).rejects.toThrow(/Invalid Base URL format/)
  })

  it("Test 6: Permission denial blocks unauthorized users from saving configuration", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user",
      role: "FIELD_AGENT",
      roleLevel: 1
    } as unknown as Awaited<ReturnType<typeof requireUser>>)

    await expect(saveEbsConfigAction({
      active: false,
      syncCustomers: false,
      syncBills: false,
      pushMeterReadings: false,
      liveBalanceCheck: false
    })).rejects.toThrow(/Access Denied/)
  })

  it("Test 7: Webhook safely rejects missing authentication signatures", async () => {
    const req = new Request("http://localhost/api/webhooks/pegasus", {
      method: "POST",
      body: JSON.stringify({ providerEventId: "evt-1", accountNumber: "123", amount: 1000 })
    })

    const res = await POST(req)
    expect(res.status).toBe(401)

    const data = await res.json()
    expect(data.error).toBe("Invalid authentication signature")
  })

  it("Test 8: Webhook accepts valid HMAC signature and durably stores event", async () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const body = JSON.stringify({ providerEventId: "evt-test-99", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() })
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
    expect(data.eventId).toBe("evt-test-99")
  })

  it("Test 9: Webhook handles duplicate event idempotently", async () => {
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
    const body = JSON.stringify({ providerEventId: "evt-dup-1", accountNumber: "600001", amount: 5000, paidAt: new Date().toISOString() })
    const secret = "test-webhook-secret"
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex")

    // Simulate onConflictDoNothing returning empty array (already exists)
    mockInsertReturns = []

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
    expect(data.message).toContain("already received")
  })

  it("Test 10: Secret redaction in audit logs", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "test",
      configurable: true,
    })
    process.env.EBS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"
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
