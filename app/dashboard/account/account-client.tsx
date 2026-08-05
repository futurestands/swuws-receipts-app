"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { ShieldCheck, Lock, User, Smartphone, Download, Zap, RefreshCw } from "lucide-react"
import { CURRENT_APP_VERSION } from "@/lib/version"
import { setVibrationPreference, isNative } from "@/lib/mobile-hardware"
import { updateUserPreferences } from "@/app/actions/account"
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import type { OrgSettings } from "@/lib/db/schema"

type UserProfile = {
  id: string
  name: string
  email: string
  role: string
  preferences?: {
    vibrationEnabled?: boolean
  }
}

export function AccountClient({ user, settings, siteUrl }: { user: UserProfile, settings: OrgSettings, siteUrl: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [vibrationEnabled, setVibrationEnabled] = useState(user.preferences?.vibrationEnabled ?? true)
  const [loading, setLoading] = useState(false)
  const [isUpdatingPrefs, setIsUpdatingPrefs] = useState(false)

  // Initialize local haptic state on mount
  useEffect(() => {
    setVibrationPreference(vibrationEnabled)
  }, [vibrationEnabled])

  const isOutdated = settings.latestAppVersion !== CURRENT_APP_VERSION && isNative()

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }

    setLoading(true)
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })

    setLoading(false)
    if (error) {
      toast.error(error.message || "Failed to update password")
    } else {
      toast.success("Password updated successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    }
  }

  async function handleToggleVibration(checked: boolean) {
    setVibrationEnabled(checked)
    setVibrationPreference(checked)

    setIsUpdatingPrefs(true)
    try {
      await updateUserPreferences({ vibrationEnabled: checked })
      toast.success(checked ? "Vibration feedback enabled" : "Vibration feedback disabled")
    } catch (err) {
      console.error(err)
      toast.error("Failed to save preference")
    } finally {
      setIsUpdatingPrefs(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Profile Information
            </CardTitle>
            <CardDescription>Your account details and organizational role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Full Name</Label>
              <p className="font-bold">{user.name}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">Email Address</Label>
              <p className="font-medium">{user.email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase">System Role</Label>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-blue" />
                <span className="font-bold text-brand-blue uppercase">{user.role.replace('_', ' ')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Preferences */}
        <Card className="border-emerald-200 bg-emerald-50/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <Zap className="h-5 w-5" /> App Experience
            </CardTitle>
            <CardDescription>Customize how the app responds to your touch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                   <Label className="text-sm font-bold">Tactile Feedback (Vibration)</Label>
                   <p className="text-xs text-muted-foreground">The phone gives a short &quot;tick&quot; vibration when you tap buttons.</p>
                </div>
                <Switch
                   checked={vibrationEnabled}
                   onCheckedChange={handleToggleVibration}
                   disabled={isUpdatingPrefs}
                />
             </div>
          </CardContent>
          <CardFooter className="pt-0">
             <p className="text-[10px] text-muted-foreground italic">Note: Only works on Android devices.</p>
          </CardFooter>
        </Card>

        {/* Change Password */}
        <Card className="border-primary/20 shadow-lg">
          <form onSubmit={handleChangePassword}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Lock className="h-5 w-5" /> Security & Password
              </CardTitle>
              <CardDescription>Update your password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current Password</Label>
                <Input
                  id="current"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New Password</Label>
                <Input
                  id="new"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Change Password"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      {/* Mobile App Section */}
      <Card className="border-brand-blue/20 bg-brand-blue/5">
        <CardHeader>
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-brand-blue/10 text-brand-blue">
                <Smartphone className="h-6 w-6" />
             </div>
             <div>
                <CardTitle>SWUWS Mobile App</CardTitle>
                <CardDescription>
                   {isNative()
                      ? `Running v${CURRENT_APP_VERSION}`
                      : "Get the official Android application for field operations."}
                </CardDescription>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 items-center">
             <div className="space-y-2">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isOutdated
                    ? "A newer version of the SWUWS app is available. Please update now to get the latest features and fixes."
                    : "The SWUWS Mobile App is optimized for field collection. It includes features not available in the web version:"}
                </p>
                {!isOutdated && (
                   <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-4">
                      <li>High-speed QR Code scanning for customer lookup</li>
                      <li>Bluetooth Thermal Receipt printing</li>
                      <li>Location-aware meter reading capture</li>
                      <li>Optimized interface for one-handed use</li>
                   </ul>
                )}
             </div>
             <div className="flex flex-col gap-3">
                {isNative() && !isOutdated ? (
                   <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl bg-emerald-500/5 text-emerald-700">
                      <ShieldCheck className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-bold text-sm">App is Up to Date</p>
                      <p className="text-[10px] opacity-70 uppercase tracking-widest mt-1">v{CURRENT_APP_VERSION}</p>
                   </div>
                ) : (
                   <Button
                      asChild
                      size="lg"
                      variant={isOutdated ? "default" : "outline"}
                      className={cn(
                         "w-full gap-2 font-bold shadow-md h-14",
                         isOutdated && "bg-brand-blue hover:bg-brand-blue/90 animate-pulse ring-4 ring-brand-blue/20"
                      )}
                   >
                      <a
                        href={`${siteUrl}/swuws-portal.apk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                         {isOutdated ? (
                            <><RefreshCw className="h-6 w-6 animate-spin-slow" /> UPDATE TO v{settings.latestAppVersion}</>
                         ) : (
                            <><Download className="h-5 w-5" /> DOWNLOAD FOR ANDROID (APK)</>
                         )}
                      </a>
                   </Button>
                )}
                {!isNative() && (
                   <p className="text-[10px] text-center text-muted-foreground italic">
                      Recommended for Field Agents and Plumbers.
                   </p>
                )}
                {isOutdated && (
                   <p className="text-[10px] text-center text-muted-foreground italic">
                      Latest Version: {settings.latestAppVersion} | Your Version: {CURRENT_APP_VERSION}
                   </p>
                )}
                {!isOutdated && isNative() && (
                   <p className="text-[10px] text-center text-muted-foreground italic">
                      You are using the latest version of the SWUWS Mobile App.
                   </p>
                )}
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
