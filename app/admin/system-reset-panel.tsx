"use client"

import { useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Trash2, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { wipeOperationalData } from "@/app/actions/admin"

export function SystemResetPanel() {
  const [confirmText, setConfirmText] = useState("")
  const [confirmAuditDelete, setConfirmAuditDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  function handleReset() {
    if (confirmText !== "RESET" || !confirmAuditDelete) return

    startTransition(async () => {
      const res = await wipeOperationalData(confirmText)
      if (res.ok) {
        setSuccess(true)
        toast.success("System reset successful")
      } else {
        toast.error(res.error)
      }
    })
  }

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="pt-12 pb-12 flex flex-col items-center text-center space-y-4">
          <CheckCircle2 className="size-16 text-green-500" />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-green-700">System Ready for Production</h2>
            <p className="text-muted-foreground max-w-md">
              All test records have been purged. You can now start onboarding real customers and recording actual payments.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Return to Admin Console
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="border-destructive/20 shadow-lg">
        <CardHeader className="bg-destructive/5 border-b border-destructive/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <CardTitle className="text-destructive">System Reset & Data Purge</CardTitle>
              <CardDescription>
                Prepare the system for production by clearing all testing data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg border bg-muted/20 space-y-2">
              <p className="text-sm font-bold flex items-center gap-2 text-destructive">
                <Trash2 className="size-4" /> PERMANENTLY DELETED
              </p>
              <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-4">
                <li>All Customers & Meter Readings</li>
                <li>Every Receipt & Print History</li>
                <li>All Monthly Bills & Daily Collections</li>
                <li>Entire System Audit History (Full Trail)</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border bg-green-50/20 space-y-2">
              <p className="text-sm font-bold flex items-center gap-2 text-green-700">
                <CheckCircle2 className="size-4" /> PRESERVED SETUP
              </p>
              <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-4">
                <li>Area Offices & Water Schemes</li>
                <li>Tariffs & Billing Rates</li>
                <li>Users, Roles & Permissions</li>
                <li>Organization Branding & Settings</li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 flex gap-3 items-start">
            <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-800">Caution: This action cannot be undone.</p>
              <p className="text-xs text-amber-700">
                Receipt numbers will be reset to 000001. Ensure you have backed up any data you wish to keep before proceeding.
              </p>
            </div>
          </div>

          <div className="space-y-4 max-w-md mx-auto pt-4">
            <div className="flex items-start space-x-3 p-4 rounded-md bg-destructive/5 border border-destructive/10">
              <Checkbox
                id="audit-confirm"
                checked={confirmAuditDelete}
                onCheckedChange={(checked) => setConfirmAuditDelete(!!checked)}
                className="mt-1"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="audit-confirm"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Confirm Audit Log Deletion
                </label>
                <p className="text-xs text-muted-foreground">
                  I understand that this will permanently delete all security, IAM, and system configuration logs, starting a completely fresh audit trail.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-center">
              <Label htmlFor="reset-confirm" className="text-sm font-medium">
                Type <span className="font-mono font-bold text-destructive underline">RESET</span> to confirm
              </Label>
              <Input
                id="reset-confirm"
                placeholder="RESET"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                className="text-center font-mono font-bold tracking-widest uppercase border-destructive/30"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/30 border-t justify-center py-6">
          <Button
            variant="destructive"
            size="lg"
            className="w-full max-w-sm gap-2 font-black"
            disabled={confirmText !== "RESET" || !confirmAuditDelete || isPending}
            onClick={handleReset}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            PURGE ALL TEST DATA & START FRESH
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
