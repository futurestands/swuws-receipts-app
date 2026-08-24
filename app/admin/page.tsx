import { listAgents, getAuditLogs, getSystemStats, getCollectionsSummary, getPrintingReports } from "@/app/actions/admin"
import { listClusters, listBranches, listPaymentMethods, listWaterSchemes, getSettings } from "@/app/actions/settings"
import { getSmsGatewaySettings } from "@/app/actions/sms-gateway-settings"
import { getCollectionPeriods } from "@/app/actions/billing"
import { AdminTabs } from "@/app/admin/admin-tabs"
import { getCurrentUser } from "@/lib/session"
import { listRoles, listAllPermissions, seedV12Permissions } from "@/app/actions/iam"
import { listAllTariffs } from "@/app/actions/billing-engine"
import { listTemplates, seedSystemTemplates } from "@/app/actions/template-actions"
import { ROLES } from "@/lib/permissions/roles"
import {
  canManageUsers,
  canManageSchemes,
  canManageAreas,
  canConfigureSystem,
  canAudit,
  canViewReports,
  canAccessAdminConsole,
  canManageIAM,
  canEditUser,
  canDeleteUser,
  canResetPasswords
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
  const canManageIAMVal = current ? canManageIAM(current) : false
  const canEditUserVal = current ? canEditUser(current) : false
  const canDeleteUserVal = current ? canDeleteUser(current) : false
  const canCreateUserVal = current ? (current.permissions?.includes("users.create") || current.role === ROLES.SYSTEM_ADMIN) : false
  const canResetPasswordVal = current ? canResetPasswords(current) : false

  const [agentsResult, auditLogs, stats, collections, printingStats, clusters, branches, methods, schemes, settings, smsGatewaySettings, periods, iamRoles, allPermissions, tariffs, templates] = await Promise.all([
    canManageUsersVal
      ? listAgents({ page: 1, pageSize: 25 }).catch(() => ({ agents: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }))
      : Promise.resolve({ agents: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }),
    canAuditVal ? getAuditLogs(200).catch(() => []) : Promise.resolve([]),
    canViewReportsVal ? getSystemStats().catch(() => ({ agentCount: 0, receiptCount: 0, receiptTotal: 0 })) : Promise.resolve({ agentCount: 0, receiptCount: 0, receiptTotal: 0 }),
    canViewReportsVal ? getCollectionsSummary().catch(() => ({ perAgent: [], totalCount: 0, totalAmount: 0 })) : Promise.resolve({ perAgent: [], totalCount: 0, totalAmount: 0 }),
    canViewReportsVal ? getPrintingReports().catch(() => ({ mostReprinted: [], byUser: [], byBranch: [], dailySummary: [], byScheme: [], recentPrints: [] })) : Promise.resolve({ mostReprinted: [], byUser: [], byBranch: [], dailySummary: [], byScheme: [], recentPrints: [] }),
    listClusters().catch(() => []),
    listBranches().catch(() => []),
    canConfigureSystemVal ? listPaymentMethods().catch(() => []) : Promise.resolve([]),
    listWaterSchemes().catch(() => []),
    getSettings(), // Settings is readable by all for branding
    canConfigureSystemVal
      ? getSmsGatewaySettings().catch(() => ({ provider: null, username: null, senderId: null, active: false, maskedApiKey: null, hasApiKey: false }))
      : Promise.resolve({ provider: null, username: null, senderId: null, active: false, maskedApiKey: null, hasApiKey: false }),
    getCollectionPeriods().catch(() => []),
    canManageIAMVal ? listRoles().catch(() => []) : Promise.resolve([]),
    canManageIAMVal ? listAllPermissions().catch(() => []) : Promise.resolve([]),
    canConfigureSystemVal ? listAllTariffs().catch(() => []) : Promise.resolve([]),
    canConfigureSystemVal ? listTemplates().catch(() => []) : Promise.resolve([]),
  ])

  // HIERARCHY FILTERING: Ensure UI dropdowns match the user's assigned scope.
  // Global/Head Office users (no assigned hierarchy) see all options.
  const isGlobal = !current?.clusterId && !current?.branchId && !current?.schemeId
  const isSystemAdmin = current?.role === ROLES.SYSTEM_ADMIN

  const filteredClusters = (isSystemAdmin || isGlobal) ? clusters : clusters.filter(c => c.id === current?.clusterId)
  const filteredBranches = (isSystemAdmin || isGlobal) ? branches : branches.filter(b => b.id === current?.branchId || b.clusterId === current?.clusterId)
  const filteredSchemes = (isSystemAdmin || isGlobal) ? schemes : schemes.filter(s => s.id === current?.schemeId || s.branchId === current?.branchId)

  const permissions = {
    canManageUsers: canManageUsersVal,
    canManageHierarchy: canManageHierarchyVal,
    canConfigureSystem: canConfigureSystemVal,
    canAudit: canAuditVal,
    canViewReports: canViewReportsVal,
    canManageIAM: canManageIAMVal,
    canEditUser: canEditUserVal,
    canDeleteUser: canDeleteUserVal,
    canCreateUser: canCreateUserVal,
    canResetPassword: canResetPasswordVal,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin console</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, branches, payment methods, branding, and review the audit trail.
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
        // FILTERED HIERARCHY: Used for the "Add User" dropdowns (Strict context)
        clusters={filteredClusters}
        branches={filteredBranches}
        methods={methods}
        schemes={filteredSchemes}
        // GLOBAL HIERARCHY: Used for the "Branches & schemes" list (View-only for non-admins)
        allClusters={clusters}
        allBranches={branches}
        allSchemes={schemes}
        settings={settings}
        smsGatewaySettings={smsGatewaySettings}
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
