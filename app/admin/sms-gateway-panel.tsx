"use client"

import { useState, useTransition } from "react"
import { updateSmsGatewaySettings, sendTestSms } from "@/app/actions/sms-gateway-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { MessageSquare, Send, Loader2 } from "lucide-react"

interface SmsGatewaySettings {
  provider: string | null
  username: string | null
  senderId: string | null
  active: boolean
  maskedApiKey: string | null
  hasApiKey: boolean
}

export function SmsGatewayPanel({ settings }: { settings: SmsGatewaySettings }) {
  const [provider, setProvider] = useState(settings.provider ?? "africastalking")
  const [username, setUsername] = useState(settings.username ?? "")
  const [senderId, setSenderId] = useState(settings.senderId ?? "")
  const [apiKey, setApiKey] = useState("") // always starts blank -- see updateSmsGatewaySettings for why
  const [active, setActive] = useState(settings.active)
  const [testPhone, setTestPhone] = useState("")
  const [pending, startTransition] = useTransition()
  const [testing, startTestTransition] = useTransition()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateSmsGatewaySettings({ provider, username, senderId, apiKey, active })
      if (!result.ok) {
        toast.error("Failed to save SMS gateway settings")
        return
      }
      setApiKey("") // clear the input after a successful save -- it's masked again on reload anyway
      toast.success("SMS gateway settings saved")
    })
  }

  function handleTestSend() {
    if (!testPhone) {
      toast.error("Enter a phone number to send the test to")
      return
    }
    startTestTransition(async () => {
      const result = await sendTestSms(testPhone)
      if (result.ok) {
        toast.success("Test message sent successfully")
      } else {
        toast.error("Test send failed &mdash; check your credentials and try again")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <CardTitle>SMS Gateway</CardTitle>
        </div>
        <CardDescription>
          Manage your SMS provider subscription here. Once configured, bulk SMS and billing notifications
          send for real &mdash; no code changes or redeploys needed to switch providers or update credentials.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSave}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Gateway active</Label>
              <p className="text-xs text-muted-foreground">
                When off, messages are logged as simulated only &mdash; nothing actually sends.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={v => setProvider(v ?? "africastalking")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="africastalking">Africa&apos;s Talking</SelectItem>
                  <SelectItem value="twilio">Twilio</SelectItem>
                  <SelectItem value="infobip">Infobip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sender ID (optional)</Label>
              <Input value={senderId} onChange={e => setSenderId(e.target.value)} placeholder="SWUWS" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your provider account username" />
          </div>

          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={settings.hasApiKey ? `Currently set (${settings.maskedApiKey}) -- leave blank to keep it` : "Enter your provider API key"}
            />
            <p className="text-xs text-muted-foreground">
              For security, the saved key is never shown in full. Leave this blank when saving other fields to keep the existing key.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4 border-t pt-4">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Settings
          </Button>

          <div className="flex items-end gap-2 border-t pt-4">
            <div className="flex-1 space-y-2">
              <Label className="text-xs">Send a test message</Label>
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="e.g. 0701234567" />
            </div>
            <Button type="button" variant="outline" onClick={handleTestSend} disabled={testing || !settings.hasApiKey}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Test
            </Button>
          </div>
          {!settings.hasApiKey && (
            <p className="text-xs text-muted-foreground">Save an API key first before sending a test message.</p>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
