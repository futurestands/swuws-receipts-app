"use server"

import { db } from "@/lib/db"
import { waterSchemeSource, waterProductionLog, intelligenceFinding, waterScheme, user, branch, cluster } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import {
  canViewIntelligence,
  canInvestigateIntelligence,
  canDismissIntelligence,
} from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { runIntelligenceEngine } from "@/lib/intelligence/engine"
import { IntelligenceFilters, FindingStatus } from "@/lib/intelligence/types"
import { eq, and, desc, inArray, sql } from "drizzle-orm"
import { intelligenceMutationFilter } from "@/lib/production/scope"
import { productionService } from "@/lib/production/service"
import { ProductionError, type ProductionResult } from "@/lib/production/schemas"
import { applyIntelligenceSchemeFilter } from "@/lib/intelligence/scope"
import { revalidatePath } from "next/cache"
import { z, ZodError } from "zod"
import { recordSystemError } from "@/lib/system-errors"

/**
 * Fetch Main Executive Intelligence Dashboard Data
 */
export async function getIntelligenceDashboard(filters: IntelligenceFilters = {}) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to view Decision Support.")
  }

  const result = await runIntelligenceEngine(current, filters)
  return result
}

/**
 * Update Finding Status / Investigation Workflow
 */
export async function updateFindingStatus({
  findingId,
  status,
  resolutionNotes,
  assignedToUserId,
}: {
  findingId: string
  status: FindingStatus
  resolutionNotes?: string
  assignedToUserId?: string
}) {
  const current = await requireUser()
  z.object({ findingId: z.string().min(1).max(200), status: z.enum(["OPEN", "UNDER_INVESTIGATION", "RESOLVED", "DISMISSED"]), resolutionNotes: z.string().max(4000).optional(), assignedToUserId: z.string().min(1).max(200).optional() }).parse({ findingId, status, resolutionNotes, assignedToUserId })
  const closing = status === "RESOLVED" || status === "DISMISSED"
  if (!canViewIntelligence(current) || !(closing ? canDismissIntelligence(current) : canInvestigateIntelligence(current))) {
    throw new Error("Access Denied: You do not have permission to update intelligence findings.")
  }
  const scope = intelligenceMutationFilter(current, closing ? "intelligence.dismiss" : "intelligence.investigate")
  const scopedSchemes = sql`(select ${waterScheme.id} from ${waterScheme} where ${scope})`
  // Resolve dynamic findings from the authorised engine; never trust an arbitrary client ID.
  const generated = (await runIntelligenceEngine(current)).findings.find(f => f.id === findingId)
  const updatedRecord = {
    status,
    resolutionNotes: resolutionNotes || null,
    assignedToUserId: assignedToUserId || null,
    resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
    updatedAt: new Date(),
  }

  await db.transaction(async tx => {
    // Lock the ID, including the not-yet-persisted case, for safe concurrent workflows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`intelligence:${findingId}`}, 0))`)
    const [existing] = await tx.select().from(intelligenceFinding).where(and(eq(intelligenceFinding.id, findingId), inArray(intelligenceFinding.schemeId, scopedSchemes))).limit(1).for("update")
    const schemeId = existing?.schemeId ?? generated?.schemeId
    const [scheme] = schemeId ? await tx.select({ id: waterScheme.id, branchId: branch.id, clusterId: cluster.id, organizationId: cluster.organizationId }).from(waterScheme)
      .innerJoin(branch, eq(branch.id, waterScheme.branchId)).innerJoin(cluster, eq(cluster.id, branch.clusterId))
      .where(and(eq(waterScheme.id, schemeId), scope)).limit(1).for("share") : []
    if (!scheme?.organizationId || (!existing && !generated)) throw new Error("Finding is unavailable or outside your access")
    if (assignedToUserId) {
      const [assignee] = await tx.select().from(user).where(and(eq(user.id, assignedToUserId), eq(user.active, true), eq(user.organizationId, scheme.organizationId))).limit(1).for("share")
      if (!assignee || (assignee.schemeId && assignee.schemeId !== scheme.id) || (assignee.branchId && assignee.branchId !== scheme.branchId) || (assignee.clusterId && assignee.clusterId !== scheme.clusterId)) throw new Error("Assignee is unavailable or outside this scheme's organisation")
    }
    const generatedEvidence = generated ? {
      schemeId: scheme.id, organizationId: scheme.organizationId, branchId: scheme.branchId, clusterId: scheme.clusterId,
      category: generated.category, severity: generated.severity, title: generated.title, description: generated.description,
      evidence: { ...generated.evidence }, confidence: generated.confidence, reportingPeriod: generated.reportingPeriod,
      observation: generated.observation, recommendation: generated.recommendation,
    } : null
    if (existing) {
      // Scheme-based rule IDs may recur next month. Refresh evidence for this authorised
      // observation and retain the previous snapshot in the same immutable audit event.
      await tx.update(intelligenceFinding).set({ ...generatedEvidence, ...updatedRecord }).where(and(eq(intelligenceFinding.id, findingId), inArray(intelligenceFinding.schemeId, scopedSchemes)))
    } else {
      await tx.insert(intelligenceFinding).values({ id: findingId, ...generatedEvidence!, ...updatedRecord })
    }
    await writeAudit({
      user: { id: current.id, name: current.name || "User", email: current.email || "" },
      action: "intelligence.finding.update",
      entityType: "intelligence_finding",
      entityId: findingId,
      details: { before: existing ?? null, after: { ...generatedEvidence, ...updatedRecord } },
    }, tx)
  })
  revalidatePath("/intelligence", "layout")
  return { success: true }
}

