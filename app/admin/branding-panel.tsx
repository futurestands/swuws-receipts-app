"use client"

import { useState, useTransition } from "react"
import { updateBranding, uploadLogo } from "@/app/actions/settings"
import type { OrgSettings } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

export function BrandingPanel({ settings }: { settings: OrgSettings }) {
  const [orgName, setOrgName] = useState(settings.orgName)
  const [footerText, setFooterText] = useState(settings.footerText)
  const [address, setAddress] = useState(settings.address ?? "")
  const [phone, setPhone] = useState(settings.phone ?? "")
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl)
  const [pending, startTransition] = useTransition()

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateBranding({ orgName, footerText, address, phone })
      if (!result.ok) {
        toast.error("Failed to save")
        return
      }
      toast.success("Branding updated")
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
