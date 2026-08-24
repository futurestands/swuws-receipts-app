import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

export type EditableFields = {
  customerName: boolean
  customerAccount: boolean
  customerPhone: boolean
  customerAddress: boolean
  amount: boolean
  paymentDate: boolean
  paymentMethod: boolean
  paymentReference: boolean
  notes: boolean
}

export const orgSettings = pgTable("org_settings", {
  id: integer("id").primaryKey().default(1),
  orgName: text("orgName")
    .notNull()
    .default("South Western Umbrella of Water and Sanitation"),
  logoUrl: text("logoUrl"),
  disclaimer: text("disclaimer")
    .notNull()
    .default(
      "This is an official, non-transferable receipt issued by SWUWS. It cannot be reissued or altered. Report any discrepancy to your area office within 30 days.",
    ),
  footerText: text("footerText").notNull().default("Thank you for your payment."),
  address: text("address"),
  phone: text("phone"),
  billingGraceDays: integer("billingGraceDays").notNull().default(14),
  currencyCode: text("currencyCode").notNull().default("UGX"),
  receiptPrefix: text("receiptPrefix").notNull().default("SWUWS"),
  developerCredit: text("developerCredit")
    .notNull()
    .default("Developed by Mugarura Johnson IT"),
  latestAppVersion: text("latestAppVersion").notNull().default("1.0.0"),
  maintenanceMode: boolean("maintenanceMode").notNull().default(false),
  editableFields: jsonb("editableFields").$type<EditableFields>().notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("userId"),
    userName: text("userName"),
    userEmail: text("userEmail"),
    action: text("action").notNull(),
    entityType: text("entityType"),
    entityId: text("entityId"),
    details: jsonb("details"),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
    userIdx: index("audit_log_user_id_idx").on(table.userId),
    actionIdx: index("audit_log_action_idx").on(table.action),
    entityIdx: index("audit_log_entity_idx").on(table.entityType, table.entityId),
  }),
)

/**
 * System and operational notifications for users.
 */
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // import_failed, approval_pending, exception_overdue, etc.
    title: text("title").notNull(),
    message: text("message").notNull(),
    relatedEntityType: text("relatedEntityType"),
    relatedEntityId: text("relatedEntityId"),
    priority: text("priority").notNull().default("normal"), // critical, high, normal, low
    status: text("status").notNull().default("unread"), // unread, read, archived, expired
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    readAt: timestamp("readAt"),
    expiresAt: timestamp("expiresAt"),
  },
  (table) => ({
    userStatusIdx: index("notification_user_status_idx").on(table.userId, table.status),
    typeIdx: index("notification_type_idx").on(table.type),
    typePriorityIdx: index("notification_type_priority_idx").on(table.type, table.priority),
    createdIdx: index("notification_created_idx").on(table.createdAt),
  }),
)

/**
 * Registry of all editable templates in the system.
 */
export const managedTemplate = pgTable(
  "managed_template",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(), // e.g. 'comm.receipt.official'
    category: text("category").notNull(), // 'Commercial', 'Finance', 'HR', etc.
    type: text("type").notNull(), // 'HTML', 'SMS', 'MD', 'TEXT'
    description: text("description"),
    activeVersionId: text("activeVersionId"), // Link to published template_version
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("template_code_idx").on(table.code),
    categoryIdx: index("template_category_idx").on(table.category),
  }),
)

/**
 * Version-controlled content for managed templates.
 */
export const templateVersion = pgTable(
  "template_version",
  {
    id: text("id").primaryKey(),
    templateId: text("templateId")
      .notNull()
      .references(() => managedTemplate.id, { onDelete: "cascade" }),
    versionNumber: integer("versionNumber").notNull(),
    content: text("content").notNull(), // The raw template string
    status: text("status").notNull().default("draft"), // 'draft', 'published', 'archived'
    changelog: text("changelog"),
    createdById: text("createdById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    templateIdx: index("version_template_idx").on(table.templateId),
    statusIdx: index("version_status_idx").on(table.status),
  }),
)

export type OrgSettings = typeof orgSettings.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type Notification = typeof notification.$inferSelect
export type ManagedTemplate = typeof managedTemplate.$inferSelect
export type TemplateVersion = typeof templateVersion.$inferSelect

/**
 * SMS Gateway configuration -- deliberately a SEPARATE table from
 * orgSettings, not extra columns on it. orgSettings is read broadly across
 * the app (login page, receipts, dashboard) via a cached getSettings()
 * call that many unrelated components destructure from; putting an API key
 * on that same row would make it too easy for it to end up in a client
 * props object somewhere it was never meant to reach. This table is only
 * ever read by the dedicated admin SMS settings panel and by the SMS
 * sending service itself -- nothing else should import it.
 */
export const smsGatewayConfig = pgTable("sms_gateway_config", {
  id: integer("id").primaryKey().default(1),
  provider: text("provider"), // e.g. 'africastalking'. Null = not configured, sendSMS stays a safe simulated no-op.
  apiKey: text("apiKey"),
  username: text("username"),
  senderId: text("senderId"),
  active: boolean("active").notNull().default(false),
  updatedById: text("updatedById").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export type SmsGatewayConfig = typeof smsGatewayConfig.$inferSelect
