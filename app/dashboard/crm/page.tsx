import { requireUser } from "@/lib/session"
import { canViewCrm } from "@/lib/permissions"
import { getCrmStats } from "@/app/actions/crm"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatCardGrid } from "@/components/ui/stat-card"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { MessageSquare, Smartphone, CheckCircle2, AlertCircle, Clock } from "lucide-react"

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

      <StatCardGrid className="sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open Complaints"
          value={stats.complaints.open}
          icon={AlertCircle}
        />
        <StatCard
          label="Resolved Cases"
          value={stats.complaints.resolved}
          icon={CheckCircle2}
        />
        <StatCard
          label="SMS Batches"
          value={stats.sms.totalBatches}
          icon={Clock}
        />
        <StatCard
          label="Messages Sent"
          value={stats.sms.totalSentToday}
          icon={Smartphone}
        />
      </StatCardGrid>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/dashboard/crm/complaints">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Complaints Management
              </CardTitle>
              <CardDescription>Register and track customer field issues and technical complaints.</CardDescription>
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
                <p className="text-[10px] text-muted-foreground italic">Target resolution time: 48 hours.</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/crm/sms">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-emerald-500 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-500" />
                SMS Communications
              </CardTitle>
              <CardDescription>Send bill reminders, emergency alerts, and community updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Batch Count:</span>
                  <span className="font-bold">{stats.sms.totalBatches}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Success:</span>
                  <span className="font-bold text-emerald-600">{stats.sms.totalSentToday.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">All messages are logged for audit compliance.</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
