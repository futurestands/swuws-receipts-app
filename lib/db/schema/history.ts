import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  bigint,
  index,
  unique,
} from "drizzle-orm/pg-core"
import { organization, waterScheme } from "./hierarchy"
import { reportGenerationHistory } from "./intelligence"
import { billingPeriod } from "./billing"
import { user } from "./auth"

export const sourceCapacityAssessment = pgTable(
  "source_capacity_assessment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    sourceId: text("sourceId").notNull(),
    schemeId: text("schemeId").notNull(),
    revision: integer("revision").notNull(),
    sourceVersionObserved: integer("sourceVersionObserved").notNull(),
    supersedesId: text("supersedesId").unique(),
    kind: text("kind").notNull(),
    classification: text("classification").notNull(),
    methodology: text("methodology").notNull(),
    methodologyVersion: text("methodologyVersion").notNull(),
    assessedAt: timestamp("assessedAt", { withTimezone: true }),
    effectiveFrom: date("effectiveFrom"),
    effectiveThrough: date("effectiveThrough"),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
    responsibleOfficerId: text("responsibleOfficerId").references(() => user.id, { onDelete: "restrict" }),
    capturedById: text("capturedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    installedRatingM3Hour: numeric("installedRatingM3Hour"),
    measuredYieldM3Hour: numeric("measuredYieldM3Hour"),
    regimeHoursPerDay: numeric("regimeHoursPerDay"),
    capacitySelection: text("capacitySelection").notNull(),
    capacityM3Day: numeric("capacityM3Day"),
    benchmarkCapacityM3Month: numeric("benchmarkCapacityM3Month"),
    benchmarkDays: integer("benchmarkDays"),
    sourceWasActive: boolean("sourceWasActive").notNull(),
    rawObservations: jsonb("rawObservations").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    provenance: jsonb("provenance").notNull(),
    hierarchySnapshot: jsonb("hierarchySnapshot").notNull(),
  },
  (table) => ({
    effectiveIdx: index("source_assessment_effective_idx").on(table.organizationId, table.sourceId, table.effectiveFrom),
    sourceRevUnq: unique("source_assessment_source_rev_unq").on(table.sourceId, table.revision),
    compositeUnq: unique("source_assessment_composite_unq").on(table.id, table.sourceId, table.schemeId, table.organizationId),
  })
)

