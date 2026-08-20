import {
  pgTable,
  text,
  timestamp,
  bigint,
  integer,
  numeric,
  boolean,
  index,
} from "drizzle-orm/pg-core"
import { waterScheme } from "./hierarchy"
import { user } from "./auth"
import { managedTemplate } from "./system"

/**
 * Module 1 (Customer Management).
 */
export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    customerAccount: text("customerAccount").unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    waterSchemeId: text("waterSchemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    meterRef: text("meterRef").unique(),
    serialNo: text("serialNo"),
    lastReading: bigint("lastReading", { mode: "number" }).notNull().default(0),
    lastReadingDate: timestamp("lastReadingDate"),
    notes: text("notes"),
    openingArrears: integer("openingArrears").notNull().default(0),
    accountBalance: numeric("accountBalance", { precision: 12, scale: 2 }).notNull().default("0"),
    category: text("category").notNull().default("domestic"), // domestic, institutional, psp, commercial
    active: boolean("active").notNull().default(true),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("customer_name_idx").on(table.name),
    schemeIdx: index("customer_scheme_idx").on(table.waterSchemeId),
    activeIdx: index("customer_active_idx").on(table.active),
    balanceIdx: index("customer_balance_idx").on(table.accountBalance),
  }),
)

/**
 * CRM Departments (e.g. Technical, Finance, Call Center)
 */
export const crmDepartment = pgTable("crm_department", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Complaint Categories (e.g. Leakage, No Bills, Meter Problem)
 */
export const crmComplaintCategory = pgTable("crm_complaint_category", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultHandlerDepartmentId: text("defaultHandlerDepartmentId").references(() => crmDepartment.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Customer Complaints / Service Tickets
 */
export const crmComplaint = pgTable("crm_complaint", {
  id: text("id").primaryKey(),
  complaintNumber: text("complaintNumber").notNull().unique(),
  customerId: text("customerId").references(() => customer.id, { onDelete: "set null" }),
  complainantName: text("complainantName").notNull(),
  complainantPhone: text("complainantPhone").notNull(),
  complainantEmail: text("complainantEmail"),
  complainantAddress: text("complainantAddress"),
  area: text("area"),
  schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "set null" }),
  categoryId: text("categoryId").references(() => crmComplaintCategory.id, { onDelete: "set null" }),
  details: text("details").notNull(),
  language: text("language").notNull().default("English"), // English, Luganda, Runyankore-Rukiga
  status: text("status").notNull().default("open"), // open, assigned, in_progress, resolved, closed
  priority: text("priority").notNull().default("medium"), // low, medium, high, critical
  assignedToId: text("assignedToId").references(() => user.id, { onDelete: "set null" }),
  assignedDepartmentId: text("assignedDepartmentId").references(() => crmDepartment.id, { onDelete: "set null" }),
  resolutionNotes: text("resolutionNotes"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedById: text("resolvedById").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}, (table) => ({
  complaintNumberIdx: index("complaint_number_idx").on(table.complaintNumber),
  statusIdx: index("complaint_status_idx").on(table.status),
  priorityIdx: index("complaint_priority_idx").on(table.priority),
}))

/**
 * Bulk SMS Batches (e.g. Bill Reminders, Seasonal Greetings)
 */
export const crmSmsBatch = pgTable("crm_sms_batch", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // 'Bill Reminders', 'Seasonal Greetings', 'Alerts'
  templateId: text("templateId").references(() => managedTemplate.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  totalMessages: integer("totalMessages").notNull().default(0),
  sentMessages: integer("sentMessages").notNull().default(0),
  failedMessages: integer("failedMessages").notNull().default(0),
  createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Individual SMS records for status tracking
 */
export const crmSmsRecord = pgTable("crm_sms_record", {
  id: text("id").primaryKey(),
  batchId: text("batchId").references(() => crmSmsBatch.id, { onDelete: "cascade" }),
  customerId: text("customerId").references(() => customer.id, { onDelete: "set null" }),
  phoneNumber: text("phoneNumber").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("queued"), // queued, sent, delivered, failed
  externalRef: text("externalRef"),
  error: text("error"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}, (table) => ({
  batchIdx: index("sms_record_batch_idx").on(table.batchId),
  statusIdx: index("sms_record_status_idx").on(table.status),
}))

export type Customer = typeof customer.$inferSelect
export type CrmDepartment = typeof crmDepartment.$inferSelect
export type CrmComplaintCategory = typeof crmComplaintCategory.$inferSelect
export type CrmComplaint = typeof crmComplaint.$inferSelect
export type CrmSmsBatch = typeof crmSmsBatch.$inferSelect
export type CrmSmsRecord = typeof crmSmsRecord.$inferSelect
