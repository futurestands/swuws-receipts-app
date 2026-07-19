import "server-only"
import { headers } from "next/headers"

/**
 * Used only for building absolute, human/QR-shareable links (currently:
 * the receipt verification QR code). Not used by auth — lib/auth.ts has
 * its own baseURL resolution and is untouched by this helper.
 */
export async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL
  if (envUrl) return envUrl.replace(/\/$/, "")

  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")
  return `${proto}://${host}`
}
