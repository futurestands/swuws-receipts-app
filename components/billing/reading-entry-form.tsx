"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { CheckCircle2, Calculator, Send, Search, User, Printer, XCircle, History, Trash2, Smartphone, Loader2, ShieldAlert } from "lucide-react"
import { getTariffForCustomer, submitMeterReading, searchCustomersForReading, cancelMeterReading, sendReadingSms, reportBillingDiscrepancy } from "@/app/actions/billing-engine"
import { calculateBill, type BillingCalculation } from "@/lib/billing/math"
import type { Customer, BillingPeriod, TariffConfiguration } from "@/lib/db/schema"
import { cn } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"

export function ReadingEntryForm({
  activePeriod,
  initialHistory = [],
  currentUser
}: {
  activePeriod: BillingPeriod
  initialHistory?: any[]
  currentUser: { id: string; role: string }
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [currentReading, setCurrentReading] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [tariff, setTariff] = useState<TariffConfiguration | null>(null)
  const [calculation, setCalculation] = useState<BillingCalculation | null>(null)

  const [discrepancyData, setDiscrepancyData] = useState<{
    open: boolean;
    attemptedReading: number;
    existingAmount: number;
    reason: string;
  } | null>(null)

  const [lastSubmission, setLastSubmission] = useState<{
    ok: boolean;
    readingId: string;
    customerName: string;
    meterRef?: string | null;
    calc: BillingCalculation;
    previousBalance: number;
    totalDue: number;
    phone: string;
    isSmsSent: boolean;
  } | null>(null)
  const [history, setHistory] = useState<any[]>(initialHistory)
  const [isPending, startTransition] = useTransition()
  const [isSendingSms, setIsSendingSms] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Quick Search Logic
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!searchQuery.trim() || selectedCustomer) {
      setSearchResults([])
      return
    }

    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchCustomersForReading(searchQuery)
        setSearchResults(results)
      } catch (err) {
        console.error("Search failed", err)
      }
    }, 300)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery, selectedCustomer])

  // Fetch tariff when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      getTariffForCustomer(selectedCustomer.id).then(setTariff)
      setCalculation(null)
      setCurrentReading("")
      setCustomerPhone(selectedCustomer.phone || "")
    } else {
      setTariff(null)
      setCustomerPhone("")
    }
  }, [selectedCustomer])

  // Recalculate bill in real-time
  useEffect(() => {
    if (selectedCustomer && tariff && currentReading) {
      const current = Number(currentReading)
      if (!isNaN(current)) {
        const calc = calculateBill(selectedCustomer.lastReading, current, tariff)
        setCalculation(calc)
      }
    } else {
      setCalculation(null)
    }
  }, [currentReading, selectedCustomer, tariff])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer || !currentReading) return

    const readingValue = Number(currentReading)
    if (readingValue < (selectedCustomer?.lastReading || 0)) {
      toast.error("Current reading cannot be lower than the previous reading.")
      return
    }

    startTransition(async () => {
      try {
        const result = await submitMeterReading({
          customerId: selectedCustomer.id,
          billingPeriodId: activePeriod.id,
          currentReading: readingValue,
          notes,
          phoneNumber: customerPhone,
          sendSms: false // Finding: Decoupling SMS from creation
        })

        if (result.ok) {
          toast.success("Reading captured successfully!")

          // Store last submission for printing before clearing form
          if (calculation) {
            const previousBalance = selectedCustomer.accountBalance || 0
            const totalDue = calculation.totalNewBill + previousBalance

            const newSubmission = {
              ok: true,
              readingId: result.readingId!,
              customerName: selectedCustomer.name,
              meterRef: selectedCustomer.meterRef,
              calc: calculation,
              previousBalance,
              totalDue,
              phone: customerPhone,
              isSmsSent: false
            }

            setLastSubmission(newSubmission)

            // Update local history
            setHistory(prev => [{
              id: result.readingId,
              customerName: selectedCustomer.name,
              meterRef: selectedCustomer.meterRef,
              previousReading: selectedCustomer.lastReading,
              currentReading: readingValue,
              consumption: calculation.consumption,
              billedAmount: calculation.totalNewBill,
              previousBalance,
              totalDue,
              createdAt: new Date(),
              periodName: activePeriod.periodName,
              isNotified: false
            }, ...prev.slice(0, 19)])
          }

          // Reset form (keeping lastSubmission visible for printing)
          setSelectedCustomer(null)
          setSearchQuery("")
          setCurrentReading("")
          setNotes("")
        }
      } catch (err: any) {
        if (err.message.includes("already been billed via the monthly import")) {
          // Open discrepancy dialog
          setDiscrepancyData({
            open: true,
            attemptedReading: readingValue,
            existingAmount: selectedCustomer.accountBalance || 0,
            reason: ""
          })
        } else {
          toast.error(err.message || "Failed to submit reading")
        }
      }
    })
  }

  async function handleReportDiscrepancy() {
    if (!selectedCustomer || !discrepancyData || !discrepancyData.reason) {
      toast.error("Please provide a reason for the discrepancy.")
      return
    }

    startTransition(async () => {
      try {
        await reportBillingDiscrepancy({
          customerId: selectedCustomer.id,
          billingPeriodId: activePeriod.id,
          attemptedReading: discrepancyData.attemptedReading,
          existingAmount: discrepancyData.existingAmount,
          reason: discrepancyData.reason
        })
        toast.success("Discrepancy reported to supervisor.")
        setDiscrepancyData(null)
        setSelectedCustomer(null)
        setSearchQuery("")
        setCurrentReading("")
      } catch (err: any) {
        toast.error(err.message || "Failed to report discrepancy")
      }
    })
  }

  async function handleSendSms(readingId: string) {
    try {
      setIsSendingSms(true)
      const result = await sendReadingSms(readingId)
      if (result.ok) {
        toast.success("SMS Bill sent successfully!")
        setLastSubmission(prev => prev ? { ...prev, isSmsSent: true } : null)
        setHistory(prev => prev.map(h => h.id === readingId ? { ...h, isNotified: true } : h))
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "Failed to send SMS")
    } finally {
      setIsSendingSms(false)
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Are you sure you want to cancel this reading? This will reverse the bill and restore the customer's previous reading state.")) return

    try {
      const result = await cancelMeterReading(id)
      if (result.ok) {
        toast.success("Reading cancelled successfully.")
        setHistory(prev => prev.filter(h => h.id !== id))
        if (lastSubmission?.readingId === id) setLastSubmission(null)
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || "Failed to cancel reading")
    }
  }

  return (
    <div className="space-y-6">
      {/* SUCCESS & DELIVERY OPTIONS MODAL */}
      <Dialog
         open={!!lastSubmission}
         onOpenChange={(open) => !open && setLastSubmission(null)}
      >
        <DialogContent className="max-w-md w-[95vw] no-print p-0 overflow-hidden border-none shadow-2xl bg-white rounded-2xl">
          <div className="flex flex-col animate-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-green-50/50">
               <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                     <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-black text-green-900 tracking-tight">Saved Successfully</h2>
               </div>
               <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-green-100/50"
                  onClick={() => setLastSubmission(null)}
               >
                  <XCircle className="h-4 w-4 text-muted-foreground" />
               </Button>
            </div>

            <div className="p-6 space-y-6">
               {/* Amount Due Display */}
               <div className="text-center space-y-1">
                  <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Total Amount Due</p>
                  <p className="text-4xl font-black text-primary drop-shadow-sm">
                     {lastSubmission ? formatUGX(lastSubmission.totalDue) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">for {lastSubmission?.customerName}</p>
               </div>

               <div className="grid grid-cols-1 gap-4">
                  {/* PRINT OPTION */}
                  <div className="space-y-2">
                     <Button
                        className="w-full h-16 text-lg bg-[#2c4a5e] hover:bg-[#1e3240] text-white font-black gap-3 shadow-lg border-b-4 border-[#142129] active:border-b-0 active:translate-y-1 transition-all"
                        onClick={() => window.print()}
                     >
                        <Printer className="h-6 w-6" /> PRINT PHYSICAL TICKET
                     </Button>
                     <p className="text-[10px] text-center text-muted-foreground uppercase font-bold tracking-tighter">Generate a paper demand note</p>
                  </div>

                  <div className="relative py-2">
                     <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                     <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-muted-foreground font-bold italic">OR</span></div>
                  </div>

                  {/* SMS OPTION */}
                  <div className="space-y-2">
                     <div className={cn(
                        "p-3 rounded-lg border text-center transition-colors mb-2",
                        lastSubmission?.isSmsSent ? "bg-green-50 border-green-100 text-green-800" : "bg-muted/30 border-muted text-muted-foreground"
                     )}>
                        <p className="text-[10px] uppercase font-bold mb-0.5">Recipient Phone</p>
                        <p className="text-sm font-bold">{lastSubmission?.phone || "No phone provided"}</p>
                     </div>

                     <Button
                        className={cn(
                           "w-full h-16 text-lg gap-3 font-black shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition-all",
                           lastSubmission?.isSmsSent
                              ? "bg-green-600 hover:bg-green-700 text-white border-green-800"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-800"
                        )}
                        onClick={() => lastSubmission && handleSendSms(lastSubmission.readingId)}
                        disabled={isSendingSms || !lastSubmission?.phone}
                     >
                        {isSendingSms ? (
                           <Loader2 className="h-6 w-6 animate-spin" />
                        ) : lastSubmission?.isSmsSent ? (
                           <><CheckCircle2 className="h-6 w-6" /> RESEND SMS BILL</>
                        ) : (
                           <><Send className="h-6 w-6" /> SEND SMS NOTIFICATION</>
                        )}
                     </Button>
                  </div>
               </div>
            </div>

            {/* Footer Tip */}
            <div className="bg-muted/20 p-3 text-center border-t">
               <p className="text-[10px] font-medium text-muted-foreground italic">
                  Tip: You can always reprint or resend from the history table below.
               </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DISCREPANCY REPORTING DIALOG */}
      <Dialog
        open={!!discrepancyData?.open}
        onOpenChange={(open) => !open && setDiscrepancyData(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              Report Data Discrepancy
            </DialogTitle>
            <DialogDescription>
              This customer was already billed via an import. If you believe the imported data is wrong, you can report your reading for admin review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-amber-50 rounded-lg text-xs space-y-1.5 border border-amber-100">
              <div className="flex justify-between text-amber-900">
                <span>Imported Amount:</span>
                <span className="font-bold">{formatUGX(discrepancyData?.existingAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-amber-900">
                <span>Your Reading:</span>
                <span className="font-bold">{discrepancyData?.attemptedReading}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason / Field Observation</Label>
              <Textarea
                placeholder="Explain why the imported data might be wrong (e.g. 'Meter was recently replaced', 'Reading matches physical meter but not import')..."
                value={discrepancyData?.reason || ""}
                onChange={(e) => setDiscrepancyData(prev => prev ? { ...prev, reason: e.target.value } : null)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setDiscrepancyData(null)}>Cancel</Button>
            <Button
              variant="default"
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleReportDiscrepancy}
              disabled={isPending || !discrepancyData?.reason}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PRINT-ONLY AREA (Hidden on screen) */}
      <div className="hidden print:block print-area">
        <div style={{ fontFamily: 'serif', maxWidth: '350px', margin: 'auto', padding: '10px', border: '1px solid #eee' }}>
          <div className="text-center border-b-2 border-black pb-4 mb-4">
            <h2 className="text-xl italic font-black uppercase">SOUTHWESTERN UMBRELLA</h2>
            <p className="text-xs font-bold uppercase tracking-widest">Water Demand Note</p>
          </div>

          <table className="w-full text-sm">
            <tbody>
              <tr><td className="font-bold py-1">Customer:</td><td className="text-right">{lastSubmission?.customerName}</td></tr>
              {lastSubmission?.meterRef && (
                <tr><td className="font-bold py-1">Meter #:</td><td className="text-right">{lastSubmission.meterRef}</td></tr>
              )}
              <tr><td className="font-bold py-1">Period:</td><td className="text-right">{activePeriod.periodName}</td></tr>
              <tr className="border-t border-dashed mt-2"><td className="py-1">Prev Reading:</td><td className="text-right font-mono">{lastSubmission?.calc.previousReading}</td></tr>
              <tr><td className="py-1">Curr Reading:</td><td className="text-right font-mono font-bold">{lastSubmission?.calc.currentReading}</td></tr>
              <tr className="border-b border-black"><td className="py-1">Consumption:</td><td className="text-right font-black">{lastSubmission?.calc.consumption} m³</td></tr>

              <tr><td className="py-1 pt-4">Current Bill:</td><td className="text-right pt-4">{formatUGX(lastSubmission?.calc.totalNewBill || 0)}</td></tr>
              <tr><td className="py-1">Previous Arrears:</td><td className="text-right">{formatUGX(lastSubmission?.previousBalance || 0)}</td></tr>

              <tr className="border-t-2 border-black font-black text-lg">
                <td className="py-2 uppercase">Total Due:</td>
                <td className="text-right py-2">{formatUGX(lastSubmission?.totalDue || 0)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-8 text-center text-[10px] italic">
            <p>Proof of Meter Reading. Please pay promptly.</p>
            <p suppressHydrationWarning>Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 no-print">
      <Card className="card-accent-blue shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-brand-blue" />
            Capture Reading
          </CardTitle>
          <CardDescription>Enter the latest meter values for {activePeriod.periodName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 relative">
              <Label>Find Customer</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type name, account # or meter ref..."
                  className="pl-9 h-11"
                  value={selectedCustomer ? selectedCustomer.name : searchQuery}
                  onChange={(e) => {
                    if (selectedCustomer) setSelectedCustomer(null)
                    setSearchQuery(e.target.value)
                  }}
                />
                {selectedCustomer && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-9"
                    onClick={() => {
                      setSelectedCustomer(null)
                      setSearchQuery("")
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && !selectedCustomer && (
                <div className="absolute z-10 w-full mt-1 bg-card border rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                  {searchResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/50 border-b last:border-0 flex flex-col transition-colors"
                      onClick={() => {
                        setSelectedCustomer(c)
                        setSearchResults([])
                      }}
                    >
                      <span className="font-bold text-sm">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-2">
                        Account: {c.customerAccount || 'N/A'} · Meter: {c.meterRef || 'N/A'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedCustomer && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 text-sm space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" /> Previous Reading:</span>
                  <span className="font-bold">{selectedCustomer.lastReading}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Recorded Date:</span>
                  <span>{selectedCustomer.lastReadingDate ? new Date(selectedCustomer.lastReadingDate).toLocaleDateString() : 'Never'}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reading">Current Reading (Total Rdg)</Label>
              <Input
                id="reading"
                type="number"
                placeholder="0000"
                value={currentReading}
                onChange={(e) => setCurrentReading(e.target.value)}
                disabled={!selectedCustomer}
                className="h-11 text-lg font-bold"
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Customer Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 2567..."
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  disabled={!selectedCustomer}
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Field Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any meter issues or accessibility notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!selectedCustomer}
              />
            </div>

            <Button type="submit" className="w-full h-12 text-base font-bold gap-2" disabled={isPending || !currentReading}>
              {isPending ? (
                 <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Confirm & Save Reading
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="card-accent-green h-fit shadow-lg">
        <CardHeader>
          <CardTitle className="text-brand-green flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Billing Summary
          </CardTitle>
          <CardDescription>Real-time calculation based on area tariff.</CardDescription>
        </CardHeader>
        <CardContent>
          {calculation ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Consumption</p>
                  <p className="text-2xl font-black">{calculation.consumption} m³</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Unit Rate</p>
                  <p className="text-lg font-bold">{formatUGX(calculation.unitPrice)}</p>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Water Charge:</span>
                  <span>{formatUGX(calculation.waterCharge)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Fee:</span>
                  <span>{formatUGX(calculation.serviceFee)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">VAT ({tariff?.vatPercentage || 18}%):</span>
                  <span>{formatUGX(calculation.vatAmount)}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-bold text-lg">Total New Bill:</span>
                  <span className="text-2xl font-black text-brand-green">{formatUGX(calculation.totalNewBill)}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 p-3 bg-blue-50 text-brand-blue rounded-lg text-xs border border-blue-100">
                <CheckCircle2 className="h-4 w-4" />
                <span>Save reading first, then choose to print a ticket or send SMS.</span>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Search className="h-12 w-12 opacity-10 mb-2" />
              <p className="text-sm italic">Search for a customer to see the live bill calculation.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    {/* HISTORY SECTION */}
    <Card className="no-print shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          My Recent Readings
        </CardTitle>
        <CardDescription>View and reprint tickets for the readings you have captured today.</CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground italic">
            No readings recorded yet.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Readings</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-bold">{item.customerName}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground uppercase">{item.meterRef || 'No Meter #'}</span>
                        {item.isNotified && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter">SMS Sent</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.previousReading} → {item.currentReading} ({item.consumption} m³)
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatUGX(item.totalDue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!item.isNotified && (
                           <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                              onClick={() => handleSendSms(item.id)}
                              disabled={isSendingSms}
                           >
                              <Smartphone className="h-3 w-3" /> SMS
                           </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5"
                          onClick={() => {
                            setLastSubmission({
                              ok: true,
                              readingId: item.id,
                              customerName: item.customerName,
                              meterRef: item.meterRef,
                              calc: {
                                previousReading: item.previousReading,
                                currentReading: item.currentReading,
                                consumption: item.consumption,
                                waterCharge: 0, // Not needed for ticket print
                                serviceFee: 0,
                                vatAmount: 0,
                                unitPrice: 0,
                                totalNewBill: item.billedAmount
                              },
                              previousBalance: item.previousBalance,
                              totalDue: item.totalDue,
                              phone: item.phone || "",
                              isSmsSent: item.isNotified ?? false
                            })
                            // Wait for state to update then print
                            setTimeout(() => window.print(), 100)
                          }}
                        >
                          <Printer className="h-3 w-3" /> Reprint
                        </Button>

                        {(item.recordedById === currentUser.id || currentUser.role === 'admin') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => handleCancel(item.id)}
                            title="Cancel Reading"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
  )
}
