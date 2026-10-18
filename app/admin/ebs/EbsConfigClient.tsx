"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Activity, ShieldCheck, Link as LinkIcon, ServerCrash, Save, ShieldAlert, FileKey, RefreshCw, Inbox } from "lucide-react"
import { getEbsConfigAction, saveEbsConfigAction, rotateWebhookSecretAction, getEbsEventsAction } from "@/app/actions/ebs-config"
import { formatDateTime } from "@/lib/format"

type EbsConfigState = {
  active: boolean
  providerName: string
  baseUrl: string
  syncCustomers: boolean
  syncBills: boolean
  pushMeterReadings: boolean
  liveBalanceCheck: boolean
  hasApiKey: boolean
  hasApiSecret: boolean
  hasWebhookSecret: boolean
  webhookSecretRotatedAt: Date | string | null
  updatedAt: Date | string | null
}

type EbsEventRow = {
  id: string
  providerEventId: string
  receivedAt: Date | string
  signatureVerified: boolean
  status: string
  accountNumber: string | null
  amount: number | null
  errorMessage: string | null
  rawPayload: Record<string, unknown>
}

export function EbsConfigClient({ siteUrl }: { siteUrl: string }) {
  const [config, setConfig] = useState<EbsConfigState | null>(null)
  const [events, setEvents] = useState<EbsEventRow[]>([])
  const [isLoading, startTransition] = useTransition()

  // Form State
  const [active, setActive] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [rotateSecretInput, setRotateSecretInput] = useState("")

  // Features
  const [syncCustomers, setSyncCustomers] = useState(false)
  const [syncBills, setSyncBills] = useState(false)
  const [pushMeterReadings, setPushMeterReadings] = useState(false)
  const [liveBalanceCheck, setLiveBalanceCheck] = useState(false)

  const loadData = () => {
    startTransition(async () => {
      try {
        const [res, eventList] = await Promise.all([
          getEbsConfigAction(),
          getEbsEventsAction().catch(() => [])
        ])
        setConfig(res)
        setActive(res.active)
        setBaseUrl(res.baseUrl)
        setSyncCustomers(res.syncCustomers)
        setSyncBills(res.syncBills)
        setPushMeterReadings(res.pushMeterReadings)
        setLiveBalanceCheck(res.liveBalanceCheck)
        setEvents(eventList as EbsEventRow[])
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load config"
        toast.error(msg)
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
        setApiKey("")
        setApiSecret("")
        setWebhookSecret("")
        loadData()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to save configuration"
        toast.error(msg)
      }
    })
  }

  const handleRotateSecret = async () => {
    if (!rotateSecretInput || rotateSecretInput.length < 8) {
      toast.error("New webhook secret must be at least 8 characters long.")
      return
    }
    startTransition(async () => {
      try {
        await rotateWebhookSecretAction(rotateSecretInput)
        toast.success("Webhook secret rotated successfully.")
        setRotateSecretInput("")
        loadData()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to rotate secret"
        toast.error(msg)
      }
    })
  }

  if (!config) {
    return <div className="flex justify-center p-8"><Activity className="animate-pulse h-8 w-8 text-primary" /></div>
  }

  const webhookUrl = `${siteUrl}/api/webhooks/pegasus`

  // Calculate stats
  const totalEvents = events.length
  const receivedCount = events.filter(e => e.status === "received").length
  const processedCount = events.filter(e => e.status === "processed" || e.status === "matched_pending_review").length
  const needsReviewCount = events.filter(e => e.status === "needs_review").length
  const failedCount = events.filter(e => e.status === "failed").length
  const lastEvent = events[0]

  return (
    <div className="space-y-6">
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
                <strong>Phase 1/2 Integration Foundation:</strong> This module prepares the system architecture for Pegasus EBS.
                Incoming webhooks are verified and durably stored in the event inbox.
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
                API Credentials & Secret Rotation
              </CardTitle>
              <CardDescription className="text-xs">
                Credentials are encrypted at rest. Rotate secrets securely.
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
                <div className="flex gap-2 mt-2">
                  <Input
                    type="password"
                    placeholder="New secret for rotation (min 8 chars)"
                    value={rotateSecretInput}
                    onChange={e => setRotateSecretInput(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={handleRotateSecret} disabled={isLoading || !rotateSecretInput}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Rotate
                  </Button>
                </div>
                {config.webhookSecretRotatedAt && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Last rotated: {formatDateTime(config.webhookSecretRotatedAt)}
                  </p>
                )}
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

      {/* ADMIN EVENTS INBOX PANEL */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-primary" />
                EBS Webhook Events Inbox
              </CardTitle>
              <CardDescription>
                Review incoming webhook events, processing status, and items requiring reconciliation review.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-muted/30 p-3 rounded-lg border text-center">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Total Received</p>
              <p className="text-xl font-bold mt-1">{totalEvents}</p>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-200 text-center">
              <p className="text-xs text-blue-700 uppercase font-semibold">Pending / Received</p>
              <p className="text-xl font-bold text-blue-800 mt-1">{receivedCount}</p>
            </div>
            <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-200 text-center">
              <p className="text-xs text-emerald-700 uppercase font-semibold">Processed</p>
              <p className="text-xl font-bold text-emerald-800 mt-1">{processedCount}</p>
            </div>
            <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200 text-center">
              <p className="text-xs text-amber-700 uppercase font-semibold">Needs Review</p>
              <p className="text-xl font-bold text-amber-800 mt-1">{needsReviewCount}</p>
            </div>
            <div className="bg-red-50/50 p-3 rounded-lg border border-red-200 text-center">
              <p className="text-xs text-red-700 uppercase font-semibold">Failed</p>
              <p className="text-xl font-bold text-red-800 mt-1">{failedCount}</p>
            </div>
          </div>

          {lastEvent && (
            <div className="text-xs text-muted-foreground bg-muted p-2 rounded flex justify-between items-center">
              <span>Last event received: <strong>{formatDateTime(lastEvent.receivedAt)}</strong> (ID: {lastEvent.providerEventId})</span>
              <Badge variant="outline" className="uppercase">{lastEvent.status}</Badge>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Received At</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error / Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                      No webhook events received yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="font-mono text-xs">{ev.providerEventId}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(ev.receivedAt)}</TableCell>
                      <TableCell className="font-mono font-semibold">{ev.accountNumber || "—"}</TableCell>
                      <TableCell>{ev.amount ? `UGX ${Number(ev.amount).toLocaleString()}` : "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            ev.status === "processed" || ev.status === "matched_pending_review"
                              ? "default"
                              : ev.status === "needs_review"
                              ? "secondary"
                              : ev.status === "failed"
                              ? "destructive"
                              : "outline"
                          }
                          className="uppercase text-[10px]"
                        >
                          {ev.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {ev.errorMessage || JSON.stringify(ev.rawPayload)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
