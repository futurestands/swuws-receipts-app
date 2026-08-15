"use client"

import { useEffect, useState } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { RefreshCw, ArrowUp, ArrowDown, AlertCircle, CheckCircle2 } from "lucide-react"

export function LogsClient() {
  const [logs, setLogs] = useState<any[]>([])
  const [notifs, setNotifs] = useState<any[]>([])

  useEffect(() => {
    sqliteService.initialize().then(async () => {
      const [l, n] = await Promise.all([
        sqliteService.getSyncLogs(),
        sqliteService.getNotifications()
      ])
      setLogs(l)
      setNotifs(n)

      // Mark all read when visiting this page
      n.forEach(notif => sqliteService.markNotificationRead(notif.id))
    })
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sync History</h1>
        <p className="text-muted-foreground font-medium">Logs of background data exchanges.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Background Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {logs.map(log => (
              <div key={log.id} className="p-4 flex items-start justify-between group hover:bg-muted/30 transition-colors">
                <div className="flex gap-3">
                  <div className={`mt-1 p-2 rounded-full ${log.action === 'push' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                    {log.action === 'push' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="font-bold text-sm uppercase">{log.action === 'push' ? 'Upload' : 'Download'}</p>
                    <p className="text-xs text-muted-foreground">{log.details || log.error || 'Complete'}</p>
                    <p className="text-[10px] mt-1 font-medium text-muted-foreground/60">{format(new Date(log.createdAt), 'dd MMM, HH:mm')}</p>
                  </div>
                </div>
                <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[10px] font-black uppercase px-2">
                  {log.status}
                </Badge>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No sync logs available yet.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {notifs.map(n => (
              <div key={n.id} className="p-4 flex gap-3 group hover:bg-muted/30 transition-colors">
                <div className="mt-1 p-2 bg-muted rounded-full">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">{n.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                  <p className="text-[10px] mt-1 font-medium text-muted-foreground/60">{format(new Date(n.createdAt), 'dd MMM, HH:mm')}</p>
                </div>
              </div>
            ))}
            {notifs.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">No notifications yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