export const schemeCapacityBaseline = pgTable(
  "scheme_capacity_baseline",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    periodMonth: date("periodMonth").notNull(),
    revision: integer("revision").notNull(),
    supersedesId: text("supersedesId").unique(),
    basis: text("basis").notNull(),
    selectionPolicy: text("selectionPolicy").notNull(),
    dayCount: integer("dayCount"),
    classification: text("classification").notNull(),
    completeness: text("completeness").notNull(),
    capacityM3: numeric("capacityM3"),
    expectedSourceCount: integer("expectedSourceCount").notNull(),
    sourceRoster: text("sourceRoster").array().notNull(),
    selectedById: text("selectedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
    creationTransactionId: bigint("creationTransactionId", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => ({
    periodIdx: index("scheme_baseline_period_idx").on(table.organizationId, table.schemeId, table.periodMonth),
    schemeMonthRevUnq: unique("scheme_baseline_scheme_month_rev_unq").on(table.schemeId, table.periodMonth, table.revision),
    compositeUnq: unique("scheme_baseline_composite_unq").on(table.id, table.schemeId, table.periodMonth, table.organizationId),
  })
)

export const schemeCapacityBaselineSource = pgTable(
  "scheme_capacity_baseline_source",
  {
    baselineId: text("baselineId").notNull(),
    organizationId: text("organizationId").notNull(),
    schemeId: text("schemeId").notNull(),
    periodMonth: date("periodMonth").notNull(),
    sourceId: text("sourceId").notNull(),
    assessmentId: text("assessmentId").notNull(),
    assessmentApprovalId: text("assessmentApprovalId").notNull(),
    contributionM3: numeric("contributionM3"),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => ({
    assessmentIdx: index("baseline_source_assessment_idx").on(table.assessmentId),
  })
)

export const schemeTargetDefinitionVersion = pgTable(
  "scheme_target_definition_version",
  {
    id: text("id").primaryKey(),
    definitionKey: text("definitionKey").notNull(),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    schemeId: text("schemeId").references(() => waterScheme.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    supersedesId: text("supersedesId").unique(),
    classification: text("classification").notNull(),
    formulaVersion: text("formulaVersion").notNull(),
    inputs: jsonb("inputs").notNull(),
    inputProvenance: jsonb("inputProvenance").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    originalSavedResults: jsonb("originalSavedResults").notNull(),
    provenance: jsonb("provenance").notNull(),
    createdById: text("createdById").notNull().references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    schemeIdx: index("target_definition_scheme_idx").on(table.organizationId, table.schemeId),
    defKeyRevUnq: unique("target_definition_key_rev_unq").on(table.definitionKey, table.revision),
    compositeUnq: unique("target_definition_composite_unq").on(table.id, table.definitionKey, table.organizationId),
  })
)

export const schemeTargetPeriodAssignment = pgTable(
  "scheme_target_period_assignment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    billingPeriodId: text("billingPeriodId").notNull().references(() => billingPeriod.id, { onDelete: "restrict" }),
    periodMonth: date("periodMonth").notNull(),
    revision: integer("revision").notNull(),
    supersedesId: text("supersedesId").unique(),
    targetDefinitionId: text("targetDefinitionId").notNull().references(() => schemeTargetDefinitionVersion.id, { onDelete: "restrict" }),
    definitionApprovalId: text("definitionApprovalId").notNull(),
    baselineId: text("baselineId").notNull(),
    baselineApprovalId: text("baselineApprovalId").notNull(),
    schemeTargetId: text("schemeTargetId"),
    assignedById: text("assignedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => ({
    periodIdx: index("target_assignment_period_idx").on(table.organizationId, table.schemeId, table.periodMonth),
    schemePeriodRevUnq: unique("target_assignment_scheme_period_rev_unq").on(table.schemeId, table.billingPeriodId, table.revision),
    compositeUnq: unique("target_assignment_composite_unq").on(table.id, table.schemeId, table.billingPeriodId, table.periodMonth, table.organizationId),
  })
)

export const decisionSupportReviewEvent = pgTable(
  "decision_support_review_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    assessmentId: text("assessmentId").references(() => sourceCapacityAssessment.id, { onDelete: "restrict" }),
    baselineId: text("baselineId").references(() => schemeCapacityBaseline.id, { onDelete: "restrict" }),
    targetDefinitionId: text("targetDefinitionId").references(() => schemeTargetDefinitionVersion.id, { onDelete: "restrict" }),
    targetAssignmentId: text("targetAssignmentId").references(() => schemeTargetPeriodAssignment.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    supersedesId: text("supersedesId").unique(),
    decision: text("decision").notNull(),
    reviewerId: text("reviewerId").notNull().references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
    authorizationEvidence: jsonb("authorizationEvidence").notNull(),
    provenance: jsonb("provenance").notNull(),
  }
)

export const decisionSupportReportSnapshot = pgTable(
  "decision_support_report_snapshot",
  {
    reportId: text("reportId").primaryKey().references(() => reportGenerationHistory.id, { onDelete: "restrict" }),
    organizationId: text("organizationId").notNull().references(() => organization.id, { onDelete: "restrict" }),
    billingPeriodId: text("billingPeriodId").notNull().references(() => billingPeriod.id, { onDelete: "restrict" }),
    periodMonth: date("periodMonth").notNull(),
    generatedById: text("generatedById").notNull().references(() => user.id, { onDelete: "restrict" }),
    recordedAt: timestamp("recordedAt", { withTimezone: true }).notNull().defaultNow(),
    creationTransactionId: bigint("creationTransactionId", { mode: "number" }).notNull(),
    formulaVersion: text("formulaVersion").notNull(),
    actualsAsOf: timestamp("actualsAsOf", { withTimezone: true }).notNull(),
    expectedSchemeCount: integer("expectedSchemeCount").notNull(),
    schemeRoster: text("schemeRoster").array().notNull(),
    payload: jsonb("payload").notNull(),
    payloadSha256: text("payloadSha256").notNull(),
  },
  (table) => ({
    compositeUnq: unique("report_snapshot_composite_unq").on(table.reportId, table.billingPeriodId, table.periodMonth, table.organizationId),
  })
)

export const decisionSupportReportSchemeReference = pgTable(
  "decision_support_report_scheme_reference",
  {
    reportId: text("reportId").notNull(),
    organizationId: text("organizationId").notNull(),
    billingPeriodId: text("billingPeriodId").notNull(),
    periodMonth: date("periodMonth").notNull(),
    schemeId: text("schemeId").notNull().references(() => waterScheme.id, { onDelete: "restrict" }),
    capacityState: text("capacityState").notNull(),
    baselineId: text("baselineId"),
    baselineApprovalId: text("baselineApprovalId"),
    targetState: text("targetState").notNull(),
    targetAssignmentId: text("targetAssignmentId"),
    assignmentApprovalId: text("assignmentApprovalId"),
    reason: text("reason").notNull(),
  }
)

export type SourceCapacityAssessment = typeof sourceCapacityAssessment.$inferSelect
export type SchemeCapacityBaseline = typeof schemeCapacityBaseline.$inferSelect
export type SchemeCapacityBaselineSource = typeof schemeCapacityBaselineSource.$inferSelect
export type SchemeTargetDefinitionVersion = typeof schemeTargetDefinitionVersion.$inferSelect
export type SchemeTargetPeriodAssignment = typeof schemeTargetPeriodAssignment.$inferSelect
export type DecisionSupportReviewEvent = typeof decisionSupportReviewEvent.$inferSelect
export type DecisionSupportReportSnapshot = typeof decisionSupportReportSnapshot.$inferSelect
export type DecisionSupportReportSchemeReference = typeof decisionSupportReportSchemeReference.$inferSelect
