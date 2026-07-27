"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AgentsPanel } from "@/app/admin/agents-panel"
import { BrandingPanel } from "@/app/admin/branding-panel"
import { ReferenceDataPanel } from "@/app/admin/reference-data-panel"
import { AuditLogPanel } from "@/app/admin/audit-log-panel"
import { StatsPanel } from "@/app/admin/stats-panel"
import { PrintingPanel, type PrintingStats } from "@/app/admin/printing-panel"
import { CommercialDashboard } from "@/app/admin/commercial-dashboard"
import { IamPanel } from "@/app/admin/iam-panel"
import { TariffPanel } from "@/app/admin/tariff-panel"
import { TemplateManager } from "@/app/admin/template-manager"
import { SystemResetPanel } from "@/app/admin/system-reset-panel"
import type { AuditLog, Branch, Cluster, OrgSettings, PaymentMethod, WaterScheme, BillingPeriod, IamRole, IamPermission } from "@/lib/db/schema"

type Agent = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  branchId: string | null
  createdAt: Date
}

export function AdminTabs({
  agents,
  auditLogs,
  stats,
  collections,
  printingStats,
  clusters,
  branches,
  methods,
  schemes,
  settings,
  permissions,
  periods,
  iamRoles,
  allPermissions,
  tariffs,
  templates,
}: {
  agents: Agent[]
  auditLogs: AuditLog[]
  stats: { agentCount: number; receiptCount: number; receiptTotal: number }
  collections: {
    perAgent: { agentId: string; agentName: string; count: number; total: number }[]
    totalCount: number
    totalAmount: number
  }
  printingStats: PrintingStats
  clusters: Cluster[]
  branches: Branch[]
  methods: PaymentMethod[]
  schemes: WaterScheme[]
  settings: OrgSettings
  permissions: {
    canManageUsers: boolean
    canManageHierarchy: boolean
    canConfigureSystem: boolean
    canAudit: boolean
    canViewReports: boolean
    canManageIAM: boolean
  }
  periods: BillingPeriod[]
  iamRoles: IamRole[]
  allPermissions: IamPermission[]
  tariffs: any[]
  templates: any[]
}) {
  const defaultTab = permissions.canViewReports ? "overview" : "agents"

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        {permissions.canViewReports && <TabsTrigger value="overview">Overview</TabsTrigger>}
        {permissions.canViewReports && <TabsTrigger value="commercial">Commercial</TabsTrigger>}
        {permissions.canViewReports && <TabsTrigger value="printing">Printing</TabsTrigger>}
        {permissions.canManageUsers && <TabsTrigger value="agents">Agents</TabsTrigger>}
        {permissions.canManageIAM && <TabsTrigger value="iam">IAM</TabsTrigger>}
        {permissions.canConfigureSystem && <TabsTrigger value="tariffs">Tariffs</TabsTrigger>}
        {permissions.canConfigureSystem && <TabsTrigger value="templates">Templates</TabsTrigger>}
        {permissions.canManageHierarchy && <TabsTrigger value="reference">Branches &amp; schemes</TabsTrigger>}
        {permissions.canConfigureSystem && <TabsTrigger value="branding">Branding</TabsTrigger>}
        {permissions.canAudit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
      </TabsList>

      {permissions.canViewReports && (
        <TabsContent value="overview" className="mt-4">
          <StatsPanel stats={stats} collections={collections} />
        </TabsContent>
      )}

      {permissions.canViewReports && (
        <TabsContent value="commercial" className="mt-4">
          <CommercialDashboard
            clusters={clusters}
            branches={branches}
            schemes={schemes}
            periods={periods}
          />
        </TabsContent>
      )}

      {permissions.canViewReports && (
        <TabsContent value="printing" className="mt-4">
          <PrintingPanel stats={printingStats} />
        </TabsContent>
      )}

      {permissions.canManageUsers && (
        <TabsContent value="agents" className="mt-4">
          <AgentsPanel agents={agents} clusters={clusters} branches={branches} schemes={schemes} iamRoles={iamRoles} />
        </TabsContent>
      )}

      {permissions.canManageIAM && (
        <TabsContent value="iam" className="mt-4">
          <IamPanel initialRoles={iamRoles} allPermissions={allPermissions} />
        </TabsContent>
      )}

      {permissions.canConfigureSystem && (
        <TabsContent value="tariffs" className="mt-4">
          <TariffPanel tariffs={tariffs} branches={branches} schemes={schemes} />
        </TabsContent>
      )}

      {permissions.canConfigureSystem && (
        <TabsContent value="templates" className="mt-4">
          <TemplateManager initialTemplates={templates} />
        </TabsContent>
      )}

      {permissions.canManageHierarchy && (
        <TabsContent value="reference" className="mt-4">
          <ReferenceDataPanel branches={branches} methods={methods} schemes={schemes} clusters={clusters} />
        </TabsContent>
      )}

      {permissions.canConfigureSystem && (
        <TabsContent value="branding" className="mt-4">
          <BrandingPanel settings={settings} />
        </TabsContent>
      )}

      {permissions.canAudit && (
        <TabsContent value="audit" className="mt-4">
          <AuditLogPanel logs={auditLogs} />
        </TabsContent>
      )}
    </Tabs>
  )
}
