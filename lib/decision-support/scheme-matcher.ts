import { db } from "@/lib/db"
import { waterScheme, branch, cluster, organization, decisionSupportSchemeMapping } from "@/lib/db/schema"
import { parseExcelReferenceDataset } from "./excel-reference"
import { eq, inArray } from "drizzle-orm"

export type MatchStatus =
  | "EXACT_NAME_MATCH"
  | "NORMALIZED_NAME_MATCH"
  | "REQUIRES_MANUAL_APPROVAL"
  | "UNMATCHED_REFERENCE_SCHEME"

export interface ReconciledSchemeItem {
  excelNumber: number | string
  excelArea: string
  excelSchemeName: string
  matchStatus: MatchStatus
  matchMethod: string
  portalSchemeId: string | null
  portalSchemeName: string | null
  portalSchemeCode: string | null
  portalBranchId: string | null
  portalBranchName: string | null
  portalClusterId: string | null
  portalClusterName: string | null
  portalOrgId: string | null
  portalOrgName: string | null
}

export interface FullReconciliationReport {
  totalExcelOperationalSchemes: number
  totalLivePortalSchemes: number
  approvedMatchesCount: number
  unmatchedCount: number
  reconciledSchemes: ReconciledSchemeItem[]
}

export async function performSchemeReconciliation(): Promise<FullReconciliationReport> {
  const ref = parseExcelReferenceDataset()
  const opSchemes = ref.schemes.filter((s) => s.isOperationalScheme)

  // Fetch all active DB schemes
  const dbRows = await db
    .select({
      schemeId: waterScheme.id,
      schemeName: waterScheme.name,
      schemeCode: waterScheme.code,
      branchId: branch.id,
      branchName: branch.name,
      clusterId: cluster.id,
      clusterName: cluster.name,
      orgId: organization.id,
      orgName: organization.name,
    })
    .from(waterScheme)
    .leftJoin(branch, eq(waterScheme.branchId, branch.id))
    .leftJoin(cluster, eq(branch.clusterId, cluster.id))
    .leftJoin(organization, eq(cluster.organizationId, organization.id))
    .where(eq(waterScheme.active, true))

  const dbByName = new Map<string, typeof dbRows[0]>()
  dbRows.forEach((r) => {
    if (r.schemeName) dbByName.set(r.schemeName.toLowerCase().trim(), r)
  })

  let approvedMatchesCount = 0
  let unmatchedCount = 0

  const reconciledSchemes: ReconciledSchemeItem[] = opSchemes.map((es) => {
    const norm = es.schemeName.toLowerCase().trim()
    const match = dbByName.get(norm)

    if (match) {
      approvedMatchesCount++
      return {
        excelNumber: es.schemeNumber,
        excelArea: es.areaName,
        excelSchemeName: es.schemeName,
        matchStatus: "EXACT_NAME_MATCH",
        matchMethod: "Exact case-insensitive scheme name match",
        portalSchemeId: match.schemeId,
        portalSchemeName: match.schemeName,
        portalSchemeCode: match.schemeCode,
        portalBranchId: match.branchId,
        portalBranchName: match.branchName,
        portalClusterId: match.clusterId,
        portalClusterName: match.clusterName,
        portalOrgId: match.orgId,
        portalOrgName: match.orgName,
      }
    }

    unmatchedCount++
    return {
      excelNumber: es.schemeNumber,
      excelArea: es.areaName,
      excelSchemeName: es.schemeName,
      matchStatus: "UNMATCHED_REFERENCE_SCHEME",
      matchMethod: "No exact active water_scheme found in database",
      portalSchemeId: null,
      portalSchemeName: null,
      portalSchemeCode: null,
      portalBranchId: null,
      portalBranchName: null,
      portalClusterId: null,
      portalClusterName: null,
      portalOrgId: null,
      portalOrgName: null,
    }
  })

  return {
    totalExcelOperationalSchemes: opSchemes.length,
    totalLivePortalSchemes: dbRows.length,
    approvedMatchesCount,
    unmatchedCount,
    reconciledSchemes,
  }
}
