"use client"

import { useState, useTransition } from "react"
import { updateBranding, uploadLogo, updateLatestAppVersion } from "@/app/actions/settings"
import type { OrgSettings } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { toast } from "sonner"
import { RefreshCw, Smartphone } from "lucide-react"

export function BrandingPanel({ settings }: { settings: OrgSettings }) {
  const [orgName, setOrgName] = useState(settings.orgName)
  const [footerText, setFooterText] = useState(settings.footerText)
  const [address, setAddress] = useState(settings.address ?? "")
  const [phone, setPhone] = useState(settings.phone ?? "")
  const [receiptPrefix, setReceiptPrefix] = useState(settings.receiptPrefix)
  const [developerCredit, setDeveloperCredit] = useState(settings.developerCredit)
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl)
  const [appVersion, setAppVersion] = useState(settings.latestAppVersion)
  const [pending, startTransition] = useTransition()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateBranding({ orgName, footerText, address, phone, developerCredit, receiptPrefix })
      if (!result.ok) {
        toast.error("Failed to save")
        return
      }
      toast.success("Branding updated")
    })
  }

  async function handleUpdateVersion() {
    if (!appVersion) return
    startTransition(async () => {
      const result = await updateLatestAppVersion(appVersion)
      if (result.ok) {
        toast.success("App version updated. Agents have been notified.")
      } else {
        toast.error("Failed to update app version")
      }
    })
  }

  function handleLogo(file: File) {
    const formData = new FormData()
    formData.append("logo", file)
    startTransition(async () => {
      const result = await uploadLogo(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setLogoUrl(result.url)
      toast.success("Logo updated")
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization branding</CardTitle>
          <CardDescription>Shown on every receipt going forward.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization name</Label>
              <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footerText">Footer text</Label>
              <Input
                id="footerText"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiptPrefix">Acronym (e.g. SWUWS)</Label>
              <Input
                id="receiptPrefix"
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Used in receipt numbers and short branding areas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="developerCredit">Developer attribution (Advertisement)</Label>
              <Input
                id="developerCredit"
                value={developerCredit}
                onChange={(e) => setDeveloperCredit(e.target.value)}
                placeholder="e.g. Developed by Mugarura Johnson IT"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave empty to remove the attribution from login, sidebar, and receipts.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo">Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-10 w-10 object-contain border rounded" />
                )}
                <input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleLogo(file)
                  }}
                  className="text-sm"
                />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-brand-blue/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand-blue" />
            Mobile App Maintenance
          </CardTitle>
          <CardDescription>
            Manage the official version of the SWUWS Android app.
            Changing the version here triggers a notification for all field agents.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="flex items-end gap-4 max-w-sm">
              <div className="space-y-2 flex-1">
                 <Label htmlFor="appVersion">Latest App Version (e.g. 1.1.0)</Label>
                 <Input
                   id="appVersion"
                   value={appVersion}
                   onChange={(e) => setAppVersion(e.target.value)}
                   placeholder="1.0.0"
                 />
              </div>
              <Button
                onClick={handleUpdateVersion}
                disabled={pending || appVersion === settings.latestAppVersion}
                className="gap-2"
              >
                 <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
                 Publish Update
              </Button>
           </div>
        </CardContent>
        <CardFooter className="bg-brand-blue/5 py-3">
           <p className="text-[10px] text-brand-blue font-medium">
             Note: Ensure you have uploaded the corresponding APK file to the server&apos;s public folder before publishing.
           </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt disclaimer</CardTitle>
          <CardDescription>
            This text cannot be edited from the admin console, by design — the business
            requirement is that it can never change through the app. Every issued receipt also
            permanently stores a snapshot of the disclaimer at the moment it was printed, so past
            receipts stay accurate even if this default is ever changed in a future code release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={settings.disclaimer} readOnly rows={3} className="bg-muted/50" />
        </CardContent>
      </Card>
    </div>
  )
}
