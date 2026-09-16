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
import { Printer, Usb, Bluetooth, RefreshCw, Wifi, Tablet, CheckCircle2, Search, Loader2, Download } from "lucide-react"
import { isNative } from "@/lib/mobile-hardware"
import { printerManager } from "@/lib/offline/printer-manager"
import { networkPrinter } from "@/lib/offline/network-printer"
import { bluetoothLePrinter } from "@/lib/offline/bluetooth-printer"
import { printerKindLabel } from "@/lib/offline/printer-kind"
import { openPrinterDriverStore } from "@/lib/offline/office-print"

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

  const handleConnectToIp = async (ip: string) => {
    if (!ip) {
      toast.error("Enter or select a printer IP first")
      return
    }
    setConnecting(ip)
    setConnectionVerified(false)
    try {
      const classified = await networkPrinter.classifyHost(ip.trim())
      if (classified.reachable) {
        const kind = classified.kind === 'unknown' ? 'thermal' : classified.kind
        await handleSave({ networkIp: ip.trim(), type: 'network', printerKind: kind })
        setConnectionVerified(true)
        if (kind === 'office') {
          toast.success(`Office printer at ${ip.trim()}. Print opens Android's sheet — install Mopria if the list is empty.`)
        } else {
          toast.success(`Receipt printer at ${ip.trim()} is ready`)
        }
      } else {
        toast.error(classified.error || `No printer answered at ${ip}`)
      }
    } finally {
      setConnecting(null)
    }
  }

  const handlePairBluetooth = async () => {
    setConnecting('bluetooth')
    try {
      const result = await bluetoothLePrinter.pair()
      if (result.ok && result.deviceId) {
        await handleSave({ type: 'bluetooth', deviceId: result.deviceId, printerKind: 'thermal' })
        toast.success("Bluetooth printer saved. Use Print test receipt below.")
      } else {
        toast.error(result.error || "Bluetooth pairing cancelled")
      }
    } catch (err: any) {
      toast.error(err.message || "Bluetooth pairing failed")
    } finally {
      setConnecting(null)
    }
  }

  const handleInstallDrivers = async () => {
    try {
      await openPrinterDriverStore()
    } catch {
      toast.error("Could not open Play Store. Search for Mopria Print Service.")
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
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border shadow-sm ${settings.printerKind === 'office' ? 'bg-amber-50 text-amber-800 border-amber-200' : settings.type === 'auto' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
          {printerKindLabel(settings.printerKind)}
        </div>
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black uppercase tracking-tight">What kind of printer?</CardTitle>
          <CardDescription className="text-xs">
            Receipts go to a thermal roll. Walk-in invoices go A4 to HP, Epson or Kyocera. The app picks the format from this setting — we do not install Windows drivers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={settings.printerKind !== 'office' ? 'default' : 'outline'}
              className="h-12 font-bold"
              onClick={() => {
                handleSave({ printerKind: 'thermal' })
                toast.info("Receipt roll printer. Field collections will use ESC/POS.")
              }}
            >
              Receipt roll
            </Button>
            <Button
              type="button"
              variant={settings.printerKind === 'office' ? 'default' : 'outline'}
              className="h-12 font-bold"
              onClick={() => {
                handleSave({ printerKind: 'office' })
                toast.info("Office A4. Print opens Android's sheet — pick HP, Epson or Kyocera.")
              }}
            >
              Office A4
            </Button>
          </div>
          {settings.printerKind === 'office' && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-950 leading-relaxed">
                HP, Epson and Kyocera need a print service on this phone — that is the driver. Install Mopria Print Service (works with all three). Brand apps from HP / Epson / Kyocera also work if Mopria does not list yours.
              </p>
              <Button type="button" variant="outline" className="w-full h-11 font-bold bg-white" onClick={handleInstallDrivers}>
                <Download className="h-4 w-4 mr-2" />
                Install Mopria Print Service
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="network" className="w-full">
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
                USB OTG is not available in this Android build. Use WiFi (printer IP) or Bluetooth.
              </div>
              <Button disabled variant="outline" className="w-full h-12 font-bold">
                USB not available
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
                  <CardDescription className="text-xs">Receipt printers on port 9100. Office lasers are classified on 631 and never sent ESC/POS.</CardDescription>
                </div>
                {settings.type === 'network' && connectionVerified && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.type === 'network' && settings.networkIp && connectionVerified && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800 font-bold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Ready: {settings.networkIp}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="printer-ip" className="text-xs font-bold uppercase text-muted-foreground">Printer IP</Label>
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
                  Phone and printer must be on the same WiFi. Connect classifies thermal vs HP/Epson/Kyocera. Office printers can skip the IP and use Office A4 above.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Button
                  onClick={handleScanNetwork}
                  disabled={scanning || connecting !== null}
                  variant="outline"
                  className="w-full h-12 font-bold shadow-sm"
                >
                  {scanning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning... {scanProgress}%</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" /> Scan network</>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Scan is slow on purpose so it does not knock the phone off WiFi. Prefer typing the IP if you know it.
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
              <div className="p-4 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                Built-in Sunmi / PAX printing is not available in this Android build. Use WiFi or Bluetooth.
              </div>
              <Button disabled variant="outline" className="w-full h-12 font-bold">
                Built-in not available
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
                  <CardDescription className="text-xs">Bluetooth LE printers only.</CardDescription>
                </div>
                {settings.type === 'bluetooth' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-[11px] leading-relaxed text-muted-foreground">
                Turn the printer on, then tap Pair. Pick it in the Android list. Bluetooth Classic (SPP) dongles are not supported in this build — BLE printers are.
              </div>
              <Button
                onClick={handlePairBluetooth}
                disabled={connecting !== null}
                variant={settings.type === 'bluetooth' ? 'default' : 'outline'}
                className="w-full h-12 font-bold shadow-sm"
              >
                {connecting === 'bluetooth' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bluetooth className="h-4 w-4 mr-2" />}
                {settings.type === 'bluetooth' && settings.deviceId ? 'Re-pair Bluetooth printer' : 'Pair Bluetooth printer'}
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
        Thermal roll or office A4
        <div className="h-[1px] flex-1 bg-muted-foreground/10" />
      </div>
    </div>
  )
}
