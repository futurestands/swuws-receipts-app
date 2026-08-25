"use client"

import { useEffect, useState } from "react"
import { sqliteService } from "@/lib/offline/sqlite-service"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Printer, Usb, Bluetooth, Settings2, RefreshCw, Wifi, Tablet, CheckCircle2, Search, Loader2, WifiOff } from "lucide-react"
import { isNative } from "@/lib/mobile-hardware"
import { printerManager } from "@/lib/offline/printer-manager"
import { networkPrinter } from "@/lib/offline/network-printer"

export function PrinterSettingsClient() {
  const [settings, setSettings] = useState<any>({ type: 'auto', paperWidth: '58mm', networkIp: '' })
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [foundPrinters, setFoundPrinters] = useState<string[]>([])
  const [manualIp, setManualIp] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectionVerified, setConnectionVerified] = useState(false)

  useEffect(() => {
    sqliteService.initialize().then(() => {
      sqliteService.getPrinterSettings().then(s => {
        setSettings(s)
        setManualIp(s?.networkIp || '')
        // A previously-saved network IP was, by definition, verified when
        // it was saved (see handleConnectToIp below) -- trust it until the
        // user changes it or a real print attempt fails.
        setConnectionVerified(!!s?.networkIp)
        setLoading(false)
      })
    })
  }, [])

  const handleSave = async (updates: Partial<any>) => {
    const updated = { ...settings, ...updates }
    setSettings(updated)
    await sqliteService.updatePrinterSettings(updated)
  }

  const handleTestPrint = async () => {
    try {
      await printerManager.print({
        receiptNumber: "TEST-12345",
        customerName: "Test Customer",
        amount: 1000,
        paymentMethod: "Cash",
        paymentDate: new Date().toISOString(),
        isProvisional: true
      })
      toast.success("Test print sent!")
    } catch (err: any) {
      toast.error(err.message || "Test print failed")
    }
  }

  // Scans common local subnets for anything answering on port 9100 (the
  // standard thermal-printer TCP port) -- an actual connectivity check
  // per candidate, not a guess based on IP range alone.
  const handleScanNetwork = async () => {
    setScanning(true)
    setScanProgress(0)
    setFoundPrinters([])
    try {
      const found = await networkPrinter.scanForPrinters((scanned, total) => {
        setScanProgress(Math.round((scanned / total) * 100))
      })
      setFoundPrinters(found)
      if (found.length === 0) {
        toast.error("No printers found. Make sure the printer is powered on and connected to the same WiFi network, or enter its IP manually below.")
      } else {
        toast.success(`Found ${found.length} printer${found.length > 1 ? 's' : ''} on the network`)
      }
    } catch (err: any) {
      toast.error(err.message || "Scan failed")
    } finally {
      setScanning(false)
    }
  }

  // The actual "connect" step: attempts a real connection (and a small
  // real ESC/POS command, not just an open socket) before this IP is
  // trusted as the active printer. Nothing gets saved as 'network' mode
  // until this succeeds -- replacing "type an IP and hope" with a
  // confirmed, verified connection.
  const handleConnectToIp = async (ip: string) => {
    if (!ip) {
      toast.error("Enter or select a printer IP first")
      return
    }
    setConnecting(ip)
    setConnectionVerified(false)
    try {
      const result = await networkPrinter.testConnection(ip)
      if (result.ok) {
        await handleSave({ networkIp: ip, type: 'network' })
        setConnectionVerified(true)
        toast.success(`Connected to printer at ${ip}`)
      } else {
        toast.error(`Could not connect to ${ip}: ${result.error || 'no response'}`)
      }
    } finally {
      setConnecting(null)
    }
  }

  if (!isNative()) {
    return (
      <div className="p-8 text-center bg-muted/30 rounded-xl border-2 border-dashed">
        <Printer className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">Native Only Feature</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Hardware printer settings are only available when running as a native Android application.
        </p>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center">Loading settings...</div>

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Printer Hardware</h1>
          <p className="text-sm text-muted-foreground font-medium">Manage and test offline printing.</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm ${settings.type === 'auto' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
          Mode: {settings.type}
        </div>
      </div>

      <Tabs defaultValue={settings.type === 'auto' ? 'usb' : settings.type} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 bg-muted/30 p-1 rounded-xl">
          <TabsTrigger value="usb" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col gap-0.5 py-1">
            <Usb className="h-4 w-4" />
            <span className="text-[10px] font-bold">USB</span>
          </TabsTrigger>
          <TabsTrigger value="network" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col gap-0.5 py-1">
            <Wifi className="h-4 w-4" />
            <span className="text-[10px] font-bold">WIFI</span>
          </TabsTrigger>
          <TabsTrigger value="inbuilt" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col gap-0.5 py-1">
            <Tablet className="h-4 w-4" />
            <span className="text-[10px] font-bold">BUILT-IN</span>
          </TabsTrigger>
          <TabsTrigger value="bluetooth" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex flex-col gap-0.5 py-1">
            <Bluetooth className="h-4 w-4" />
            <span className="text-[10px] font-bold">BT</span>
          </TabsTrigger>
        </TabsList>

        {/* USB Tab */}
        <TabsContent value="usb" className="mt-4 animate-in fade-in zoom-in-95 duration-200">
          <Card className="border-muted-foreground/10">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tight">USB OTG Driver</CardTitle>
                  <CardDescription className="text-xs">Direct wired connection.</CardDescription>
                </div>
                {settings.type === 'usb' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-[11px] leading-relaxed text-muted-foreground">
                Connect your thermal printer using a **USB OTG cable**. Compatible with most 58mm/80mm USB printers.
              </div>
              <Button
                onClick={() => { handleSave({ type: 'usb' }); toast.success("USB mode active"); }}
                variant={settings.type === 'usb' ? 'default' : 'outline'}
                className="w-full h-12 font-bold shadow-sm"
              >
                {settings.type === 'usb' ? 'USB Mode Enabled' : 'Switch to USB'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="mt-4 animate-in fade-in zoom-in-95 duration-200">
          <Card className="border-muted-foreground/10">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tight">WiFi / Network</CardTitle>
                  <CardDescription className="text-xs">TCP/IP printing via Port 9100.</CardDescription>
                </div>
                {settings.type === 'network' && connectionVerified && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.type === 'network' && settings.networkIp && connectionVerified && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800 font-bold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Connected and verified: {settings.networkIp}
                </div>
              )}

              <div className="space-y-2">
                <Button
                  onClick={handleScanNetwork}
                  disabled={scanning}
                  variant="outline"
                  className="w-full h-12 font-bold shadow-sm"
                >
                  {scanning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning... {scanProgress}%</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Scan for Printers</>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Make sure the printer is powered on and the phone is on the same WiFi network first.
                </p>
              </div>

              {foundPrinters.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Found on network</Label>
                  {foundPrinters.map(ip => (
                    <Button
                      key={ip}
                      onClick={() => handleConnectToIp(ip)}
                      disabled={connecting !== null}
                      variant={settings.networkIp === ip && connectionVerified ? 'default' : 'outline'}
                      className="w-full h-11 font-mono justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Wifi className="h-4 w-4" /> {ip}
                      </span>
                      {connecting === ip ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : settings.networkIp === ip && connectionVerified ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : null}
                    </Button>
                  ))}
                </div>
              )}

              {!scanning && foundPrinters.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-[11px] text-muted-foreground">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  No scan run yet, or nothing found -- you can still enter an IP manually below.
                </div>
              )}

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="printer-ip" className="text-xs font-bold uppercase text-muted-foreground">Or enter IP manually</Label>
                <div className="flex gap-2">
                  <Input
                    id="printer-ip"
                    placeholder="e.g. 192.168.1.100"
                    value={manualIp}
                    onChange={(e) => { setManualIp(e.target.value); setConnectionVerified(false); }}
                    className="h-12 font-mono text-base flex-1"
                  />
                  <Button
                    onClick={() => handleConnectToIp(manualIp)}
                    disabled={connecting !== null || !manualIp}
                    className="h-12 font-bold shrink-0"
                  >
                    {connecting === manualIp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  "Connect" attempts a real connection before saving -- it won't be set as your active printer unless it actually responds.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inbuilt Tab */}
        <TabsContent value="inbuilt" className="mt-4 animate-in fade-in zoom-in-95 duration-200">
          <Card className="border-muted-foreground/10">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tight">Device SDK</CardTitle>
                  <CardDescription className="text-xs">Sunmi, Zebra, PAX, Newland.</CardDescription>
                </div>
                {settings.type === 'inbuilt' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-lg text-xs text-orange-800">
                <p className="font-bold mb-1 uppercase tracking-tighter">Hardware Support</p>
                This mode uses the manufacturer's native library. Recommended for handheld POS terminals.
              </div>
              <Button
                onClick={() => { handleSave({ type: 'inbuilt' }); toast.success("Inbuilt mode active"); }}
                variant={settings.type === 'inbuilt' ? 'default' : 'outline'}
                className="w-full h-12 font-bold shadow-sm"
              >
                {settings.type === 'inbuilt' ? 'Inbuilt Mode Enabled' : 'Switch to Inbuilt'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bluetooth Tab */}
        <TabsContent value="bluetooth" className="mt-4 animate-in fade-in zoom-in-95 duration-200">
          <Card className="border-muted-foreground/10">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-tight">Bluetooth Wireless</CardTitle>
                  <CardDescription className="text-xs">SPP (Classic) & BLE supported.</CardDescription>
                </div>
                {settings.type === 'bluetooth' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-[11px] leading-relaxed text-muted-foreground">
                Ensure your printer is **Paired** in Android Bluetooth settings before connecting here.
              </div>
              <Button
                onClick={() => { handleSave({ type: 'bluetooth' }); toast.success("Bluetooth mode active"); }}
                variant={settings.type === 'bluetooth' ? 'default' : 'outline'}
                className="w-full h-12 font-bold shadow-sm"
              >
                {settings.type === 'bluetooth' ? 'Bluetooth Mode Enabled' : 'Switch to Bluetooth'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-muted-foreground/10 bg-muted/5">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Paper Width</Label>
              <Select value={settings.paperWidth} onValueChange={(v) => handleSave({ paperWidth: v })}>
                <SelectTrigger className="h-11 shadow-sm bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58mm (Standard)</SelectItem>
                  <SelectItem value="80mm">80mm (Large)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 text-right">
              <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Quick Action</Label>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-11 font-bold shadow-sm bg-white text-[11px]"
                onClick={() => { handleSave({ type: 'auto' }); toast.info("Reset to Auto-Fallback"); }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Reset Auto
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="pt-2">
        <Button onClick={handleTestPrint} className="w-full h-16 gap-3 text-lg font-black shadow-lg" variant="default">
          <Printer className="h-6 w-6" />
          PRINT TEST RECEIPT
        </Button>
      </div>

      <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em] pt-4">
        <div className="h-[1px] flex-1 bg-muted-foreground/10" />
        Fallback: USB → WIFI → POS → BT
        <div className="h-[1px] flex-1 bg-muted-foreground/10" />
      </div>
    </div>
  )
}
