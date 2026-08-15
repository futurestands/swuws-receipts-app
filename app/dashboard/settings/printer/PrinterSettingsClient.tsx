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
import { Printer, Usb, Bluetooth, Settings2, RefreshCw, Wifi, Tablet, CheckCircle2 } from "lucide-react"
import { isNative } from "@/lib/mobile-hardware"
import { printerManager } from "@/lib/offline/printer-manager"

export function PrinterSettingsClient() {
  const [settings, setSettings] = useState<any>({ type: 'auto', paperWidth: '58mm', networkIp: '' })
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    sqliteService.initialize().then(() => {
      sqliteService.getPrinterSettings().then(s => {
        setSettings(s)
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
                {settings.type === 'network' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="printer-ip" className="text-xs font-bold uppercase text-muted-foreground">Printer IP Address</Label>
                <Input
                  id="printer-ip"
                  placeholder="e.g. 192.168.1.100"
                  value={settings.networkIp || ''}
                  onChange={(e) => handleSave({ networkIp: e.target.value })}
                  className="h-12 font-mono text-lg"
                />
              </div>
              <Button
                onClick={() => { handleSave({ type: 'network' }); toast.success("Network mode active"); }}
                variant={settings.type === 'network' ? 'default' : 'outline'}
                className="w-full h-12 font-bold shadow-sm"
              >
                {settings.type === 'network' ? 'Network Mode Enabled' : 'Switch to Network'}
              </Button>
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
