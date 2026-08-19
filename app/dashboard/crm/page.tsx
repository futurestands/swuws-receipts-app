import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { getCrmStats } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { MessageSquare, Smartphone, CheckCircle2, AlertCircle, Clock, FileBarChart, List } from "lucide-react"

import Link from "next/link"

export default async function CrmDashboardPage() {
  console.log("CRM Dashboard Page Hit");
  const user = await requireUser()
  if (!canViewCrm(user)) throw new Error("Forbidden")

  const stats = await getCrmStats()

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Hub"
        description="Manage customer relationships, complaints, and communications."
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-t-4 border-t-sky-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Total SMS Lists</p>
                <p className="text-2xl font-black text-sky-600">{stats.sms.totalLists}</p>
              </div>
              <List className="h-8 w-8 text-sky-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Pending Messages</p>
                <p className="text-2xl font-black text-amber-600">{stats.sms.pendingMessages}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-emerald-500 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Sent Messages</p>
                <p className="text-2xl font-black text-emerald-600">{stats.sms.sentMessages.toLocaleString()}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/dashboard/crm/complaints">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm uppercase">
                <MessageSquare className="h-4 w-4 text-primary" />
                Complaints Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Open Tickets:</span>
                  <span className="font-bold">{stats.complaints.open}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(stats.complaints.resolved / (stats.complaints.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/crm/sms">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-emerald-500 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm uppercase">
                <Smartphone className="h-4 w-4 text-emerald-500" />
                SMS Communications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Campaigns:</span>
                  <span className="font-bold">{stats.sms.totalLists}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Successful:</span>
                  <span className="font-bold text-emerald-600">{stats.sms.sentMessages.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/crm/reports">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-amber-500 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm uppercase">
                <FileBarChart className="h-4 w-4 text-amber-500" />
                Call Center Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Analyze performance metrics, response times, and complaint categories.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
