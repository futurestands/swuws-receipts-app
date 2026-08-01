import { listAgents, getAuditLogs, getSystemStats, getCollectionsSummary, getPrintingReports } from "@/app/actions/admin"
import { listClusters, listBranches, listPaymentMethods, listWaterSchemes, getSettings } from "@/app/actions/settings"
import { getCollectionPeriods } from "@/app/actions/billing"
import { AdminTabs } from "@/app/admin/admin-tabs"
import { getCurrentUser } from "@/lib/session"
import { listRoles, listAllPermissions, seedV12Permissions } from "@/app/actions/iam"
import { listAllTariffs } from "@/app/actions/billing-engine"
import { listTemplates, seedSystemTemplates } from "@/app/actions/template-actions"
import {
  canManageUsers,
  canManageSchemes,
  canManageAreas,
  canConfigureSystem,
  canAudit,
  canViewReports,
  canAccessAdminConsole
} from "@/lib/permissions"

export default async function AdminPage() {
  // Re-triggering route detection
  const current = await getCurrentUser()

  // Seed system templates on load for this version (v1.2)
  if (current && canConfigureSystem(current)) {
    try {
      await seedV12Permissions()
      await seedSystemTemplates()
    } catch (e) {
      console.error("Admin: Seeding failed", e)
    }
  }

  const canManageUsersVal = current ? canManageUsers(current) : false
  const canAuditVal = current ? canAudit(current) : false
  const canViewReportsVal = current ? canViewReports(current) : false
  const canManageHierarchyVal = current ? (canManageSchemes(current) || canManageAreas(current)) : false
  const canConfigureSystemVal = current ? canConfigureSystem(current) : false
  const canManageIAMVal = current ? (current.permissions?.includes("roles.view") || current.permissions?.includes("permissions.view")) : false

  const [agentsResult, auditLogs, stats, collections, printingStats, clusters, branches, methods, schemes, settings, periods, iamRoles, allPermissions, tariffs, templates] = await Promise.all([
    canManageUsersVal
      ? listAgents({ page: 1, pageSize: 25 }).catch(() => ({ agents: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }))
      : Promise.resolve({ agents: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }),
    canAuditVal ? getAuditLogs(200).catch(() => []) : Promise.resolve([]),
    canViewReportsVal ? getSystemStats().catch(() => ({ agentCount: 0, receiptCount: 0, receiptTotal: 0 })) : Promise.resolve({ agentCount: 0, receiptCount: 0, receiptTotal: 0 }),
    canViewReportsVal ? getCollectionsSummary().catch(() => ({ perAgent: [], totalCount: 0, totalAmount: 0 })) : Promise.resolve({ perAgent: [], totalCount: 0, totalAmount: 0 }),
    canViewReportsVal ? getPrintingReports().catch(() => ({ mostReprinted: [], byUser: [], byBranch: [], dailySummary: [], byScheme: [], recentPrints: [] })) : Promise.resolve({ mostReprinted: [], byUser: [], byBranch: [], dailySummary: [], byScheme: [], recentPrints: [] }),
    canManageHierarchyVal ? listClusters().catch(() => []) : Promise.resolve([]),
    canManageHierarchyVal ? listBranches().catch(() => []) : Promise.resolve([]),
    canConfigureSystemVal ? listPaymentMethods().catch(() => []) : Promise.resolve([]),
    canManageHierarchyVal ? listWaterSchemes().catch(() => []) : Promise.resolve([]),
    getSettings(), // Settings is readable by all for branding
    getCollectionPeriods().catch(() => []),
    canManageIAMVal ? listRoles().catch(() => []) : Promise.resolve([]),
    canManageIAMVal ? listAllPermissions().catch(() => []) : Promise.resolve([]),
    canConfigureSystemVal ? listAllTariffs().catch(() => []) : Promise.resolve([]),
    canConfigureSystemVal ? listTemplates().catch(() => []) : Promise.resolve([]),
  ])

  const permissions = {
    canManageUsers: canManageUsersVal,
    canManageHierarchy: canManageHierarchyVal,
    canConfigureSystem: canConfigureSystemVal,
    canAudit: canAuditVal,
    canViewReports: canViewReportsVal,
    canManageIAM: canManageIAMVal,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Manage agents, branches, payment methods, branding, and review the audit trail.
        </p>
      </div>
      <AdminTabs
        agents={agentsResult.agents}
        agentsTotal={agentsResult.total}
        agentsPage={agentsResult.page}
        agentsPageSize={agentsResult.pageSize}
        agentsTotalPages={agentsResult.totalPages}
        auditLogs={auditLogs}
        stats={stats}
        collections={collections}
        printingStats={printingStats}
        clusters={clusters}
        branches={branches}
        methods={methods}
        schemes={schemes}
        settings={settings}
        permissions={permissions}
        periods={periods}
        iamRoles={iamRoles}
        allPermissions={allPermissions}
        tariffs={tariffs}
        templates={templates}
      />
    </div>
  )
}
