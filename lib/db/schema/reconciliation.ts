import {
  pgTable,
  text,
  timestamp,
  bigint,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "./auth"
import { receipt } from "./finance"

import { billingPeriod } from "./billing"

/**
 * Metadata for daily collection reports imported from the external billing system.
 */
export const dailyCollectionImport = pgTable(
  "daily_collection_import",
  {
    id: text("id").primaryKey(),
    businessDate: timestamp("businessDate").notNull(),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    uploadedById: text("uploadedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("uploaded"), // uploaded, validated, processed, archived, failed
    totalRecords: integer("totalRecords").notNull().default(0),
    successfulRecords: integer("successfulRecords").notNull().default(0),
    failedRecords: integer("failedRecords").notNull().default(0),
    totalAmount: bigint("totalAmount", { mode: "number" }).notNull().default(0),
    fileHash: text("fileHash"),
    processingDuration: integer("processingDuration"), // in milliseconds
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    businessDateIdx: index("daily_collection_import_date_idx").on(table.businessDate),
    uploadedByIdx: index("daily_collection_import_uploader_idx").on(table.uploadedById),
  }),
)

/**
 * Individual payment records from a daily collection import.
 */
export const dailyCollectionRecord = pgTable(
  "daily_collection_record",
  {
    id: text("id").primaryKey(),
    batchId: text("batchId")
      .notNull()
      .references(() => dailyCollectionImport.id, { onDelete: "cascade" }),
    accountNumber: text("accountNumber").notNull(),
    customerName: text("customerName").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull().default(0),
    paymentDate: timestamp("paymentDate").notNull(),
    externalReference: text("externalReference").notNull(),
    paymentChannel: text("paymentChannel").notNull(),
    schemeName: text("schemeName"),
    branchName: text("branchName"),
    currency: text("currency").notNull().default("UGX"),
    remarks: text("remarks"),
    importStatus: text("importStatus").notNull().default("imported"), // imported, pending, matched, review, rejected, archived
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index("daily_collection_record_batch_idx").on(table.batchId),
    accountIdx: index("daily_collection_record_account_idx").on(table.accountNumber),
    refIdx: index("daily_collection_record_ref_idx").on(table.externalReference),
    dateIdx: index("daily_collection_record_date_idx").on(table.paymentDate),
    amountIdx: index("daily_collection_record_amount_idx").on(table.amount),
    statusIdx: index("daily_collection_record_status_idx").on(table.importStatus),
    // Multi-field duplicate protection (Batch-level)
    batchRefUnq: uniqueIndex("daily_collection_record_batch_ref_unq").on(table.batchId, table.externalReference),
  }),
)

/**
 * Reconciliation matches between SWUWS Receipts and External Billing records.
 */
export const reconciliationMatch = pgTable(
  "reconciliation_match",
  {
    id: text("id").primaryKey(),
    receiptId: text("receiptId")
      .notNull()
      .references(() => receipt.id, { onDelete: "cascade" }),
    dailyCollectionRecordId: text("dailyCollectionRecordId")
      .notNull()
      .references(() => dailyCollectionRecord.id, { onDelete: "cascade" }),
    matchMethod: text("matchMethod").notNull(), // exact_reference, account_amount_date, account_amount_channel
    confidenceScore: integer("confidenceScore").notNull().default(0),
    matchedAt: timestamp("matchedAt").notNull().defaultNow(),
    matchedById: text("matchedById").references(() => user.id, { onDelete: "set null" }),
    status: text("status").notNull().default("matched"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    receiptIdx: uniqueIndex("reconciliation_match_receipt_idx").on(table.receiptId),
    recordIdx: uniqueIndex("reconciliation_match_record_idx").on(table.dailyCollectionRecordId),
    methodIdx: index("reconciliation_match_method_idx").on(table.matchMethod),
  }),
)

/**
 * Reconciliation exceptions for unmatched or problematic records.
 */
export const reconciliationException = pgTable(
  "reconciliation_exception",
  {
    id: text("id").primaryKey(),
    receiptId: text("receiptId").references(() => receipt.id, { onDelete: "cascade" }),
    dailyCollectionRecordId: text("dailyCollectionRecordId").references(() => dailyCollectionRecord.id, { onDelete: "cascade" }),
    exceptionType: text("exceptionType").notNull(), // unmatched_receipt, unmatched_payment, amount_mismatch, etc.
    reason: text("reason").notNull(),
    priority: text("priority").notNull().default("medium"), // critical, high, medium, low
    status: text("status").notNull().default("open"), // open, assigned, under_review, resolved, escalated, closed
    assignedToId: text("assignedToId").references(() => user.id, { onDelete: "set null" }),
    dueDate: timestamp("dueDate"),
    reviewNotes: text("reviewNotes"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolvedAt"),
    resolvedById: text("resolvedById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    receiptIdx: index("reconciliation_exception_receipt_idx").on(table.receiptId),
    recordIdx: index("reconciliation_exception_record_idx").on(table.dailyCollectionRecordId),
    statusIdx: index("reconciliation_exception_status_idx").on(table.status),
    typeIdx: index("reconciliation_exception_type_idx").on(table.exceptionType),
    assignedIdx: index("reconciliation_exception_assigned_idx").on(table.assignedToId),
  }),
)

/**
 * formal sign-off and approval of reconciliation batches.
 */
export const reconciliationApproval = pgTable(
  "reconciliation_approval",
  {
    id: text("id").primaryKey(),
    batchId: text("batchId")
      .notNull()
      .references(() => dailyCollectionImport.id, { onDelete: "cascade" }),
    approvalStage: text("approvalStage").notNull().default("draft"), // draft, pending_review, reviewed, approved, rejected, reopened, closed
    status: text("status").notNull().default("active"), // current approval status
    assignedToId: text("assignedToId").references(() => user.id, { onDelete: "set null" }),
    dueDate: timestamp("dueDate"),
    approvedById: text("approvedById").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approvedAt"),
    comments: text("comments"),
    reopenedById: text("reopenedById").references(() => user.id, { onDelete: "set null" }),
    reopenedAt: timestamp("reopenedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index("reconciliation_approval_batch_idx").on(table.batchId),
    stageIdx: index("reconciliation_approval_stage_idx").on(table.approvalStage),
  }),
)

export type DailyCollectionImport = typeof dailyCollectionImport.$inferSelect
export type DailyCollectionRecord = typeof dailyCollectionRecord.$inferSelect
export type ReconciliationMatch = typeof reconciliationMatch.$inferSelect
export type ReconciliationException = typeof reconciliationException.$inferSelect
export type ReconciliationApproval = typeof reconciliationApproval.$inferSelect
