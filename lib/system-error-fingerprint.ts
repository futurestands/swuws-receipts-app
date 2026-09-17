import { createHash } from "crypto"

const AUTH_NOISE =
  /unauthorized|forbidden|session may have expired|NEXT_NOT_FOUND|NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK/i

export function shouldIgnoreSystemError(message: string) {
  return !message?.trim() || AUTH_NOISE.test(message)
}

export function errorFingerprint(input: {
  message: string
  path?: string | null
  digest?: string | null
}) {
  const message = input.message.trim().replace(/\s+/g, " ").slice(0, 400)
  const path = (input.path || "").split("?")[0]
  const digest = input.digest || ""
  return createHash("sha256").update(`${message}|${path}|${digest}`).digest("hex").slice(0, 32)
}
