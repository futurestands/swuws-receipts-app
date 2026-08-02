import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const PUBLIC_PATHS = ["/login", "/verify"]

/**
 * Global Middleware
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https: http:",
  "style-src 'self' 'unsafe-inline' https: http:",
  "img-src 'self' blob: data: https: http:",
  "font-src 'self' https: http: data:",
  "connect-src 'self' ws: wss: https: http:",
  "media-src 'self' data: https: http:",
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
