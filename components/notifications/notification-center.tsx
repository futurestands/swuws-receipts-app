"use client"

import { useState, useEffect } from "react"
import { Bell, BellRing, Check, ExternalLink, Clock } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getNotifications, markAsRead, markAllAsRead, getUnreadCount } from "@/app/actions/notifications"
import { formatDateTime } from "@/lib/format"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { Notification } from "@/lib/db/schema"

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  async function refresh() {
    try {
      const [list, count] = await Promise.all([
        getNotifications(),
        getUnreadCount()
      ])
      setNotifications(list as Notification[])
      setUnreadCount(count)
    } catch (err) {
      console.error("Failed to refresh notifications", err)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh()
    }, 0)
    // Poll every 60 seconds for production simplicity
    const interval = setInterval(refresh, 60000)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [])

  async function handleMarkRead(id: string) {
    await markAsRead(id)
    refresh()
  }

  async function handleMarkAllRead() {
    await markAllAsRead()
    refresh()
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? (
            <>
              <BellRing className="h-5 w-5 text-primary animate-pulse" />
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]" variant="destructive">
                {unreadCount}
              </Badge>
            </>
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 sm:w-96">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={handleMarkAllRead}>
                Mark all as read
              </Button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="h-80 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground italic">
              No new alerts.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={cn(
                "p-4 border-b last:border-0 hover:bg-muted/50 transition-colors",
                n.priority === 'critical' && "bg-red-50/30",
                n.priority === 'high' && "bg-orange-50/30"
              )}>
                <div className="flex justify-between gap-2">
                   <div className="space-y-1">
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-bold">{n.title}</span>
                         {n.priority !== 'normal' && (
                           <Badge variant="outline" className={cn(
                             "text-[8px] h-3 px-1 uppercase",
                             n.priority === 'critical' ? "text-red-600 border-red-200" : "text-orange-600 border-orange-200"
                           )}>{n.priority}</Badge>
                         )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-tight">{n.message}</p>
                   </div>
                   <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => handleMarkRead(n.id)}>
                      <Check className="h-3 w-3" />
                   </Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                   <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2 w-2" />
                      {formatDateTime(n.createdAt)}
                   </div>
                   {n.relatedEntityType && (
                      <Link
                        href={getLink(n.relatedEntityType, n.relatedEntityId)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                        onClick={() => handleMarkRead(n.id)}
                      >
                         Take Action <ExternalLink className="h-2 w-2" />
                      </Link>
                   )}
                </div>
              </div>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-2 flex justify-center border-t">
           <Link href="/dashboard/notifications" className="text-xs text-muted-foreground hover:text-primary hover:underline">
             View All History
           </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getLink(type: string, id: string | null) {
  if (!id) return "/dashboard"
  switch (type) {
    case 'reconciliation_exception': return `/dashboard/reconciliation/exceptions/${id}`
    case 'daily_collection_import': return `/dashboard/billing/daily/${id}`
    case 'receipt': return `/dashboard/receipts/${id}`
    case 'app_update': return `/dashboard/account`
    default: return "/dashboard"
  }
}
