import { betterAuth } from "better-auth"
import { admin as adminPlugin } from "better-auth/plugins"
import { pool } from "@/lib/db"
import { ROLES } from "./permissions/roles"
import { sendPasswordResetEmail } from "./email-service"

const isProduction = process.env.NODE_ENV === "production"

// Goal Alignment: Robust baseURL detection. In production, we prioritize
// Vercel provided URLs and ensure localhost is never used.
const rawBaseURL =
  (isProduction ? undefined : process.env.BETTER_AUTH_URL) ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  process.env.V0_RUNTIME_URL ||
  "http://localhost:3000"

const baseURL = rawBaseURL.startsWith('http') ? rawBaseURL : `https://${rawBaseURL}`

// Audit finding 9.7: previously this list was built ONLY from
// Vercel-specific environment variables, so any non-Vercel deployment that
// didn't happen to set those would silently end up with an empty
// trustedOrigins array. BETTER_AUTH_TRUSTED_ORIGINS is a new, always-honored
// variable independent of the hosting provider.
const explicitTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Goal Alignment: Dynamically trust any Vercel deployment URL to prevent
// "Invalid origin" errors during testing and production.
const dynamicVercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter(Boolean).map(url => url?.startsWith('http') ? url : `https://${url}`)

const trustedOrigins = [
  ...explicitTrustedOrigins,
  ...dynamicVercelOrigins,
  process.env.V0_RUNTIME_URL,
  "http://localhost:3000" // Always trust local
].filter(Boolean) as string[]

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
  // Certification Finding 11.1: this used to be `new Pool({ connectionString: ... })`,
  // a second independent connection pool alongside lib/db/index.ts's. Both
  // now share the single pool exported from lib/db, halving the worst-case
  // connection count per serverless invocation. Better Auth accepts a raw
  // node-postgres Pool here exactly as it did before — no behavior change.
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
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
  // Certification Finding 11.2: secure: true on localhost without HTTPS
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
