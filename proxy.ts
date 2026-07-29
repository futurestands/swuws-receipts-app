import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const PUBLIC_PATHS = ["/login", "/verify"]

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development"
  // Certification item 5. script-src uses a per-request nonce rather than
  // 'unsafe-inline', following Next.js's documented CSP pattern.
  // In development, 'unsafe-eval' is required for debugging features.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`

  const connectSrc = isDev ? `connect-src 'self' ws: wss:` : `connect-src 'self'`

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    connectSrc,
    `media-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ")
}

/**
 * Builds the nonce + CSP once per request and attaches it both ways:
 * - on the outgoing request headers, so Next.js's renderer can read it
 *   (via headers() in a Server Component) and applies it automatically to
 *   its own injected hydration/RSC scripts;
 * - on the response headers, so the browser actually enforces the policy.
 * This mirrors Next.js's own documented CSP-with-nonce middleware recipe.
 */
function withCsp(request: NextRequest, build: (requestHeaders: Headers) => NextResponse) {
  const nonce = crypto.randomUUID()
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = build(requestHeaders)
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return withCsp(request, (headers) => NextResponse.next({ request: { headers } }))
  }

  // Cheap, cookie-presence-only check. This is NOT a substitute for the
  // requireUser()/requireAdmin() checks in every server action (which
  // re-verify against the database, including the `active` flag) — it just
  // avoids rendering protected pages for obviously signed-out visitors.
  const sessionCookie = getSessionCookie(request)

  if (!sessionCookie && pathname !== "/") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return withCsp(request, () => NextResponse.redirect(url))
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = sessionCookie ? "/dashboard" : "/login"
    return withCsp(request, () => NextResponse.redirect(url))
  }

  return withCsp(request, (headers) => NextResponse.next({ request: { headers } }))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
}
