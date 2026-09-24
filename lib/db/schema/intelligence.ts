import {
  pgTable,
  text,
  timestamp,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { organization, cluster, branch, waterScheme } from "./hierarchy"
import { billingPeriod } from "./billing"

/**
 * Water Scheme Sources (Gravity springs, pumped boreholes, solar/grid/generator).
 */
export const waterSchemeSource = pgTable(
  "water_scheme_source",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "cascade" }),
    sourceName: text("sourceName").notNull(),
    technology: text("technology").notNull().default("gravity"), // 'gravity' | 'pumped_grid' | 'pumped_solar' | 'pumped_generator' | 'hybrid'
    installedPumpCapacityM3Hr: numeric("installedPumpCapacityM3Hr", { precision: 12, scale: 2 }).default("0"),
    regimeHoursPerDay: numeric("regimeHoursPerDay", { precision: 5, scale: 2 }).default("24"),
    containerVolumeLitres: numeric("containerVolumeLitres", { precision: 12, scale: 2 }).default("0"),
    averageFillTimeSeconds: numeric("averageFillTimeSeconds", { precision: 12, scale: 2 }).default("0"),
    productionCapacityLSec: numeric("productionCapacityLSec", { precision: 12, scale: 4 }).default("0"),
    currentCapacityM3Day: numeric("currentCapacityM3Day", { precision: 12, scale: 2 }).default("0"),
    practicalCapacityM3Month: numeric("practicalCapacityM3Month", { precision: 12, scale: 2 }).default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("water_scheme_source_scheme_idx").on(table.schemeId),
  })
)

/**
 * Water Production Log (Daily/Monthly produced & supplied m3).
 */
export const waterProductionLog = pgTable(
  "water_production_log",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "cascade" }),
    sourceId: text("sourceId").references(() => waterSchemeSource.id, { onDelete: "set null" }),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    logDate: timestamp("logDate").notNull(),
    waterProducedM3: numeric("waterProducedM3", { precision: 12, scale: 2 }).notNull().default("0"),
    waterSuppliedM3: numeric("waterSuppliedM3", { precision: 12, scale: 2 }).default("0"),
    operatingHours: numeric("operatingHours", { precision: 5, scale: 2 }),
    status: text("status").notNull().default("entered"), // 'entered' | 'verified' | 'flagged'
    recordedById: text("recordedById").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemePeriodIdx: index("water_production_log_scheme_period_idx").on(table.schemeId, table.billingPeriodId),
    logDateIdx: index("water_production_log_date_idx").on(table.logDate),
  })
)

/**
 * Operational Scheme Targets.
 */
export const schemeTarget = pgTable(
  "scheme_target",
  {
    id: text("id").primaryKey(),
    schemeId: text("schemeId")
      .notNull()
      .references(() => waterScheme.id, { onDelete: "cascade" }),
    billingPeriodId: text("billingPeriodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    targetProductionM3: numeric("targetProductionM3", { precision: 12, scale: 2 }),
    targetNrwPercent: numeric("targetNrwPercent", { precision: 5, scale: 2 }),
    targetCapacityUtilisationPercent: numeric("targetCapacityUtilisationPercent", { precision: 5, scale: 2 }),
    targetCollectionEfficiencyPercent: numeric("targetCollectionEfficiencyPercent", { precision: 5, scale: 2 }),
    targetBillingUgx: numeric("targetBillingUgx", { precision: 12, scale: 2 }),
    targetArrearsRecoveryUgx: numeric("targetArrearsRecoveryUgx", { precision: 12, scale: 2 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemePeriodUnq: uniqueIndex("scheme_target_scheme_period_unq").on(table.schemeId, table.billingPeriodId),
  })
)

/**
 * Intelligence Finding (Evidence-based anomaly detection).
 */
export const intelligenceFinding = pgTable(
  "intelligence_finding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").references(() => organization.id, { onDelete: "set null" }),
    clusterId: text("clusterId").references(() => cluster.id, { onDelete: "set null" }),
    branchId: text("branchId").references(() => branch.id, { onDelete: "set null" }),
    schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    sourceId: text("sourceId").references(() => waterSchemeSource.id, { onDelete: "set null" }),

    category: text("category").notNull(), // 'data_quality' | 'production' | 'capacity' | 'nrw' | 'commercial' | 'target' | 'trend'
    severity: text("severity").notNull(), // 'critical' | 'high' | 'watch' | 'info'
    title: text("title").notNull(),
    description: text("description").notNull(),
    observation: text("observation"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    recommendation: text("recommendation"),
    confidence: text("confidence").notNull().default("HIGH"), // 'HIGH' | 'MEDIUM' | 'LOW'

    reportingPeriod: text("reportingPeriod"),
    status: text("status").notNull().default("OPEN"), // 'OPEN' | 'UNDER_INVESTIGATION' | 'RESOLVED' | 'DISMISSED'
    assignedToUserId: text("assignedToUserId").references(() => user.id, { onDelete: "set null" }),
    resolutionNotes: text("resolutionNotes"),
    resolvedAt: timestamp("resolvedAt"),

    detectedAt: timestamp("detectedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("intel_finding_scheme_idx").on(table.schemeId),
    categoryIdx: index("intel_finding_cat_idx").on(table.category),
    severityIdx: index("intel_finding_sev_idx").on(table.severity),
    statusIdx: index("intel_finding_status_idx").on(table.status),
    detectedIdx: index("intel_finding_detected_idx").on(table.detectedAt),
  })
)

/**
 * Intelligence Rule configuration.
 */
export const intelligenceRule = pgTable(
  "intelligence_rule",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(), // e.g. 'RULE_CAPACITY_OVER_UTILIZED'
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    threshold: jsonb("threshold").$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    codeUnq: uniqueIndex("intel_rule_code_unq").on(table.code),
  })
)

