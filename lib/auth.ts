import { betterAuth } from "better-auth"
import { admin as adminPlugin } from "better-auth/plugins"
import { pool } from "@/lib/db"
import { ROLES } from "./permissions/roles"
import { sendPasswordResetEmail } from "./email-service"

const isProduction = process.env.NODE_ENV === "production"

// Goal Alignment: Robust baseURL detection.
// We strictly normalize all origins to include the protocol.
const normalizeOrigin = (url: string | undefined | null) => {
  if (!url) return undefined
  const trimmed = url.trim().replace(/\/$/, "")
  if (!trimmed) return undefined
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
}

const isLocalOrigin = (url: string | undefined) =>
  !!url && (url.includes("localhost") || url.includes("127.0.0.1"))

// Prefer the public app URL first. Capacitor, QR links, and auth must agree
// on one origin — previously auth ignored NEXT_PUBLIC_APP_URL and could fall
// through to "http://localhost:3000" when BETTER_AUTH_URL was unset on Vercel,
// which made the Android WebView appear to "connect to localhost" after login.
const baseURL = normalizeOrigin(
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  process.env.V0_RUNTIME_URL
) || (isProduction ? undefined : "http://localhost:3000")

if (isProduction && (!baseURL || isLocalOrigin(baseURL))) {
  throw new Error(
    `Auth baseURL resolved to an unusable production value (${baseURL ?? "undefined"}). ` +
      "Set BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL to your real https:// domain on Vercel.",
  )
}

// SECURITY: CSRF protection origins.
const explicitTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((url) => normalizeOrigin(url))

// SECURITY: Automatic origin detection.
// We trust the specific deployment URL AND the production project URL.
const dynamicVercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.V0_RUNTIME_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BETTER_AUTH_URL,
].map((url) => normalizeOrigin(url))

const trustedOrigins = Array.from(
  new Set(
    [
      ...explicitTrustedOrigins,
      ...dynamicVercelOrigins,
      // Dev-only. Never leave this as the sole trusted origin in production.
      ...(isProduction ? [] : ["http://localhost:3000"]),
    ].filter((url): url is string => !!url && (!isProduction || !isLocalOrigin(url))),
  ),
)

if (isProduction) {
  console.log(`[AUTH INIT] baseURL: ${baseURL}`)
  console.log(`[AUTH INIT] trustedOrigins: ${trustedOrigins.join(", ")}`)
}

if (isProduction && trustedOrigins.length === 0) {
  // Fail loudly rather than silently running with a weakened CSRF/origin
  // check, which is what happened before (audit finding 9.7).
  throw new Error(
    "No trusted origins configured. Set BETTER_AUTH_TRUSTED_ORIGINS (or deploy on Vercel) before starting in production.",
  )
}

export const auth = betterAuth({
  // DATABASE: Re-use primary connection pool.
  // a second independent connection pool alongside lib/db/index.ts's. Both
  // now share the single pool exported from lib/db, halving the worst-case
  // connection count per serverless invocation. Better Auth accepts a raw
  // node-postgres Pool here exactly as it did before — no behavior change.
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: baseURL!,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, user.name, url)
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: ROLES.PLUMBER,
        input: false,
      },
      active: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
      clusterId: {
        type: "string",
        required: false,
        input: false,
      },
      branchId: {
        type: "string",
        required: false,
        input: false,
      },
      schemeId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [
    // Provides auth.api.setUserPassword(), used by the admin console's
    // "reset agent password" action (app/actions/admin.ts). This was
    // entirely missing before — administrators had no way to reset a
    // locked-out agent's password (audit: Missing Features, Section 8).
    //
    // NOTE: called with defaults deliberately. Semantic permission
    // checks (lib/permissions/index.ts) are what actually gate every
    // action in this app — the plugin here is used only for its
    // setUserPassword API surface, not for its own role/permission system.
    adminPlugin(),
  ],
  // SECURITY: Require secure cookies on production hosts.
  // prevents session cookies from being stored. In development, we allow
  // insecure cookies unless the developer has specifically configured a local
  // SSL proxy (not detected here).
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
})
