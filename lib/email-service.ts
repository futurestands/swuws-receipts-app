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

  if (hasKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "SWUWS Portal <noreply@receipts.swuws.org>", // Replace with your verified domain
          to: [options.to],
          subject: options.subject,
          html: options.html,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        console.error("[EMAIL SERVICE] Resend API Error:", error)
      }
    } catch (e) {
      console.error("[EMAIL SERVICE] Failed to reach email provider:", e)
    }
  }

  // Always log to console in development/testing
  console.log("-----------------------------------------")
  console.log(`[EMAIL SERVICE] Sending to: ${options.to}`)
  console.log(`[EMAIL SERVICE] Subject: ${options.subject}`)
  console.log(`[EMAIL SERVICE] Content Preview: ${options.html.substring(0, 100)}...`)
  console.log("-----------------------------------------")

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
