"use server"

import { db } from "@/lib/db"
import { waterSchemeSource, waterProductionLog, intelligenceFinding, waterScheme } from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import {
  canViewIntelligence,
  canInvestigateIntelligence,
  canDismissIntelligence,
} from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { runIntelligenceEngine } from "@/lib/intelligence/engine"
import { IntelligenceFilters, FindingStatus } from "@/lib/intelligence/types"
import { eq, and, desc } from "drizzle-orm"
import { productionService } from "@/lib/production/service"
import { ProductionError, type ProductionResult } from "@/lib/production/schemas"
import { applyIntelligenceSchemeFilter } from "@/lib/intelligence/scope"
import { revalidatePath } from "next/cache"
import { ZodError } from "zod"
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
  if (!canInvestigateIntelligence(current) && !canDismissIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to update intelligence findings.")
  }

  // Check if finding exists in DB or insert it if it was dynamically generated
  const [existing] = await db
    .select()
    .from(intelligenceFinding)
    .where(eq(intelligenceFinding.id, findingId))
    .limit(1)

  const updatedRecord = {
    status,
    resolutionNotes: resolutionNotes || null,
    assignedToUserId: assignedToUserId || null,
    resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
    updatedAt: new Date(),
  }

  if (existing) {
    await db
      .update(intelligenceFinding)
      .set(updatedRecord)
      .where(eq(intelligenceFinding.id, findingId))
  } else {
    await db.insert(intelligenceFinding).values({
      id: findingId,
      category: "anomaly",
      severity: "high",
      title: "Intelligence Finding Investigation",
      description: "Dynamically flagged intelligence item updated by officer.",
      evidence: {},
      confidence: "HIGH",
      status,
      resolutionNotes: resolutionNotes || null,
      assignedToUserId: assignedToUserId || null,
      resolvedAt: status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
    })
  }

  // Audit Logging
  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "intelligence.finding.update",
    entityType: "intelligence_finding",
    entityId: findingId,
    details: {
      status,
      resolutionNotes,
      assignedToUserId,
    },
  })

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
