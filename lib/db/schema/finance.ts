import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { customer } from "./crm"
import { branch, waterScheme } from "./hierarchy"
import { user } from "./auth"
import { billingRecord, billingPeriod } from "./billing"

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

/**
 * Immutable receipts.
 */
export const receipt = pgTable(
  "receipt",
  {
    id: text("id").primaryKey(),
    seq: bigint("seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('receipt_seq')`),
    receiptNumber: text("receiptNumber")
      .notNull()
      .unique()
      .default(
        sql`('SWUWS-' || to_char(now(), 'YYYY') || '-' || lpad(currval('receipt_seq')::text, 6, '0'))`,
      ),
    paymentReference: text("paymentReference").notNull(),
    customerId: text("customerId").references(() => customer.id, { onDelete: "set null" }),
    customerName: text("customerName").notNull(),
    customerAccount: text("customerAccount"),
    customerPhone: text("customerPhone"),
    customerAddress: text("customerAddress"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    outstandingBalance: numeric("outstandingBalance", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("UGX"),
    paymentMethod: text("paymentMethod").notNull().default("cash"),
    notes: text("notes"),
    paymentDate: timestamp("paymentDate").notNull(),
    branchId: text("branchId").references(() => branch.id, { onDelete: "restrict" }),
    branchName: text("branchName"),
    schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "restrict" }),
    agentId: text("agentId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    agentName: text("agentName").notNull(),
    agentEmail: text("agentEmail").notNull(),
    billingRecordId: text("billingRecordId").references(() => billingRecord.id, {
      onDelete: "set null",
    }),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, {
      onDelete: "set null",
    }),
    previousAccountBalanceSnapshot: numeric("previousAccountBalanceSnapshot", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    newAccountBalanceSnapshot: numeric("newAccountBalanceSnapshot", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    billingPeriodSnapshot: text("billingPeriodSnapshot"),
    amountDueSnapshot: numeric("amountDueSnapshot", { precision: 12, scale: 2 }),
    schemeNameSnapshot: text("schemeNameSnapshot"),
    reconciliationStatus: text("reconciliationStatus").notNull().default("pending"), // pending, matched, exception, manual
    orgNameSnapshot: text("orgNameSnapshot").notNull(),
    orgAddressSnapshot: text("orgAddressSnapshot"),
    orgPhoneSnapshot: text("orgPhoneSnapshot"),
    disclaimerSnapshot: text("disclaimerSnapshot").notNull(),
    footerSnapshot: text("footerSnapshot").notNull(),
    logoUrlSnapshot: text("logoUrlSnapshot"),

    idempotencyKey: text("idempotencyKey"),

    // -----------------------------------------------------------------------
    // LEGACY PRINTING COLUMNS (DO NOT USE)
    // These are no longer updated because the receipt table is immutable.
    // Use the receipt_print_history table aggregates instead.
    // -----------------------------------------------------------------------
    printCount: integer("printCount").notNull().default(0),
    firstPrintedAt: timestamp("firstPrintedAt"),
    lastPrintedAt: timestamp("lastPrintedAt"),
    lastPrintedBy: text("lastPrintedBy"),

    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("receipt_agent_idx").on(table.agentId),
    createdAtIdx: index("receipt_created_at_idx").on(table.createdAt),
    branchIdx: index("receipt_branch_idx").on(table.branchId),
    schemeIdx: index("receipt_scheme_idx").on(table.schemeId),
    customerIdx: index("receipt_customer_idx").on(table.customerId),
    customerAccountIdx: index("receipt_customer_account_idx").on(table.customerAccount),
    paymentDateIdx: index("receipt_payment_date_idx").on(table.paymentDate),
    amountIdx: index("receipt_amount_idx").on(table.amount),
    reconStatusIdx: index("receipt_recon_status_idx").on(table.reconciliationStatus),
    billingRecordIdx: index("receipt_billing_record_idx").on(table.billingRecordId),
    billingPeriodIdx: index("receipt_billing_period_idx").on(table.billingPeriodId),
    idempotencyKeyIdx: uniqueIndex("receipt_idempotency_key_idx").on(table.idempotencyKey),
  }),
)

export const receiptPrintHistory = pgTable(
  "receipt_print_history",
  {
    id: text("id").primaryKey(),
    receiptId: text("receiptId")
      .notNull()
      .references(() => receipt.id, { onDelete: "cascade" }),
    printedById: text("printedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    printedByName: text("printedByName").notNull(),
    printNumber: integer("printNumber").notNull(),
    isReprint: boolean("isReprint").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    device: text("device"),
    browser: text("browser"),
    printedAt: timestamp("printedAt").notNull().defaultNow(),
  },
  (table) => ({
    receiptIdx: index("receipt_print_history_receipt_idx").on(table.receiptId),
    printedByIdx: index("receipt_print_history_printed_by_idx").on(table.printedById),
  }),
)

export const receiptAttachment = pgTable(
  "receipt_attachment",
  {
    id: text("id").primaryKey(),
    receiptId: text("receiptId")
      .notNull()
      .references(() => receipt.id, { onDelete: "restrict" }),
    url: text("url").notNull(),
    fileName: text("fileName").notNull(),
    fileSize: integer("fileSize").notNull(),
    uploadedById: text("uploadedById").notNull(),
    uploadedByName: text("uploadedByName").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    receiptIdx: index("receipt_attachment_receipt_idx").on(table.receiptId),
  }),
)

export type Receipt = typeof receipt.$inferSelect
export type ReceiptPrintHistory = typeof receiptPrintHistory.$inferSelect
export type ReceiptAttachment = typeof receiptAttachment.$inferSelect
