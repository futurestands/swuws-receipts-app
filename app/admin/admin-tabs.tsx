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
import { MaintenancePanel } from "@/app/admin/maintenance-panel"
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
  agentsTotal,
  agentsPage,
  agentsPageSize,
  agentsTotalPages,
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
  agentsTotal: number
  agentsPage: number
  agentsPageSize: number
  agentsTotalPages: number
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
      {/*
        TabsList is `inline-flex w-fit` with no wrapping (see
        components/ui/tabs.tsx), so on narrow/mobile viewports it overflows
        past the visible width and everything after "IAM" gets visually
        clipped by the page with no way to reach it. Wrapping it in a
        horizontally-scrollable container fixes that without touching the
        shared Tabs primitive (which is also used elsewhere). `shrink-0` on
        each trigger stops flex from squishing labels instead of scrolling.
      */}
      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
        <TabsList className="w-max">
          {permissions.canViewReports && <TabsTrigger value="overview" className="shrink-0">Overview</TabsTrigger>}
          {permissions.canViewReports && <TabsTrigger value="commercial" className="shrink-0">Commercial</TabsTrigger>}
          {permissions.canViewReports && <TabsTrigger value="printing" className="shrink-0">Printing</TabsTrigger>}
          {permissions.canManageUsers && <TabsTrigger value="agents" className="shrink-0">Agents</TabsTrigger>}
          {permissions.canManageIAM && <TabsTrigger value="iam" className="shrink-0">IAM</TabsTrigger>}
          {permissions.canConfigureSystem && <TabsTrigger value="tariffs" className="shrink-0">Tariffs</TabsTrigger>}
          {permissions.canConfigureSystem && <TabsTrigger value="templates" className="shrink-0">Templates</TabsTrigger>}
          {permissions.canManageHierarchy && <TabsTrigger value="reference" className="shrink-0">Branches &amp; schemes</TabsTrigger>}
          {permissions.canConfigureSystem && <TabsTrigger value="branding" className="shrink-0">Branding</TabsTrigger>}
          {permissions.canAudit && <TabsTrigger value="audit" className="shrink-0">Audit log</TabsTrigger>}
          {permissions.canConfigureSystem && <TabsTrigger value="maintenance" className="shrink-0 text-destructive font-bold">Maintenance</TabsTrigger>}
        </TabsList>
      </div>

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
          <AgentsPanel
            agents={agents}
            agentsTotal={agentsTotal}
            agentsPage={agentsPage}
            agentsPageSize={agentsPageSize}
            agentsTotalPages={agentsTotalPages}
            clusters={clusters}
            branches={branches}
            schemes={schemes}
            iamRoles={iamRoles}
          />
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

      {permissions.canConfigureSystem && (
        <TabsContent value="maintenance" className="mt-4">
          <MaintenancePanel initialActive={settings.maintenanceMode} />
        </TabsContent>
      )}
    </Tabs>
  )
}
