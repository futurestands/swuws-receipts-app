import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const PUBLIC_PATHS = ["/login", "/verify"]

/**
 * Global Middleware
 */

// This CSP was moved here from next.config.mjs's headers() config (which
// still handles the other security headers: X-Frame-Options, HSTS, etc).
// It was briefly widened to allow 'unsafe-eval'/'unsafe-inline' plus
// blanket https:/http: fallbacks on script-src, connect-src, img-src,
// font-src, and media-src — those wildcards defeat most of what a CSP is
// for, since they let a successful XSS load or call out to literally any
// HTTPS endpoint. Restored to the original, narrower policy: 'unsafe-eval'
// and 'unsafe-inline' are kept only where they were before (Next.js/
// Tailwind need them for hydration and injected styles), with no https:/
// http: wildcards.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.vercel-storage.com https://*.supabase.co https://*.googleusercontent.com",
  "font-src 'self'",
  "media-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ")

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Skip middleware for static assets
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // 2. Auth checks
  const sessionCookie = getSessionCookie(request)
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/api/auth")

  if (!sessionCookie && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    const res = NextResponse.redirect(url)
    res.headers.set("Content-Security-Policy", CSP)
    return res
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = sessionCookie ? "/dashboard" : "/login"
    const res = NextResponse.redirect(url)
    res.headers.set("Content-Security-Policy", CSP)
    return res
  }

  const response = NextResponse.next()
  response.headers.set("Content-Security-Policy", CSP)
  return response
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
}
