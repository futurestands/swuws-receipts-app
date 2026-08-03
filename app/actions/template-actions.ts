"use server"

import { db } from "@/lib/db"
import { managedTemplate, templateVersion, user as userTable } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { randomUUID } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { revalidatePath } from "next/cache"
import { canConfigureSystem } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"

/**
 * Lists all managed templates with their active version metadata.
 */
export async function listTemplates() {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) throw new Error("Unauthorized")

  const templates = await db.select().from(managedTemplate).orderBy(managedTemplate.category, managedTemplate.name)

  // Fetch active version details for each
  const result = await Promise.all(templates.map(async (t) => {
    if (!t.activeVersionId) return { ...t, activeContent: null, versionNumber: 0 }

    const [version] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.id, t.activeVersionId))
      .limit(1)

    return {
      ...t,
      activeContent: version?.content || null,
      versionNumber: version?.versionNumber || 0
    }
  }))

  return result
}

/**
 * Fetches version history for a specific template.
 */
export async function getTemplateHistory(templateId: string) {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) throw new Error("Unauthorized")

  return db
    .select({
      id: templateVersion.id,
      versionNumber: templateVersion.versionNumber,
      status: templateVersion.status,
      changelog: templateVersion.changelog,
      content: templateVersion.content,
      createdAt: templateVersion.createdAt,
      createdBy: userTable.name,
    })
    .from(templateVersion)
    .leftJoin(userTable, eq(templateVersion.createdById, userTable.id))
    .where(eq(templateVersion.templateId, templateId))
    .orderBy(desc(templateVersion.versionNumber))
}

/**
 * Saves a new version (Draft) of a template.
 */
export async function saveTemplateDraft(data: {
  templateId: string
  content: string
  changelog: string
}) {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) throw new Error("Unauthorized")

  // Find latest version number
  const [latest] = await db
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.templateId, data.templateId))
    .orderBy(desc(templateVersion.versionNumber))
    .limit(1)

  const newVersionNumber = (latest?.versionNumber || 0) + 1
  const id = randomUUID()

  await db.insert(templateVersion).values({
    id,
    templateId: data.templateId,
    versionNumber: newVersionNumber,
    content: data.content,
    status: "draft",
    changelog: data.changelog,
    createdById: user.id,
  })

  revalidatePath("/admin")
  return { ok: true, versionId: id }
}

/**
 * Saves a new version AND publishes it immediately.
 * Streamlines the "Save Draft -> Publish" workflow into a single click.
 */
export async function saveAndPublishTemplate(data: {
  templateId: string
  content: string
  changelog: string
}) {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) throw new Error("Unauthorized")

  return db.transaction(async (tx) => {
    // 1. Find latest version number
    const [latest] = await tx
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.templateId, data.templateId))
      .orderBy(desc(templateVersion.versionNumber))
      .limit(1)

    const newVersionNumber = (latest?.versionNumber || 0) + 1
    const newVersionId = randomUUID()

    // 2. Archive current active version if it exists
    const [temp] = await tx.select().from(managedTemplate).where(eq(managedTemplate.id, data.templateId)).limit(1)
    if (temp?.activeVersionId) {
      await tx.update(templateVersion)
        .set({ status: 'archived' })
        .where(eq(templateVersion.id, temp.activeVersionId))
    }

    // 3. Create new published version
    await tx.insert(templateVersion).values({
      id: newVersionId,
      templateId: data.templateId,
      versionNumber: newVersionNumber,
      content: data.content,
      status: "published",
      changelog: data.changelog,
      createdById: user.id,
      publishedAt: new Date()
    })

    // 4. Update template pointer
    await tx.update(managedTemplate)
      .set({ activeVersionId: newVersionId, updatedAt: new Date() })
      .where(eq(managedTemplate.id, data.templateId))

    // 5. Audit Log
    await writeAudit({
      user,
      action: "template.save_and_publish",
      entityType: "managed_template",
      entityId: data.templateId,
      details: { versionId: newVersionId, templateCode: temp?.code }
    }, tx)

    revalidatePath("/admin")
    return { ok: true, versionId: newVersionId }
  })
}

/**
 * Publishes a specific version of a template, making it the active one.
 */
