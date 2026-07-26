import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { customer } from "./crm"
import { waterScheme } from "./hierarchy"
import { user } from "./auth"

// ---------------------------------------------------------------------------
// Billing Module Tables
// ---------------------------------------------------------------------------

/**
 * Represents a billing cycle (e.g., July 2026).
 */
export const billingPeriod = pgTable(
  "billing_period",
  {
    id: text("id").primaryKey(),
    month: integer("month").notNull(), // 1-12
    year: integer("year").notNull(),
    periodName: text("periodName").notNull(), // e.g., "July 2026"
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"), // draft, validated, active, closed, archived
    isOpen: boolean("isOpen").notNull().default(true), // Legacy: kept for compatibility
    isLocked: boolean("isLocked").notNull().default(false), // Legacy: kept for compatibility

    // Lifecycle Timeline
    validatedAt: timestamp("validatedAt"),
    validatedById: text("validatedById").references(() => user.id),
    activatedAt: timestamp("activatedAt"),
    activatedById: text("activatedById").references(() => user.id),
    closedAt: timestamp("closedAt"),
    closedById: text("closedById").references(() => user.id),
    archivedAt: timestamp("archivedAt"),
    archivedById: text("archivedById").references(() => user.id),

    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    monthYearIdx: index("billing_period_month_year_idx").on(table.month, table.year),
    statusIdx: index("billing_period_status_idx").on(table.status),
  }),
)

/**
 * One upload session for a specific scheme and period.
 */
export const billingRun = pgTable(
  "billing_run",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "restrict" }),
    billingPeriodId: text("billingPeriodId")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    uploadedById: text("uploadedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploadedAt").notNull().defaultNow(),
    sourceFile: text("sourceFile"),
    status: text("status").notNull().default("pending"), // pending, completed, failed
    totalCustomers: integer("totalCustomers").notNull().default(0),
    totalAmount: bigint("totalAmount", { mode: "number" }).notNull().default(0),
    remarks: text("remarks"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemePeriodUnq: uniqueIndex("billing_run_scheme_period_unq").on(table.schemeId, table.billingPeriodId),
    schemeIdx: index("billing_run_scheme_idx").on(table.schemeId),
    periodIdx: index("billing_run_period_idx").on(table.billingPeriodId),
    uploadedByIdx: index("billing_run_uploaded_by_idx").on(table.uploadedById),
  }),
)

/**
 * Individual bill for a customer in a specific period.
 */
export const billingRecord = pgTable(
  "billing_record",
  {
    id: text("id").primaryKey(),
    billingRunId: text("billingRunId")
      .notNull()
      .references(() => billingRun.id, { onDelete: "cascade" }),
    // Denormalized for efficient unique constraint (customer_id, billing_period_id)
    billingPeriodId: text("billingPeriodId")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    customerId: text("customerId")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    accountNumber: text("accountNumber").notNull(),
    billAmount: bigint("billAmount", { mode: "number" }).notNull().default(0),
    arrears: bigint("arrears", { mode: "number" }).notNull().default(0),
    currentCharges: bigint("currentCharges", { mode: "number" }).notNull().default(0),
    totalDue: bigint("totalDue", { mode: "number" }).notNull().default(0),
    dueDate: timestamp("dueDate").notNull(),
    status: text("status").notNull().default("pending"), // pending, partially_paid, paid, cancelled, written_off
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    customerPeriodUnq: uniqueIndex("billing_record_customer_period_unq").on(
      table.customerId,
      table.billingPeriodId,
    ),
    runIdx: index("billing_record_run_idx").on(table.billingRunId),
    periodIdx: index("billing_record_period_idx").on(table.billingPeriodId),
    customerIdx: index("billing_record_customer_idx").on(table.customerId),
    accountIdx: index("billing_record_account_idx").on(table.accountNumber),
    dueDateIdx: index("billing_record_due_date_idx").on(table.dueDate),
    statusIdx: index("billing_record_status_idx").on(table.status),
  }),
)

/**
 * Log of uploaded billing files.
 */
export const billingUpload = pgTable(
  "billing_upload",
  {
    id: text("id").primaryKey(),
    billingRunId: text("billingRunId")
      .notNull()
      .references(() => billingRun.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storagePath: text("storagePath").notNull(),
    fileHash: text("fileHash"),
    uploadedById: text("uploadedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploadedAt").notNull().defaultNow(),
    importedRecords: integer("importedRecords").notNull().default(0),
    failedRecords: integer("failedRecords").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    runIdx: index("billing_upload_run_idx").on(table.billingRunId),
    uploadedByIdx: index("billing_upload_uploaded_by_idx").on(table.uploadedById),
  }),
)

/**
 * Configuration for area-specific billing rates.
 * Target can be a Branch or a specific Water Scheme.
 */
export const tariffConfiguration = pgTable(
  "tariff_configuration",
  {
    id: text("id").primaryKey(),
    targetType: text("targetType").notNull(), // 'branch' or 'scheme'
    targetId: text("targetId").notNull(), // branchId or schemeId
    unitPrice: bigint("unitPrice", { mode: "number" }).notNull().default(0), // UGX per m3
    serviceFee: bigint("serviceFee", { mode: "number" }).notNull().default(0), // Fixed monthly
    vatPercentage: integer("vatPercentage").notNull().default(18), // Default 18%
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: uniqueIndex("tariff_target_idx").on(table.targetType, table.targetId),
  }),
)

/**
 * Monthly meter reading entries captured by field agents.
 */
export const meterReading = pgTable(
  "meter_reading",
  {
    id: text("id").primaryKey(),
    customerId: text("customerId")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    billingPeriodId: text("billingPeriodId")
      .notNull()
      .references(() => billingPeriod.id, { onDelete: "restrict" }),
    previousReading: bigint("previousReading", { mode: "number" }).notNull().default(0),
    currentReading: bigint("currentReading", { mode: "number" }).notNull().default(0),
    consumption: bigint("consumption", { mode: "number" }).notNull().default(0), // current - previous
    billedAmount: bigint("billedAmount", { mode: "number" }).notNull().default(0), // Calculated total
    previousBalanceSnapshot: bigint("previousBalanceSnapshot", { mode: "number" }).notNull().default(0),
    totalDueSnapshot: bigint("totalDueSnapshot", { mode: "number" }).notNull().default(0),
    customerNameSnapshot: text("customerNameSnapshot"),
    customerAccountSnapshot: text("customerAccountSnapshot"),
    phoneSnapshot: text("phoneSnapshot"),
    meterRefSnapshot: text("meterRefSnapshot"),
    recordedById: text("recordedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    isNotified: boolean("isNotified").notNull().default(false), // SMS status
    notifiedAt: timestamp("notifiedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    customerPeriodUnq: uniqueIndex("meter_reading_customer_period_unq").on(
      table.customerId,
      table.billingPeriodId,
    ),
    customerIdx: index("meter_reading_customer_idx").on(table.customerId),
    periodIdx: index("meter_reading_period_idx").on(table.billingPeriodId),
  }),
)

export type BillingPeriod = typeof billingPeriod.$inferSelect
export type BillingRun = typeof billingRun.$inferSelect
export type BillingRecord = typeof billingRecord.$inferSelect
export type BillingUpload = typeof billingUpload.$inferSelect
export type TariffConfiguration = typeof tariffConfiguration.$inferSelect
export type MeterReading = typeof meterReading.$inferSelect
