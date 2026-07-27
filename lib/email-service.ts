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
  const hasKey = !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "re-place-with-real-key"

  if (hasKey) {
    // Implementation for a real provider like Resend
    // await fetch("https://api.resend.com/emails", { ... })
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
  })

  return sendRawEmail({
    to: email,
    subject: "Reset Your Password - SWUWS Collection Portal",
    html
  })
}