export async function publishTemplateVersion(templateId: string, versionId: string) {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) throw new Error("Unauthorized")

  await db.transaction(async (tx) => {
    // 1. Archive current active version if it exists
    const [temp] = await tx.select().from(managedTemplate).where(eq(managedTemplate.id, templateId)).limit(1)
    if (temp?.activeVersionId) {
      await tx.update(templateVersion)
        .set({ status: 'archived' })
        .where(eq(templateVersion.id, temp.activeVersionId))
    }

    // 2. Set new version to published
    await tx.update(templateVersion)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(templateVersion.id, versionId))

    // 3. Update template pointer
    await tx.update(managedTemplate)
      .set({ activeVersionId: versionId, updatedAt: new Date() })
      .where(eq(managedTemplate.id, templateId))

    // 4. Audit Log
    await writeAudit({
      user,
      action: "template.publish",
      entityType: "managed_template",
      entityId: templateId,
      details: { versionId, templateCode: temp?.code }
    }, tx)
  })

  revalidatePath("/admin")
  return { ok: true }
}

/**
 * Bootstrap: Seed initial system templates if they don't exist.
 */
export async function seedSystemTemplates() {
  const user = await getCurrentUser()
  if (!user || !canConfigureSystem(user)) return

  const initial = [
    {
      code: 'comm.receipt.official',
      name: 'Official Payment Receipt',
      category: 'Commercial',
      type: 'HTML',
      content: '<div style="font-family: sans-serif;"><h1>Receipt #{{receipt_number}}</h1><p>Customer: {{customer_name}}</p><p>Amount: {{amount}} UGX</p></div>'
    },
    {
      code: 'notif.billing.sms',
      name: 'Billing Notification SMS',
      category: 'Notifications',
      type: 'SMS',
      content: 'Hello {{customer_name}}, your water bill for {{period}} is {{amount}} UGX. Please pay by {{due_date}}.'
    },
    {
      code: 'comm.bill.demand_note',
      name: 'Official Water Demand Note',
      category: 'Commercial',
      type: 'HTML',
      content: `
<div style="font-family: serif; padding: 20px; border: 1px solid #000; max-width: 400px; margin: auto;">
  <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px;">
    <h2 style="margin: 0; font-size: 18px; font-style: italic; font-weight: 900;">SOUTHWESTERN UMBRELLA</h2>
    <h3 style="margin: 0; font-size: 14px;">OF WATER AND SANITATION</h3>
    <p style="margin: 5px 0 0 0; font-size: 12px; font-weight: bold;">WATER DEMAND NOTE</p>
  </div>

  <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
    <tr><td style="font-weight: bold;">Customer:</td><td style="text-align: right;">{{customer_name}}</td></tr>
    <tr><td style="font-weight: bold;">Account:</td><td style="text-align: right;">{{customer_account}}</td></tr>
    <tr><td style="font-weight: bold;">Scheme:</td><td style="text-align: right;">{{scheme_name}}</td></tr>
    <tr><td style="font-weight: bold;">Period:</td><td style="text-align: right;">{{billing_period}}</td></tr>
  </table>

  <div style="margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px;">
    <table style="width: 100%; font-size: 12px;">
      <tr><td>Prev Reading:</td><td style="text-align: right;">{{prev_reading}}</td></tr>
      <tr><td>Curr Reading:</td><td style="text-align: right;">{{curr_reading}}</td></tr>
      <tr style="border-bottom: 1px solid #eee;"><td>Consumption:</td><td style="text-align: right;">{{consumption}} m³</td></tr>
    </table>
  </div>

  <div style="margin-top: 15px; background: #f9f9f9; padding: 8px;">
    <table style="width: 100%; font-size: 14px; font-weight: bold;">
      <tr><td>Monthly Bill:</td><td style="text-align: right;">{{bill_amount}}</td></tr>
      <tr><td style="color: #d00;">Arrears:</td><td style="text-align: right; color: #d00;">{{arrears}}</td></tr>
      <tr style="border-top: 2px solid #000; font-size: 16px;">
        <td>GRAND TOTAL:</td>
        <td style="text-align: right;">{{total_due}}</td></tr>
    </table>
  </div>

  <div style="margin-top: 20px; font-size: 10px; text-align: center; font-style: italic;">
    <p>Please pay via authorized channels. Keep this slip as proof of reading.</p>
    <p>Printed by: {{agent_name}} on {{date}}</p>
  </div>
</div>
      `
    },
    {
      code: 'import.billing.monthly',
      name: 'Monthly Billing Import Schema',
      category: 'Finance',
      type: 'IMPORT',
      content: JSON.stringify({
        accountNumber: "AccountNumber",
        billAmount: "BillAmount",
        arrears: "Arrears",
        currentCharges: "CurrentCharges",
        totalDue: "TotalDue",
        dueDate: "DueDate"
      }, null, 2)
    },
    {
      code: 'import.hierarchy.master',
      name: 'Unified Hierarchy Schema',
      category: 'System',
      type: 'IMPORT',
      content: JSON.stringify({
        clusterName: "Region",
        branchName: "AreaOffice",
        schemeName: "SchemeName",
        schemeCode: "SchemeCode",
        serviceArea: "ServiceArea"
      }, null, 2)
    },
    {
      code: 'import.customers.bulk',
      name: 'Customer Onboarding Schema',
      category: 'Commercial',
      type: 'IMPORT',
      content: JSON.stringify({
        name: "Name",
        customerAccount: "CustomerRef",
        phone: "Phone",
        address: "VillageName",
        schemeName: "SchemeName",
        meterRef: "MeterRef",
        serialNo: "MeterSerial",
        openingArrears: "OpeningArrears",
        notes: "Notes"
      }, null, 2)
    },
    {
      code: 'import.users.bulk',
      name: 'System User Import Schema',
      category: 'System',
      type: 'IMPORT',
      content: JSON.stringify({
        name: "Name",
        email: "Email",
        password: "Password",
        role: "Role",
        cluster: "Cluster",
        area: "Area",
        scheme: "Scheme",
        phone: "Phone",
        status: "Status"
      }, null, 2)
    },
    {
      code: 'import.tariffs.bulk',
      name: 'System Tariff Import Schema',
      category: 'System',
      type: 'IMPORT',
      content: JSON.stringify({
        targetType: "Type",
        targetName: "AreaName",
        unitPrice: "UnitPrice",
        serviceFee: "ServiceFee",
        vatPercentage: "VAT",
        active: "Status"
      }, null, 2)
    },
    {
      code: 'email.auth.reset_password',
      name: 'Password Reset Email',
      category: 'System',
      type: 'HTML',
      content: `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded-lg">
  <div style="text-align: center; margin-bottom: 20px;">
    <h1 style="color: #0f172a; margin: 0;">SWUWS Collection Portal</h1>
    <p style="color: #64748b; font-size: 14px;">Secure Account Access</p>
  </div>

  <div style="background-color: #f8fafc; padding: 30px; border-radius: 8px;">
    <h2 style="margin-top: 0;">Reset Your Password</h2>
    <p>Hello <strong>{{user_name}}</strong>,</p>
    <p>We received a request to reset the password for your account on the SWUWS Collection Portal. Click the button below to choose a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{reset_link}}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
    </div>

    <p style="font-size: 14px; color: #64748b;">If you did not request this reset, you can safely ignore this email. This link will expire in 1 hour.</p>
  </div>

  <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
    <p>&copy; {{year}} South Western Umbrella of Water and Sanitation. All rights reserved.</p>
  </div>
</div>
      `
    }
  ]

  for (const item of initial) {
    const [exists] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, item.code)).limit(1)
    if (!exists) {
      const tId = randomUUID()
      const vId = randomUUID()

      await db.transaction(async (tx) => {
        // Step 1: Create template (satisfy template_version's future templateId FK)
        await tx.insert(managedTemplate).values({
          id: tId,
          code: item.code,
          name: item.name,
          category: item.category,
          type: item.type,
          activeVersionId: null // Temporarily null to satisfy managed_template's activeVersionId FK
        })

        // Step 2: Create version (now that tId exists)
        await tx.insert(templateVersion).values({
          id: vId,
          templateId: tId,
          versionNumber: 1,
          content: item.content,
          status: 'published',
          changelog: 'Initial system template',
          createdById: user.id,
          publishedAt: new Date()
        })

        // Step 3: Link template to version (now that vId exists)
        await tx.update(managedTemplate)
          .set({ activeVersionId: vId })
          .where(eq(managedTemplate.id, tId))
      })
    } else {
      // Version 1.2.1 Fix: Ensure existing seeded templates match the user's official format
      // Force update the content of the active version if it's the initial seed version
      const [activeVersion] = await db
        .select()
        .from(templateVersion)
        .where(eq(templateVersion.id, exists.activeVersionId || ""))
        .limit(1)

      if (activeVersion && activeVersion.versionNumber === 1 && activeVersion.content !== item.content) {
        await db.update(templateVersion)
          .set({ content: item.content, updatedAt: new Date() })
          .where(eq(templateVersion.id, activeVersion.id))
      }
    }
  }
}