/**
 * Scheme Intelligence Drill-down
 */
export async function getSchemeIntelligence(schemeId: string) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to view Decision Support.")
  }

  const [sch] = await db
    .select({
      id: waterScheme.id,
      name: waterScheme.name,
      code: waterScheme.code,
      serviceArea: waterScheme.serviceArea,
      branchId: waterScheme.branchId,
    })
    .from(waterScheme)
    .where(and(eq(waterScheme.id, schemeId), applyIntelligenceSchemeFilter(current, schemeId)))
    .limit(1)

  if (!sch) throw new Error("Scheme not found")

  // Fetch Scheme Sources
  const sources = await db
    .select()
    .from(waterSchemeSource)
    .where(and(eq(waterSchemeSource.schemeId, schemeId), eq(waterSchemeSource.active, true)))

  // Fetch Recent Production Logs
  const productionLogs = await db
    .select()
    .from(waterProductionLog)
    .where(eq(waterProductionLog.schemeId, schemeId))
    .orderBy(desc(waterProductionLog.logDate))
    .limit(30)

  // Run intelligence engine for this single scheme
  const result = await runIntelligenceEngine(current, { schemeId })

  return {
    scheme: sch,
    sources,
    productionLogs,
    findings: result.findings,
    kpis: result.kpis,
    periodChanges: result.periodChanges,
  }
}

export async function logProductionBatchAction(input: unknown) {
  return productionAction((service, user) => service.createBatch(user, input), true)
}

export async function logProductionIntervalAction(input: unknown) {
  return productionAction((service, user) => service.createInterval(user, input), true)
}


/** All public production actions validate again on the server, including direct invocations. */
async function productionAction<T>(work: (service: ReturnType<typeof productionService>, current: Awaited<ReturnType<typeof requireUser>>) => Promise<T>, mutate = false): Promise<ProductionResult<T>> {
  const current = await requireUser()
  try {
    const data = await work(productionService(), current)
    if (mutate) { revalidatePath("/intelligence", "layout"); revalidatePath("/decision-support", "layout") }
    return { ok: true, data }
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, code: "VALIDATION", message: "Check the entered values", fieldErrors: error.flatten().fieldErrors }
    if (error instanceof ProductionError) return { ok: false, code: error.code, message: error.message }
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : error
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null
    if (code === "23505") return { ok: false, code: "DUPLICATE", message: "An entry already exists for this source/day or retry key. Reload before continuing." }
    if (code === "23P01") return { ok: false, code: "CONFLICT", message: "The measurement interval overlaps an existing non-void record. Reload before continuing." }
    if (code === "23514" || code === "22003" || code === "23503") return { ok: false, code: "VALIDATION", message: "The record violates production integrity rules. Check its values and references." }
    if (code === "40P01" || code === "40001") return { ok: false, code: "CONFLICT", message: "Another update is in progress. Reload and retry." }
    await recordSystemError({ message: "Production operation failed", source: "server", path: "/intelligence", user: current })
    return { ok: false, code: "CONFIGURATION", message: "Production operation could not be completed. Contact an administrator." }
  }
}
export async function getProductionWorkspace(schemeId?: string, month?: string, cursor?: string) {
  return productionAction((service, user) => service.workspace(user, schemeId, month, cursor))
}
export async function getProductionHistory(id: string) {
  return productionAction((service, user) => service.history(user, id))
}
export async function logWaterProduction(data: unknown) {
  return productionAction((service, user) => service.create(user, data), true)
}
export async function editWaterProduction(data: unknown) {
  return productionAction((service, user) => service.edit(user, data), true)
}
export async function transitionWaterProduction(data: unknown) {
  return productionAction((service, user) => service.transition(user, data), true)
}
export async function reviewLegacyProduction(data: unknown) {
  return productionAction((service, user) => service.reviewLegacy(user, data), true)
}
export async function upsertWaterSchemeSource(data: unknown) {
  return productionAction((service, user) => service.saveSource(user, data), true)
}
export async function archiveWaterSchemeSource(data: unknown) {
  return productionAction((service, user) => service.archiveSource(user, data), true)
}
