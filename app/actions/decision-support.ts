"use server"

import { db } from "@/lib/db"
import {
  managementAction,
  reportGenerationHistory,
  intelligenceFinding,
  waterScheme,
  decisionSupportSchemeMapping,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import { canViewIntelligence, canInvestigateIntelligence, canExportReports, canManageIntelligenceRules } from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { getTrustedPerformanceDataset } from "@/lib/decision-support/performance-engine"
import { generateManagementAttentionItems } from "@/lib/decision-support/attention-engine"
import { generateManagementReport } from "@/lib/decision-support/reports"
import { generateBoardPackPptx } from "@/lib/decision-support/board-pack"
import { performSchemeReconciliation } from "@/lib/decision-support/scheme-matcher"
import { eq, desc, and } from "drizzle-orm"
import { randomUUID } from "crypto"

export async function getDecisionSupportOverviewAction(
  periodId?: string,
  schemeId?: string
) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to view Decision Support.")
  }

  const dataset = await getTrustedPerformanceDataset(current, periodId, schemeId)
  const attentionItems = generateManagementAttentionItems(dataset)

  // Fetch Management Actions
  const actions = await db
    .select()
    .from(managementAction)
    .orderBy(desc(managementAction.createdAt))
    .limit(20)

  return {
    dataset,
    attentionItems,
    actions,
  }
}

export async function generateBoardPackPptxAction(periodId?: string, schemeId?: string) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to generate Board Packs.")
  }

  const dataset = await getTrustedPerformanceDataset(current, periodId, schemeId)
  const pptxBuffer = await generateBoardPackPptx(dataset)

  // Record in History
  const historyId = `rep-${randomUUID()}`
  await db.insert(reportGenerationHistory).values({
    id: historyId,
    reportType: "board_pack_pptx",
    periodId: dataset.period.id !== "active" ? dataset.period.id : null,
    scopeLevel: dataset.scope.level,
    scopeId: dataset.scope.id || null,
    generatedById: current.id,
    fileFormat: "pptx",
    metadata: {
      periodName: dataset.period.periodName,
      waterProducedM3: dataset.kpis.waterProducedM3,
      currentBilledUgx: dataset.kpis.currentBilledUgx,
    },
  })

  // Audit Logging
  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "decision_support.board_pack.generate",
    entityType: "report_generation_history",
    entityId: historyId,
    details: {
      reportType: "board_pack_pptx",
      periodName: dataset.period.periodName,
    },
  })

  return {
    success: true,
    base64Pptx: pptxBuffer.toString("base64"),
    filename: `SWUWS_Board_Pack_${dataset.period.periodName.replace(/\s+/g, "_")}.pptx`,
  }
}

export async function generateManagementReportAction(
  reportType: "monthly_management" | "production_capacity" | "nrw_loss" | "commercial_performance",
  periodId?: string,
  schemeId?: string
) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to generate Management Reports.")
  }

  const dataset = await getTrustedPerformanceDataset(current, periodId, schemeId)
  const report = generateManagementReport(reportType, dataset)

  // Audit Logging
  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "decision_support.report.generate",
    entityType: "report",
    details: {
      reportType,
      periodName: dataset.period.periodName,
    },
  })

  return report
}

export async function createManagementActionAction(data: {
  findingId?: string
  title: string
  description: string
  responsibleUserId?: string
  dueDate: string
  priority?: "critical" | "high" | "normal" | "low"
}) {
  const current = await requireUser()
  if (!canInvestigateIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to create Management Actions.")
  }

  const actionId = `act-${randomUUID()}`

  await db.insert(managementAction).values({
    id: actionId,
    findingId: data.findingId || null,
    title: data.title,
    description: data.description,
    responsibleUserId: data.responsibleUserId || current.id,
    dueDate: new Date(data.dueDate),
    status: "OPEN",
    priority: data.priority || "normal",
    createdById: current.id,
  })

  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "decision_support.action.create",
    entityType: "management_action",
    entityId: actionId,
    details: { title: data.title, dueDate: data.dueDate },
  })

  return { success: true, id: actionId }
}

export async function updateManagementActionStatusAction(data: {
  actionId: string
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "RESOLVED" | "CLOSED"
  resolutionNotes?: string
  closureEvidenceUrl?: string
}) {
  const current = await requireUser()
  if (!canInvestigateIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to update Management Actions.")
  }

  await db
    .update(managementAction)
    .set({
      status: data.status,
      resolutionNotes: data.resolutionNotes || null,
      closureEvidenceUrl: data.closureEvidenceUrl || null,
      closedAt: data.status === "CLOSED" || data.status === "RESOLVED" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(managementAction.id, data.actionId))

  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "decision_support.action.update",
    entityType: "management_action",
    entityId: data.actionId,
    details: { status: data.status, notes: data.resolutionNotes },
  })

  return { success: true }
}

export async function getSchemeReconciliationAction() {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to view Decision Support Scheme Reconciliation.")
  }

  const report = await performSchemeReconciliation()

  // Also fetch any manual mapping overrides from decision_support_scheme_mapping
  const existingMappings = await db.select().from(decisionSupportSchemeMapping)
  const mapByExcelName = new Map<string, typeof existingMappings[0]>()
  existingMappings.forEach((m) => {
    mapByExcelName.set(m.excelSchemeName.toLowerCase().trim(), m)
  })

  // Apply manual approval overrides if present
  const reconciledSchemes = report.reconciledSchemes.map((s) => {
    const override = mapByExcelName.get(s.excelSchemeName.toLowerCase().trim())
    if (override) {
      return {
        ...s,
        approved: override.approved,
        matchStatus: override.matchStatus as any,
        matchMethod: override.matchMethod,
        portalSchemeId: override.waterSchemeId || s.portalSchemeId,
      }
    }
    return s
  })

  return {
    ...report,
    reconciledSchemes,
  }
}

export async function approveSchemeMappingAction(data: {
  excelArea: string
  excelSchemeName: string
  portalSchemeId: string
  matchStatus: "APPROVED_EXACT_MATCH" | "APPROVED_NORMALIZED_MATCH" | "REQUIRES_MANUAL_APPROVAL" | "HIERARCHY_MISMATCH" | "UNMATCHED_REFERENCE_SCHEME"
  matchMethod: string
}) {
  const current = await requireUser()
  if (!canManageIntelligenceRules(current) && !canInvestigateIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to approve Scheme Mappings.")
  }

  const mappingId = `map-${randomUUID()}`

  await db
    .insert(decisionSupportSchemeMapping)
    .values({
      id: mappingId,
      waterSchemeId: data.portalSchemeId || null,
      excelArea: data.excelArea,
      excelSchemeName: data.excelSchemeName,
      matchStatus: data.matchStatus,
      matchMethod: data.matchMethod,
      approved: true,
      approvedById: current.id,
      approvedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: decisionSupportSchemeMapping.id,
      set: {
        waterSchemeId: data.portalSchemeId || null,
        matchStatus: data.matchStatus,
        matchMethod: data.matchMethod,
        approved: true,
        approvedById: current.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      },
    })

  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "decision_support.scheme_mapping.approve",
    entityType: "decision_support_scheme_mapping",
    entityId: mappingId,
    details: {
      excelSchemeName: data.excelSchemeName,
      excelArea: data.excelArea,
      portalSchemeId: data.portalSchemeId,
      matchStatus: data.matchStatus,
    },
  })

  return { success: true, id: mappingId }
}

