import { afterEach, describe, expect, it, vi } from "vitest"
import {
  infobipBaseUrl,
  providerCredentialsReady,
  sendWithProvider,
  twilioMessageParams,
} from "./sms-providers"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("providerCredentialsReady", () => {
  it("requires username + api key for Africa's Talking", () => {
    expect(providerCredentialsReady("africastalking", { active: true, apiKey: "k", username: "swuws" })).toBe(true)
    expect(providerCredentialsReady("africastalking", { active: true, apiKey: "k", username: "" })).toBe(false)
  })

  it("requires Account SID, token, and From for Twilio", () => {
    expect(providerCredentialsReady("twilio", {
      active: true,
      apiKey: "token",
      username: "ACxxxxx",
      senderId: "+256700000001",
    })).toBe(true)
    expect(providerCredentialsReady("twilio", { active: true, apiKey: "token", username: "ACxxxxx" })).toBe(false)
  })

  it("sends Infobip with only an API key", () => {
    expect(providerCredentialsReady("infobip", { active: true, apiKey: "secret" })).toBe(true)
    expect(providerCredentialsReady("infobip", { active: false, apiKey: "secret" })).toBe(false)
  })
})

describe("infobipBaseUrl", () => {
  it("defaults to the public Infobip host", () => {
    expect(infobipBaseUrl()).toBe("https://api.infobip.com")
    expect(infobipBaseUrl("")).toBe("https://api.infobip.com")
  })

  it("accepts a portal base host or a short subdomain", () => {
    expect(infobipBaseUrl("jjxx.api.infobip.com")).toBe("https://jjxx.api.infobip.com")
    expect(infobipBaseUrl("https://jjxx.api.infobip.com/")).toBe("https://jjxx.api.infobip.com")
    expect(infobipBaseUrl("jjxx")).toBe("https://jjxx.api.infobip.com")
  })
})

describe("twilioMessageParams", () => {
  it("uses From for a phone number and MessagingServiceSid for MG…", () => {
    expect(twilioMessageParams("+256782122100", "hello", "+256700111222").get("From")).toBe("+256700111222")
    expect(twilioMessageParams("+256782122100", "hello", "MGabc").get("MessagingServiceSid")).toBe("MGabc")
  })
})

describe("sendWithProvider", () => {
  it("posts Twilio with Basic auth and captures the SID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: "SMabc" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await sendWithProvider(
      { provider: "twilio", apiKey: "token", username: "ACacct", senderId: "+256700111222" },
      "+256782122100",
      "Pay at the office",
    )

    expect(result).toEqual({ ok: true, messageId: "SMabc" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACacct/Messages.json")
    expect(init.headers.Authorization).toMatch(/^Basic /)
    expect(init.body.get("To")).toBe("+256782122100")
    expect(init.body.get("From")).toBe("+256700111222")
  })

  it("posts Infobip with App auth even when username is blank", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ messageId: "ib-1", status: { groupName: "PENDING" } }] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await sendWithProvider(
      { provider: "infobip", apiKey: "ib-key", username: "" },
      "+256782122100",
      "Pay at the office",
    )

    expect(result).toEqual({ ok: true, messageId: "ib-1" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.infobip.com/sms/2/text/advanced")
    expect(init.headers.Authorization).toBe("App ib-key")
  })
})
