import { describe, expect, it } from "vitest"
import { isSendablePhone, normalizePhone, normalizeSendablePhone } from "./phone"

describe("normalizeSendablePhone", () => {
  it("accepts Uganda 07 and 03 ten-digit locals", () => {
    expect(normalizeSendablePhone("0782122100")).toBe("+256782122100")
    expect(normalizeSendablePhone("0391234567")).toBe("+256391234567")
    expect(normalizeSendablePhone("0782 122 100")).toBe("+256782122100")
    expect(normalizeSendablePhone("+256782122100")).toBe("+256782122100")
    expect(normalizeSendablePhone("256782122100")).toBe("+256782122100")
  })

  it("rejects the no-phone placeholder 0700000000", () => {
    expect(normalizeSendablePhone("0700000000")).toBeNull()
    expect(normalizeSendablePhone("0700 000 000")).toBeNull()
    expect(normalizeSendablePhone("+256700000000")).toBeNull()
    expect(normalizeSendablePhone("256700000000")).toBeNull()
    expect(normalizeSendablePhone("0300000000")).toBeNull()
  })

  it("rejects numbers that are not 07 or 03", () => {
    expect(normalizeSendablePhone("0414123456")).toBeNull()
    expect(normalizeSendablePhone("0812345678")).toBeNull()
    expect(normalizeSendablePhone("+255712345678")).toBeNull()
    expect(normalizeSendablePhone("12345")).toBeNull()
    expect(isSendablePhone("0700000000")).toBe(false)
  })

  it("still parses the placeholder to E.164 without marking it sendable", () => {
    expect(normalizePhone("0700000000")).toBe("+256700000000")
  })
})
