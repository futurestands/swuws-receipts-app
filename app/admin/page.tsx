import { listAgents, getAuditLogs, getSystemStats, getCollectionsSummary, getPrintingReports } from "@/app/actions/admin"
import { listClusters, listBranches, listPaymentMethods, listWaterSchemes, getSettings } from "@/app/actions/settings"
import { getSmsGatewaySettings } from "@/app/actions/sms-gateway-settings"
import { getCollectionPeriods } from "@/app/actions/billing"
import { getOpenSystemErrorCount } from "@/app/actions/system-errors"
import { AdminTabs } from "@/app/admin/admin-tabs"
import { getCurrentUser } from "@/lib/session"
import { listRoles, listAllPermissions } from "@/app/actions/iam"
import { seedSystemTemplates } from "@/app/actions/template-actions"
import { loadTariffRows } from "@/lib/billing/list-tariffs"
import { loadTemplateRows } from "@/lib/templates/list-templates"
import { ROLES } from "@/lib/permissions/roles"
import { LinkButton } from "@/components/ui/link-button"
import {
  canViewUsers,
  canManageSchemes,
  canManageAreas,
  canConfigureSystem,
  canAudit,
  canViewReports,
  canManageIAM,
  canEditUser,
  canDeleteUser,
  canCreateUser,
  canResetPasswords,
} from "@/lib/permissions"

function warnFailed(label: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`Admin: ${label} failed: ${message}`)
}

async function loadOrFallback<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (err) {
    warnFailed(label, err)
    try {
      return await run()
    } catch (retryErr) {
      warnFailed(`${label} retry`, retryErr)
      return fallback
    }
  }
}

const EMPTY_AGENTS = { agents: [], total: 0, page: 1, pageSize: 25, totalPages: 1 }
const EMPTY_STATS = { agentCount: 0, receiptCount: 0, receiptTotal: 0 }
const EMPTY_COLLECTIONS = { perAgent: [] as { agentId: string; agentName: string; count: number; total: number }[], totalCount: 0, totalAmount: 0 }
const EMPTY_PRINTING = {
  mostReprinted: [],
  byUser: [],
  byBranch: [],
  dailySummary: [],
  byScheme: [],
  recentPrints: [],
}
const EMPTY_SMS = {
  provider: null,
  username: null,
  senderId: null,
  active: false,
  maskedApiKey: null,
  hasApiKey: false,
}

export default async function AdminPage() {
  const current = await getCurrentUser()

  const canViewUsersVal = current ? canViewUsers(current) : false
  const canAuditVal = current ? canAudit(current) : false
  const canViewReportsVal = current ? canViewReports(current) : false
  const canManageHierarchyVal = current ? (canManageSchemes(current) || canManageAreas(current)) : false
  const canConfigureSystemVal = current ? canConfigureSystem(current) : false
  const canManageIAMVal = current ? canManageIAM(current) : false
  const canEditUserVal = current ? canEditUser(current) : false
  const canDeleteUserVal = current ? canDeleteUser(current) : false
  const canCreateUserVal = current ? canCreateUser(current) : false
  const canResetPasswordVal = current ? canResetPasswords(current) : false

  const [clusters, branches, schemes, settings] = await Promise.all([
    loadOrFallback("clusters", () => listClusters(), []),
    loadOrFallback("branches", () => listBranches(), []),
    loadOrFallback("schemes", () => listWaterSchemes(), []),
    getSettings(),
  ])

  const [periods, methods, smsGatewaySettings] = await Promise.all([
    loadOrFallback("periods", () => getCollectionPeriods(), []),
    canConfigureSystemVal ? loadOrFallback("methods", () => listPaymentMethods(), []) : Promise.resolve([]),
    canConfigureSystemVal
      ? loadOrFallback("sms", () => getSmsGatewaySettings(), EMPTY_SMS)
      : Promise.resolve(EMPTY_SMS),
  ])

  const [agentsResult, auditLogs, iamRoles, allPermissions, openErrorCount] = await Promise.all([
    canViewUsersVal
      ? loadOrFallback("agents", () => listAgents({ page: 1, pageSize: 25 }), EMPTY_AGENTS)
      : Promise.resolve(EMPTY_AGENTS),
    canAuditVal ? loadOrFallback("audit", () => getAuditLogs(200), []) : Promise.resolve([]),
    canManageIAMVal ? loadOrFallback("roles", () => listRoles(), []) : Promise.resolve([]),
    canManageIAMVal ? loadOrFallback("permissions", () => listAllPermissions(), []) : Promise.resolve([]),
    canAuditVal ? loadOrFallback("errors", () => getOpenSystemErrorCount(), 0) : Promise.resolve(0),
  ])

  const [stats, collections, printingStats] = await Promise.all([
    canViewReportsVal ? loadOrFallback("stats", () => getSystemStats(), EMPTY_STATS) : Promise.resolve(EMPTY_STATS),
    canViewReportsVal
      ? loadOrFallback("collections", () => getCollectionsSummary(), EMPTY_COLLECTIONS)
      : Promise.resolve(EMPTY_COLLECTIONS),
    canViewReportsVal
      ? loadOrFallback("printing", () => getPrintingReports(), EMPTY_PRINTING)
      : Promise.resolve(EMPTY_PRINTING),
  ])

  let tariffs = canConfigureSystemVal ? await loadOrFallback("tariffs", () => loadTariffRows(), []) : []

  let templates = [] as Awaited<ReturnType<typeof loadTemplateRows>>
  if (canConfigureSystemVal) {
    let templatesLoaded = false
    try {
      templates = await loadTemplateRows()
      templatesLoaded = true
    } catch (err) {
      warnFailed("templates", err)
      try {
        templates = await loadTemplateRows()
        templatesLoaded = true
      } catch (retryErr) {
        warnFailed("templates retry", retryErr)
      }
    }
    if (templatesLoaded && templates.length === 0) {
      try {
        await seedSystemTemplates()
        templates = await loadTemplateRows()
      } catch (err) {
        warnFailed("template seed", err)
      }
    }
  }

  const isGlobal = !current?.clusterId && !current?.branchId && !current?.schemeId
  const isSystemAdmin = current?.role === ROLES.SYSTEM_ADMIN

  const filteredClusters = (isSystemAdmin || isGlobal) ? clusters : clusters.filter(c => c.id === current?.clusterId)
  const filteredBranches = (isSystemAdmin || isGlobal) ? branches : branches.filter(b => b.id === current?.branchId || b.clusterId === current?.clusterId)
  const filteredSchemes = (isSystemAdmin || isGlobal) ? schemes : schemes.filter(s => s.id === current?.schemeId || s.branchId === current?.branchId)

  const permissions = {
    canManageUsers: canViewUsersVal,
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin console</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, branches, payment methods, branding, and review the audit trail.
          </p>
        </div>
        {canAuditVal && (
          <LinkButton href="/admin/errors" variant="outline" icon="AlertTriangle">
            System errors{openErrorCount > 0 ? ` (${openErrorCount})` : ""}
          </LinkButton>
        )}
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
        clusters={filteredClusters}
        branches={filteredBranches}
        methods={methods}
        schemes={filteredSchemes}
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
