import "server-only"
import { db } from "./db"
import { managedTemplate, templateVersion } from "./db/schema"
import { eq } from "drizzle-orm"
import { renderTemplate } from "./templates/template-engine"

/**
 * ENTERPRISE EMAIL SERVICE
 *
 * Integrated with the Template Hub to allow admin-adjustable email layouts.
 */

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

async function sendRawEmail(options: EmailOptions) {
  const apiKey = process.env.RESEND_API_KEY
  const hasKey = !!apiKey && apiKey !== "re-place-with-real-key"

  // Always log to console for local visibility/debugging.
  console.log("-----------------------------------------")
  console.log(`[EMAIL SERVICE] Sending to: ${options.to}`)
  console.log(`[EMAIL SERVICE] Subject: ${options.subject}`)
  console.log(`[EMAIL SERVICE] Content Preview: ${options.html.substring(0, 100)}...`)
  console.log("-----------------------------------------")

  if (!hasKey) {
    // Fail loudly rather than silently pretending to have sent an email.
    // Previously this returned { ok: true } unconditionally, so an unset
    // RESEND_API_KEY meant password-reset (and any other transactional)
    // emails were logged to server console only, while the UI told the
    // user "Check your email" every time. In development this is fine —
    // the console log above is the intended behavior — but in production
    // it must surface as a real error so it gets noticed and fixed instead
    // of silently failing every reset request.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Email delivery is not configured: RESEND_API_KEY is missing. Set a real Resend API key in the production environment.",
      )
    }
    return { ok: true, simulated: true }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_ADDRESS || "SWUWS Portal <noreply@receipts.swuws.org>",
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    console.error("[EMAIL SERVICE] Resend API Error:", error)
    // Surface the failure instead of swallowing it — a caller (e.g. the
    // forgot-password flow) needs to know the send genuinely failed so it
    // can show an error instead of a false "Check your email" success.
    throw new Error(`Email delivery failed: ${error?.message || res.statusText}`)
  }

  return { ok: true }
}

async function getTemplate(code: string) {
  const [temp] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, code)).limit(1)
  if (!temp?.activeVersionId) return null

  const [version] = await db.select().from(templateVersion).where(eq(templateVersion.id, temp.activeVersionId)).limit(1)
  return version?.content || null
}

export async function sendPasswordResetEmail(email: string, userName: string, resetLink: string) {
  const content = await getTemplate('email.auth.reset_password') || `Hello ${userName}, reset your password here: ${resetLink}`

  const html = renderTemplate(content, {
    user_name: userName,
    reset_link: resetLink,
    year: new Date().getFullYear()
  }, { escape: true })

  return sendRawEmail({
    to: email,
    subject: "Reset Your Password - SWUWS Collection Portal",
    html
  })
}
