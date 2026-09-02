const dotenv = require('dotenv');
dotenv.config();

const { db } = require('../lib/db/index');
const { managedTemplate, templateVersion, user } = require('../lib/db/schema');
const { eq } = require('drizzle-orm');
const { crypto, randomUUID } = require('crypto');

async function seed() {
  console.log("Seeding CRM Message Templates...");

  // Find a valid admin user ID to attribute the creation to
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1);
  if (!admin) {
    console.error("Admin user not found. Seeding failed.");
    process.exit(1);
  }

  const crmTemplates = [
    {
      code: 'crm.complaint.registered.sms',
      name: 'Complaint Registration Confirmation',
      category: 'CRM',
      type: 'SMS',
      content: 'Dear {{customer_name}}, your complaint #{{ticket_id}} has been registered. Nature: {{category}}. Status: OPEN. SWUWS IT.'
    },
    {
      code: 'crm.complaint.resolved.sms',
      name: 'Complaint Resolution Notification',
      category: 'CRM',
      type: 'SMS',
      content: 'Dear {{customer_name}}, your complaint #{{ticket_id}} has been RESOLVED. Resolution: {{notes}}. Thank you for your patience. SWUWS IT.'
    },
    {
      code: 'crm.bulk.general.sms',
      name: 'General Purpose SMS (Broadcast)',
      category: 'CRM',
      type: 'SMS',
      content: 'SWUWS NOTICE: {{message}}'
    }
  ];

  try {
    for (const item of crmTemplates) {
      const [exists] = await db.select().from(managedTemplate).where(eq(managedTemplate.code, item.code)).limit(1)
      if (!exists) {
        const tId = randomUUID();
        const vId = randomUUID();

        await db.transaction(async (tx) => {
          await tx.insert(managedTemplate).values({
            id: tId,
            code: item.code,
            name: item.name,
            category: item.category,
            type: item.type,
            activeVersionId: null
          });

          await tx.insert(templateVersion).values({
            id: vId,
            templateId: tId,
            versionNumber: 1,
            content: item.content,
            status: 'published',
            changelog: 'Initial CRM template',
            createdById: admin.id,
            publishedAt: new Date()
          });

          await tx.update(managedTemplate)
            .set({ activeVersionId: vId })
            .where(eq(managedTemplate.id, tId));
        });
        console.log(`✅ Template Created: ${item.code}`);
      } else {
        console.log(`ℹ️ Template Already Exists: ${item.code}`);
      }
    }
    process.exit(0);
  } catch (e) {
    console.error("Seeding failed:", e);
    process.exit(1);
  }
}

seed();
