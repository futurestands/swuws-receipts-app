import { Hammer, ShieldAlert } from "lucide-react"
import { getSettings } from "@/app/actions/settings"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { ROLES } from "@/lib/permissions/roles"

export default async function MaintenancePage() {
  const [current, settings] = await Promise.all([
    getCurrentUser(),
    getSettings()
  ])

  // If maintenance mode is off, or user is admin, they shouldn't be here
  if (!settings.maintenanceMode || (current && current.role === ROLES.SYSTEM_ADMIN)) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
       <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex flex-col items-center gap-6">
             <div className="relative">
                <div className="absolute inset-0 bg-amber-200 blur-2xl opacity-50 rounded-full"></div>
                <div className="relative bg-white p-6 rounded-2xl shadow-xl border border-amber-100">
                   <Hammer className="size-16 text-amber-600 animate-pulse" />
                </div>
             </div>

             <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-foreground">System Locked</h1>
                <p className="text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Security & Maintenance</p>
             </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-border space-y-6">
             <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3 text-left">
                <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                   <p className="text-sm font-bold text-amber-900">Ongoing Maintenance</p>
                   <p className="text-xs text-amber-800 leading-relaxed">
                      The SWUWS Collection Portal is currently undergoing scheduled maintenance or security hardening.
                   </p>
                </div>
             </div>

             <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                   To ensure data integrity and security, all commercial operations (Billing, Readings, and Receipts) are temporarily paused.
                </p>
                <div className="pt-4 border-t text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                   {settings.orgName}
                </div>
             </div>
          </div>

          <p className="text-xs text-muted-foreground">
             Please contact the IT Head Office if you believe this is an error.
          </p>
       </div>
    </div>
  )
}
