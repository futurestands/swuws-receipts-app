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
    await seedV12Permissions()
    await seedSystemTemplates()
  }

  const canManageUsersVal = current ? canManageUsers(current) : false
  const canAuditVal = current ? canAudit(current) : false
  const canViewReportsVal = current ? canViewReports(current) : false
  const canManageHierarchyVal = current ? (canManageSchemes(current) || canManageAreas(current)) : false
  const canConfigureSystemVal = current ? canConfigureSystem(current) : false
  const canManageIAMVal = current ? (current.permissions?.includes("roles.view") || current.permissions?.includes("permissions.view")) : false

  const [agents, auditLogs, stats, collections, printingStats, clusters, branches, methods, schemes, settings, periods, iamRoles, allPermissions, tariffs, templates] = await Promise.all([
    canManageUsersVal ? listAgents() : Promise.resolve([]),
    canAuditVal ? getAuditLogs(200) : Promise.resolve([]),
    canViewReportsVal ? getSystemStats() : Promise.resolve({ agentCount: 0, receiptCount: 0, receiptTotal: 0 }),
    canViewReportsVal ? getCollectionsSummary() : Promise.resolve({ perAgent: [], totalCount: 0, totalAmount: 0 }),
    canViewReportsVal ? getPrintingReports() : Promise.resolve({ mostReprinted: [], byUser: [], byBranch: [], dailySummary: [], byScheme: [], recentPrints: [] }),
    canManageHierarchyVal ? listClusters() : Promise.resolve([]),
    canManageHierarchyVal ? listBranches() : Promise.resolve([]),
    canConfigureSystemVal ? listPaymentMethods() : Promise.resolve([]),
    canManageHierarchyVal ? listWaterSchemes() : Promise.resolve([]),
    getSettings(), // Settings is readable by all for branding
    getCollectionPeriods(),
    canManageIAMVal ? listRoles() : Promise.resolve([]),
    canManageIAMVal ? listAllPermissions() : Promise.resolve([]),
    canConfigureSystemVal ? listAllTariffs() : Promise.resolve([]),
    canConfigureSystemVal ? listTemplates() : Promise.resolve([]),
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
        agents={agents}
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
