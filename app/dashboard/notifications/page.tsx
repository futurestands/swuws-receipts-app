import { getNotificationHistory } from "@/app/actions/notifications"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDateTime } from "@/lib/format"
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function NotificationHistoryPage() {
  const items = await getNotificationHistory()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Alerts sent to this account, newest first."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts yet"
          description="When a period opens, a batch needs sign-off, or a complaint is assigned to you, it will show here."
        />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {items.map((n) => (
              <article key={n.id} className={cn("p-4 space-y-1", n.status === "unread" && "bg-muted/40")}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold">{n.title}</h2>
                  <Badge variant={n.status === "unread" ? "default" : "outline"} className="shrink-0 text-[10px] uppercase">
                    {n.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-snug">{n.message}</p>
                <p className="text-[11px] text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
