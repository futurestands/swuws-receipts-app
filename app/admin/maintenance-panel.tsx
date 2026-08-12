"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ShieldAlert, AlertTriangle, Hammer, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { setMaintenanceMode } from "@/app/actions/settings"
import { SystemResetPanel } from "./system-reset-panel"

export function MaintenancePanel({ initialActive }: { initialActive: boolean }) {
  const [active, setActive] = useState(initialActive)
  const [isPending, startTransition] = useTransition()

  async function handleToggle(checked: boolean) {
    startTransition(async () => {
      const res = await setMaintenanceMode(checked)
      if (res.ok) {
        setActive(checked)
        toast.success(`Maintenance Mode ${checked ? 'Enabled' : 'Disabled'}`)
      } else {
        toast.error("Failed to update maintenance mode")
      }
    })
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <Card className="border-amber-200 shadow-md overflow-hidden">
        <CardHeader className="bg-amber-50 border-b border-amber-100">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <ShieldAlert className="size-6" />
             </div>
             <div>
                <CardTitle>Security Hardening: Maintenance Mode</CardTitle>
                <CardDescription>
                  Lock out all non-admin users to perform critical updates or investigate security issues.
                </CardDescription>
             </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
           <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
              <div className="space-y-1">
                 <Label className="text-base font-bold flex items-center gap-2">
                    {active ? <Hammer className="size-4 text-amber-600 animate-bounce" /> : <ShieldAlert className="size-4 text-muted-foreground" />}
                    Maintenance Lock
                 </Label>
                 <p className="text-xs text-muted-foreground max-w-sm">
                    {active
                      ? "System is currently LOCKED. Only System Administrators can access the dashboard."
                      : "System is running normally. All authorized users have full access."
                    }
                 </p>
              </div>
              <div className="flex items-center gap-3">
                 {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                 <Switch
                   checked={active}
                   onCheckedChange={handleToggle}
                   disabled={isPending}
                 />
              </div>
           </div>

           {active && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3 text-red-800 text-xs animate-in zoom-in-95 duration-200">
                <AlertTriangle className="size-5 shrink-0" />
                <div>
                   <p className="font-bold uppercase tracking-tight">Active Warning</p>
                   <p>Agents and Commercial Officers are currently seeing a maintenance message and cannot issue receipts or capture readings.</p>
                </div>
             </div>
           )}
        </CardContent>
      </Card>

      <div className="relative">
         <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-muted"></div>
         </div>
         <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Danger Zone Below</span>
         </div>
      </div>

      <SystemResetPanel />
    </div>
  )
}
