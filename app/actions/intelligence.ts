"use server"

import { db } from "@/lib/db"
import {
  waterSchemeSource,
  waterProductionLog,
  intelligenceFinding,
  waterScheme,
  branch,
  cluster,
  billingPeriod,
  meterReading,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/session"
import {
  canViewIntelligence,
  canInvestigateIntelligence,
  canDismissIntelligence,
} from "@/lib/permissions"
import { writeAudit } from "@/lib/audit"
import { runIntelligenceEngine } from "@/lib/intelligence/engine"
import { IntelligenceFilters, FindingStatus } from "@/lib/intelligence/types"
import { eq, and, desc, sql } from "drizzle-orm"
import { randomUUID } from "crypto"

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
    .where(eq(waterScheme.id, schemeId))
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

/**
 * Upsert Water Scheme Source
 */
export async function upsertWaterSchemeSource(data: {
  id?: string
  schemeId: string
  sourceName: string
  technology: string
  installedPumpCapacityM3Hr?: number
  regimeHoursPerDay?: number
  containerVolumeLitres?: number
  averageFillTimeSeconds?: number
}) {
  const current = await requireUser()
  if (!canInvestigateIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to configure scheme sources.")
  }

  const sourceId = data.id || `src-${randomUUID()}`

  // Calculate Practical Monthly Capacity (m3/month)
  const hours = data.regimeHoursPerDay || 24
  const pumpCapacity = data.installedPumpCapacityM3Hr || 0
  const m3Day = pumpCapacity > 0 ? pumpCapacity * hours : 100
  const m3Month = m3Day * 30

  await db
    .insert(waterSchemeSource)
    .values({
      id: sourceId,
      schemeId: data.schemeId,
      sourceName: data.sourceName,
      technology: data.technology,
      installedPumpCapacityM3Hr: String(data.installedPumpCapacityM3Hr || 0),
      regimeHoursPerDay: String(data.regimeHoursPerDay || 24),
      containerVolumeLitres: String(data.containerVolumeLitres || 0),
      averageFillTimeSeconds: String(data.averageFillTimeSeconds || 0),
      currentCapacityM3Day: String(m3Day),
      practicalCapacityM3Month: String(m3Month),
      active: true,
    })
    .onConflictDoUpdate({
      target: [waterSchemeSource.id],
      set: {
        sourceName: data.sourceName,
        technology: data.technology,
        installedPumpCapacityM3Hr: String(data.installedPumpCapacityM3Hr || 0),
        regimeHoursPerDay: String(data.regimeHoursPerDay || 24),
        currentCapacityM3Day: String(m3Day),
        practicalCapacityM3Month: String(m3Month),
        updatedAt: new Date(),
      },
    })

  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "intelligence.source.upsert",
    entityType: "water_scheme_source",
    entityId: sourceId,
    details: { schemeId: data.schemeId, sourceName: data.sourceName },
  })

  return { success: true, id: sourceId }
}

/**
 * Log Daily Water Production
 */
export async function logWaterProduction(data: {
  schemeId: string
  sourceId?: string
  billingPeriodId?: string
  logDate: string
  waterProducedM3: number
  waterSuppliedM3?: number
  operatingHours?: number
  notes?: string
}) {
  const current = await requireUser()
  if (!canViewIntelligence(current)) {
    throw new Error("Access Denied: You do not have permission to log water production.")
  }

  const logId = `prod-${randomUUID()}`

  await db.insert(waterProductionLog).values({
    id: logId,
    schemeId: data.schemeId,
    sourceId: data.sourceId || null,
    billingPeriodId: data.billingPeriodId || null,
    logDate: new Date(data.logDate),
    waterProducedM3: String(data.waterProducedM3),
    waterSuppliedM3: String(data.waterSuppliedM3 || data.waterProducedM3),
    operatingHours: data.operatingHours ? String(data.operatingHours) : null,
    status: "entered",
    recordedById: current.id,
    notes: data.notes || null,
  })

  await writeAudit({
    user: { id: current.id, name: current.name || "User", email: current.email || "" },
    action: "intelligence.production.log",
    entityType: "water_production_log",
    entityId: logId,
    details: { schemeId: data.schemeId, waterProducedM3: data.waterProducedM3 },
  })

  return { success: true, id: logId }
}
