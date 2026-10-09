"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Activity, ShieldCheck, Link as LinkIcon, ServerCrash, Save, ShieldAlert, FileKey } from "lucide-react"
import { getEbsConfigAction, saveEbsConfigAction } from "@/app/actions/ebs-config"
import { formatDateTime } from "@/lib/format"

export function EbsConfigClient({ siteUrl }: { siteUrl: string }) {
  const [config, setConfig] = useState<any>(null)
  const [isLoading, startTransition] = useTransition()

  // Form State
  const [active, setActive] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")

  // Features
  const [syncCustomers, setSyncCustomers] = useState(false)
  const [syncBills, setSyncBills] = useState(false)
  const [pushMeterReadings, setPushMeterReadings] = useState(false)
  const [liveBalanceCheck, setLiveBalanceCheck] = useState(false)

  const loadData = () => {
    startTransition(async () => {
      try {
        const res = await getEbsConfigAction()
        setConfig(res)
        setActive(res.active)
        setBaseUrl(res.baseUrl)
        setSyncCustomers(res.syncCustomers)
        setSyncBills(res.syncBills)
        setPushMeterReadings(res.pushMeterReadings)
        setLiveBalanceCheck(res.liveBalanceCheck)
      } catch (err: any) {
        toast.error(err.message || "Failed to load config")
      }
    })
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      try {
        await saveEbsConfigAction({
          active,
          baseUrl,
          apiKey,
          apiSecret,
          webhookSecret,
          syncCustomers,
          syncBills,
          pushMeterReadings,
          liveBalanceCheck
        })
        toast.success("EBS Configuration saved securely.")
        setApiKey("") // Clear secrets from UI state after save
        setApiSecret("")
        setWebhookSecret("")
        loadData()
      } catch (err: any) {
        toast.error(err.message || "Failed to save configuration")
      }
    })
  }

  if (!config) {
    return <div className="flex justify-center p-8"><Activity className="animate-pulse h-8 w-8 text-primary" /></div>
  }

  const webhookUrl = `${siteUrl}/api/webhooks/pegasus`

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card className="border-brand-blue/20">
        <CardHeader className="bg-brand-blue/5 border-b pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ServerCrash className="h-5 w-5 text-brand-blue" />
                Integration Status
              </CardTitle>
              <CardDescription className="mt-1">
                When disabled, SWUWS Portal operates in 100% manual mode using Excel/CSV workflows.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 bg-background px-3 py-1.5 rounded-full border">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label className="font-bold">{active ? "ENABLED" : "DISABLED"}</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex gap-3 text-sm text-amber-800 dark:text-amber-200">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <strong>Phase 1 Foundation Only:</strong> This module prepares the system architecture for Pegasus EBS.
              Real vendor synchronization is safely mocked (returning <code>NOT_IMPLEMENTED</code>) until official API documentation is provided.
            </div>
          </div>

          <div className="space-y-2">
            <Label>API Base URL</Label>
            <Input
              type="url"
              placeholder="e.g. https://api.pegasus.co.ug/v1"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              disabled={!active}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileKey className="h-4 w-4" />
              API Credentials
            </CardTitle>
            <CardDescription className="text-xs">
              Credentials are encrypted at rest. We never display stored secrets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>API Key</Label>
                {config.hasApiKey && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">Stored Securely</Badge>}
              </div>
              <Input
                type="password"
                placeholder={config.hasApiKey ? "•••••••••••••••• (Leave blank to keep existing)" : "Enter provided API Key"}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>API Secret Token</Label>
                {config.hasApiSecret && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">Stored Securely</Badge>}
              </div>
              <Input
                type="password"
                placeholder={config.hasApiSecret ? "•••••••••••••••• (Leave blank to keep existing)" : "Enter provided Secret Token"}
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
              />
            </div>

            <div className="space-y-2 border-t pt-4 mt-2">
              <div className="flex justify-between">
                <Label>Webhook Secret (For Live Payments)</Label>
                {config.hasWebhookSecret && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">Stored Securely</Badge>}
              </div>
              <Input
                type="password"
                placeholder={config.hasWebhookSecret ? "•••••••••••••••• (Leave blank to keep existing)" : "Enter Webhook validation secret"}
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
              />
              <div className="bg-muted p-2 rounded text-[10px] font-mono break-all mt-2">
                Webhook URL: {webhookUrl}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="h-4 w-4" />
              Hybrid Feature Toggles
            </CardTitle>
            <CardDescription className="text-xs">
              Independently enable automated endpoints. If disabled, SWUWS Portal falls back to existing manual modes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Live Customer Balance Check</Label>
                <div className="text-xs text-muted-foreground">Intercept manual balance lookups with a live API ping to Pegasus.</div>
              </div>
              <Switch checked={liveBalanceCheck} onCheckedChange={setLiveBalanceCheck} disabled={!active} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Meter Readings</Label>
                <div className="text-xs text-muted-foreground">Automatically submit field meter readings to EBS for billing approval.</div>
              </div>
              <Switch checked={pushMeterReadings} onCheckedChange={setPushMeterReadings} disabled={!active} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Sync Customers</Label>
                <div className="text-xs text-muted-foreground">Nightly background pull of newly registered EBS customers.</div>
              </div>
              <Switch checked={syncCustomers} onCheckedChange={setSyncCustomers} disabled={!active} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Sync Monthly Bills</Label>
                <div className="text-xs text-muted-foreground">Pull approved monthly bills from EBS automatically.</div>
              </div>
              <Switch checked={syncBills} onCheckedChange={setSyncBills} disabled={!active} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-xs text-muted-foreground">
          {config.updatedAt ? (
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Last updated: {formatDateTime(config.updatedAt)}</span>
          ) : (
            <span>Never configured</span>
          )}
        </div>
        <Button type="submit" disabled={isLoading} className="gap-2">
          <Save className="h-4 w-4" /> {isLoading ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
    </form>
  )
}
