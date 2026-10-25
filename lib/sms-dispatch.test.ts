import { describe, expect, it, vi } from "vitest"
import { dispatchClaimedSms } from "./sms-dispatch"

describe("claimed SMS dispatch", () => {
  it("sends once when two workers attempt to claim one queued record", async () => {
    let status = "queued"
    const send = vi.fn(async () => ({ delivered: true, gatewayRef: "provider-1" }))
    const io = {
      claim: async () => { if (status !== "queued") return false; status = "processing"; return true },
      send,
      finish: async (next: string) => { status = next },
    }
    expect(await Promise.all([dispatchClaimedSms(io), dispatchClaimedSms(io)])).toEqual(["sent", "skipped"])
    expect(send).toHaveBeenCalledTimes(1)
    expect(status).toBe("sent")
  })
  it("holds ambiguous provider errors for review", async () => {
    const finish = vi.fn<(status: string, error: string | null, externalRef?: string) => Promise<void>>().mockResolvedValue(undefined)
    expect(await dispatchClaimedSms({ claim: async () => true, send: async () => ({ delivered: false, reason: "gateway_error", error: "timeout" }), finish })).toBe("unknown")
    expect(finish).toHaveBeenCalledWith("unknown", "timeout")
  })
  it("does not report a known configuration failure as delivered", async () => {
    const finish = vi.fn<(status: string, error: string | null, externalRef?: string) => Promise<void>>().mockResolvedValue(undefined)
    expect(await dispatchClaimedSms({ claim: async () => true, send: async () => ({ delivered: false, reason: "not_configured" }), finish })).toBe("failed")
  })
  it("does not make a second carrier call when the post-send database write fails", async () => {
    const send = vi.fn(async () => ({ delivered: true }))
    const finish = vi.fn<(status: string, error: string | null, externalRef?: string) => Promise<void>>().mockResolvedValue(undefined).mockRejectedValueOnce(new Error("database lost"))
    expect(await dispatchClaimedSms({ claim: async () => true, send, finish })).toBe("unknown")
    expect(send).toHaveBeenCalledTimes(1)
    expect(finish.mock.calls[1][0]).toBe("unknown")
  })
})
