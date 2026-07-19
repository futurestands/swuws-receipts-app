import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

const { GET, POST: originalPost } = toNextJsHandler(auth.handler)

export { GET }

/**
 * Certification Finding 6.3: no brute-force protection existed anywhere.
 * Only the sign-in endpoint is throttled here — that's the one a
 * credential-stuffing/brute-force attempt actually needs, and every other
 * Better Auth endpoint (sign-up, session refresh, etc.) is passed straight
 * through to the original handler, unmodified.
 */
export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname.includes("/sign-in")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    const rate = await checkRateLimit(`login:${ip}`, 10, 60)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a minute and try again." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      )
    }
  }
  return originalPost(request)
}