export type WaterSchemeSource = typeof waterSchemeSource.$inferSelect
export type WaterProductionLog = typeof waterProductionLog.$inferSelect
export type SchemeTarget = typeof schemeTarget.$inferSelect
export type IntelligenceFinding = typeof intelligenceFinding.$inferSelect
export type IntelligenceRule = typeof intelligenceRule.$inferSelect

/**
 * Management Action Register.
 */
export const managementAction = pgTable(
  "management_action",
  {
    id: text("id").primaryKey(),
    findingId: text("findingId").references(() => intelligenceFinding.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    responsibleUserId: text("responsibleUserId").references(() => user.id, { onDelete: "set null" }),
    responsibleScope: text("responsibleScope"), // 'organization' | 'cluster' | 'branch' | 'scheme'
    dueDate: timestamp("dueDate").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN, ASSIGNED, IN_PROGRESS, PENDING_VERIFICATION, RESOLVED, CLOSED
    priority: text("priority").notNull().default("normal"), // critical, high, normal, low
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    resolutionNotes: text("resolutionNotes"),
    closureEvidenceUrl: text("closureEvidenceUrl"),
    closedAt: timestamp("closedAt"),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    findingIdx: index("mgmt_action_finding_idx").on(table.findingId),
    responsibleIdx: index("mgmt_action_resp_user_idx").on(table.responsibleUserId),
    statusIdx: index("mgmt_action_status_idx").on(table.status),
    dueDateIdx: index("mgmt_action_due_date_idx").on(table.dueDate),
  })
)

/**
 * Institutional Report & Board Pack Generation History.
 */
export const reportGenerationHistory = pgTable(
  "report_generation_history",
  {
    id: text("id").primaryKey(),
    reportType: text("reportType").notNull(), // 'board_pack_pptx' | 'monthly_management' | 'production_capacity' | 'nrw_loss' | 'commercial_performance'
    periodId: text("periodId").references(() => billingPeriod.id, { onDelete: "set null" }),
    scopeLevel: text("scopeLevel").notNull().default("organization"), // 'organization' | 'cluster' | 'branch' | 'scheme'
    scopeId: text("scopeId"),
    generatedById: text("generatedById").references(() => user.id, { onDelete: "set null" }),
    fileFormat: text("fileFormat").notNull().default("pptx"), // 'pptx' | 'pdf' | 'html'
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    periodIdx: index("report_history_period_idx").on(table.periodId),
    userIdx: index("report_history_user_idx").on(table.generatedById),
    typeIdx: index("report_history_type_idx").on(table.reportType),
  })
)

export type ManagementAction = typeof managementAction.$inferSelect
export type ReportGenerationHistory = typeof reportGenerationHistory.$inferSelect

/**
 * Auditable Scheme Mapping between Excel Reference Names and Live DB water_scheme.id
 */
export const decisionSupportSchemeMapping = pgTable(
  "decision_support_scheme_mapping",
  {
    id: text("id").primaryKey(),
    waterSchemeId: text("waterSchemeId").references(() => waterScheme.id, { onDelete: "set null" }),
    excelArea: text("excelArea").notNull(),
    excelSchemeName: text("excelSchemeName").notNull(),
    matchStatus: text("matchStatus").notNull(), // 'EXACT_NAME_MATCH' | 'NORMALIZED_NAME_MATCH' | 'REQUIRES_MANUAL_APPROVAL' | 'UNMATCHED_REFERENCE_SCHEME'
    matchMethod: text("matchMethod").notNull(),
    approved: boolean("approved").notNull().default(true),
    approvedById: text("approvedById").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approvedAt").defaultNow(),
    source: text("source").notNull().default("SWUWS Excel Reference Dataset (global target.xlsx)"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("ds_scheme_map_scheme_idx").on(table.waterSchemeId),
    statusIdx: index("ds_scheme_map_status_idx").on(table.matchStatus),
  })
)

export type DecisionSupportSchemeMapping = typeof decisionSupportSchemeMapping.$inferSelect
