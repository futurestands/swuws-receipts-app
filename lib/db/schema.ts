import {
  pgTable,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Reference data (admin-configurable)
// ---------------------------------------------------------------------------

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const cluster = pgTable("cluster", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  organizationId: text("organizationId").references(() => organization.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const branch = pgTable("branch", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  clusterId: text("clusterId").references(() => cluster.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const paymentMethod = pgTable("payment_method", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Module 2 (Branch & Scheme Management). A water scheme belongs to a
 * branch and has a free-text service area description (kept as a plain
 * field rather than its own table — no evidence yet that service areas
 * need independent management beyond a label on the scheme).
 */
export const waterScheme = pgTable(
  "water_scheme",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    branchId: text("branchId").references(() => branch.id, { onDelete: "set null" }),
    serviceArea: text("serviceArea"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    branchIdx: index("water_scheme_branch_idx").on(table.branchId),
  }),
)

// ---------------------------------------------------------------------------
// Better Auth tables (do not rename these columns)
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  phone: text("phone"),
  role: text("role").notNull().default("agent"),
  active: boolean("active").notNull().default(true),
  // Required by Better Auth's admin plugin (lib/auth.ts, adminPlugin()) —
  // its internal adapter queries these directly against the physical
  // table. Not read or written by any of this app's own code (this app's
  // own agent enable/disable uses `active` above, not `banned`). Verified
  // directly against node_modules/better-auth/dist/plugins/admin/schema.mjs
  // — see db/migrations/0007_admin_plugin_columns.sql for the root-cause
  // context.
  banned: boolean("banned").default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires"),

  // RBAC Hierarchy: Every user is eventually assignable to one level.
  // Using nullable fields to maintain backward compatibility.
  organizationId: text("organizationId").references(() => organization.id, { onDelete: "set null" }),
  clusterId: text("clusterId").references(() => cluster.id, { onDelete: "set null" }),
  // branchId remains the primary link for "Area" level to preserve
  // existing relationships for Agents and COs.
  branchId: text("branchId").references(() => branch.id, { onDelete: "set null" }),
  schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "set null" }),

  // IAM Integration: link to dynamic roles
  iamRoleId: text("iamRoleId").references(() => iamRole.id, { onDelete: "set null" }),

  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  // Required by Better Auth's admin plugin (impersonation feature). Not
  // used by any of this app's own code. See db/migrations/0007.
  impersonatedBy: text("impersonatedBy"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/**
 * Module 1 (Customer Management). Deliberately separate from the
 * receipt.customerName/Account/Phone/Address fields, which remain
 * untouched, immutable, point-in-time snapshots of what was true when a
 * given receipt was issued (same pattern as the branding snapshot fields).
 * This table is the evolving, editable profile a customer's receipt
 * history rolls up against; receipt.customerId (added below) is the link.
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
    notes: text("notes"),
    accountBalance: bigint("accountBalance", { mode: "number" }).notNull().default(0),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("customer_name_idx").on(table.name),
    schemeIdx: index("customer_scheme_idx").on(table.waterSchemeId),
  }),
)

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
    amount: bigint("amount", { mode: "number" }).notNull(),
    outstandingBalance: bigint("outstandingBalance", { mode: "number" }),
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
    previousAccountBalanceSnapshot: bigint("previousAccountBalanceSnapshot", { mode: "number" })
      .notNull()
      .default(0),
    newAccountBalanceSnapshot: bigint("newAccountBalanceSnapshot", { mode: "number" })
      .notNull()
      .default(0),
    billingPeriodSnapshot: text("billingPeriodSnapshot"),
    amountDueSnapshot: bigint("amountDueSnapshot", { mode: "number" }),
    schemeNameSnapshot: text("schemeNameSnapshot"),
    reconciliationStatus: text("reconciliationStatus").notNull().default("pending"), // pending, matched, exception, manual
    orgNameSnapshot: text("orgNameSnapshot").notNull(),
    disclaimerSnapshot: text("disclaimerSnapshot").notNull(),
    footerSnapshot: text("footerSnapshot").notNull(),
    logoUrlSnapshot: text("logoUrlSnapshot"),
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

export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  windowStart: timestamp("windowStart").notNull().defaultNow(),
  count: integer("count").notNull().default(0),
})

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

// ---------------------------------------------------------------------------
// IAM Module Tables
// ---------------------------------------------------------------------------

export const iamRole = pgTable(
  "iam_role",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(), // e.g. 'admin', 'commercial_officer'
    description: text("description"),
    level: integer("level").notNull().default(0),
    parentId: text("parent_id").references((): any => iamRole.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false), // Protected roles
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("iam_role_code_idx").on(table.code),
    parentIdx: index("iam_role_parent_idx").on(table.parentId),
  }),
)

export const iamPermission = pgTable(
  "iam_permission",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(), // e.g. 'receipts.create'
    module: text("module").notNull(), // e.g. 'Receipts'
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("iam_permission_code_idx").on(table.code),
    moduleIdx: index("iam_permission_module_idx").on(table.module),
  }),
)

export const iamRolePermission = pgTable(
  "iam_role_permission",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => iamRole.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => iamPermission.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("own"), // own, scheme, area, cluster, organization
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    rolePermUnq: uniqueIndex("iam_role_permission_unq").on(table.roleId, table.permissionId),
    roleIdx: index("iam_role_permission_role_idx").on(table.roleId),
  }),
)

/**
 * Metadata for daily collection reports imported from the external billing system.
 * (Foundation Phase 2A)
 */
export const dailyCollectionImport = pgTable(
  "daily_collection_import",
  {
    id: text("id").primaryKey(),
    businessDate: timestamp("businessDate").notNull(),
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
 * (Phase 2C Repository)
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
 * (Phase 3A Core Matching)
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
 * (Phase 3B Case Management)
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
 * (Phase 4B Approval Workflow)
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

/**
 * System and operational notifications for users.
 * (Phase 5B Notifications)
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

export type Receipt = typeof receipt.$inferSelect
export type ReceiptPrintHistory = typeof receiptPrintHistory.$inferSelect
export type ReceiptAttachment = typeof receiptAttachment.$inferSelect
export type OrgSettings = typeof orgSettings.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type User = typeof user.$inferSelect
export type Organization = typeof organization.$inferSelect
export type Cluster = typeof cluster.$inferSelect
export type Branch = typeof branch.$inferSelect
export type PaymentMethod = typeof paymentMethod.$inferSelect
export type WaterScheme = typeof waterScheme.$inferSelect
export type Customer = typeof customer.$inferSelect
export type BillingPeriod = typeof billingPeriod.$inferSelect
export type BillingRun = typeof billingRun.$inferSelect
export type BillingRecord = typeof billingRecord.$inferSelect
export type BillingUpload = typeof billingUpload.$inferSelect

export type IamRole = typeof iamRole.$inferSelect
export type IamPermission = typeof iamPermission.$inferSelect
export type IamRolePermission = typeof iamRolePermission.$inferSelect
export type DailyCollectionImport = typeof dailyCollectionImport.$inferSelect
export type DailyCollectionRecord = typeof dailyCollectionRecord.$inferSelect
export type ReconciliationMatch = typeof reconciliationMatch.$inferSelect
export type ReconciliationException = typeof reconciliationException.$inferSelect
export type ReconciliationApproval = typeof reconciliationApproval.$inferSelect
export type Notification = typeof notification.$inferSelect
