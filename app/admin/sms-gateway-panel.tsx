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

const PROVIDER_COPY = {
  africastalking: {
    username: "Username",
    usernamePlaceholder: "Your Africa's Talking app username",
    usernameHint: "Use sandbox for test, or your live app username.",
    apiKey: "API Key",
    sender: "Sender ID (optional)",
    senderPlaceholder: "SWUWS",
  },
  twilio: {
    username: "Account SID",
    usernamePlaceholder: "ACxxxxxxxx",
    usernameHint: "From the Twilio console. Auth Token goes in API Key.",
    apiKey: "Auth Token",
    sender: "From number or Messaging Service SID",
    senderPlaceholder: "+2567… or MGxxxxxxxx",
  },
  infobip: {
    username: "Base URL (optional)",
    usernamePlaceholder: "api.infobip.com",
    usernameHint: "Leave blank for api.infobip.com, or paste the host from your Infobip portal.",
    apiKey: "API Key",
    sender: "Sender ID",
    senderPlaceholder: "SWUWS",
  },
} as const

export function SmsGatewayPanel({ settings }: { settings: SmsGatewaySettings }) {
  const [provider, setProvider] = useState(settings.provider ?? "africastalking")
  const [username, setUsername] = useState(settings.username ?? "")
  const [senderId, setSenderId] = useState(settings.senderId ?? "")
  const [apiKey, setApiKey] = useState("") // always starts blank -- see updateSmsGatewaySettings for why
  const [active, setActive] = useState(settings.active)
  const [testPhone, setTestPhone] = useState("")
  const [pending, startTransition] = useTransition()
  const [testing, startTestTransition] = useTransition()
  const copy = PROVIDER_COPY[provider as keyof typeof PROVIDER_COPY] ?? PROVIDER_COPY.africastalking

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateSmsGatewaySettings({ provider, username, senderId, apiKey, active })
      if (!result.ok) {
        toast.error(result.error || "Failed to save SMS gateway settings")
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
        toast.error("Test send failed — check your credentials and try again")
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
          Manage your SMS provider here. Africa's Talking, Twilio, and Infobip all send for real once the gateway is active and credentials are saved.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSave}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Gateway active</Label>
              <p className="text-xs text-muted-foreground">
                When off, messages are logged as simulated only — nothing actually sends.
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
              <Label>{copy.sender}</Label>
              <Input value={senderId} onChange={e => setSenderId(e.target.value)} placeholder={copy.senderPlaceholder} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{copy.username}</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder={copy.usernamePlaceholder} />
            <p className="text-xs text-muted-foreground">{copy.usernameHint}</p>
          </div>

          <div className="space-y-2">
            <Label>{copy.apiKey}</Label>
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
