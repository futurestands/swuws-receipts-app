"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { AlertCircle, CheckCircle2, Calculator, Send, Search, User, Printer, XCircle, History, Trash2 } from "lucide-react"
import { getTariffForCustomer, submitMeterReading, searchCustomersForReading, cancelMeterReading } from "@/app/actions/billing-engine"
import { calculateBill, type BillingCalculation } from "@/lib/billing/math"
import type { Customer, BillingPeriod } from "@/lib/db/schema"
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
  const [shouldSendSms, setShouldSendSms] = useState(true)
  const [notes, setNotes] = useState("")
  const [tariff, setTariff] = useState<any>(null)
  const [calculation, setCalculation] = useState<BillingCalculation | null>(null)
  const [lastSubmission, setLastSubmission] = useState<{
    ok: boolean;
    readingId: string;
    customerName: string;
    meterRef?: string | null;
    calc: BillingCalculation;
    previousBalance: number;
    totalDue: number;
  } | null>(null)
  const [history, setHistory] = useState(initialHistory)
  const [isPending, startTransition] = useTransition()
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
      setShouldSendSms(true)
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
          sendSms: shouldSendSms
        })

        if (result.ok) {
          toast.success(shouldSendSms ? "Reading captured and SMS bill sent!" : "Reading captured successfully!")

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
              totalDue
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
              isNotified: shouldSendSms
            }, ...prev.slice(0, 19)])
          }

          // Reset form (keeping lastSubmission visible for printing)
          setSelectedCustomer(null)
          setSearchQuery("")
          setCurrentReading("")
          setNotes("")
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to submit reading")
      }
    })
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
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel reading")
    }
  }

  return (
    <div className="space-y-6">
      {/* SUCCESS & PRINT DIALOG */}
      {lastSubmission && (
        <Card className="border-green-200 bg-green-50/30 animate-in zoom-in-95 duration-500 mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-lg font-black text-green-900 leading-tight">Reading Successful!</p>
                  <p className="text-sm text-green-700">Total Amount Due: <span className="font-bold">{formatUGX(lastSubmission.totalDue)}</span> for {lastSubmission.customerName}</p>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <Button
                  className="flex-1 md:flex-none h-14 px-8 text-lg bg-green-600 hover:bg-green-700 gap-2 shadow-xl border-b-4 border-green-800"
                  onClick={() => window.print()}
                >
                  <Printer className="h-5 w-5" /> PRINT TICKET
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-14 w-14 border-green-200 bg-white"
                  onClick={() => setLastSubmission(null)}
                >
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="flex flex-col justify-center space-y-2 pt-2 md:pt-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={shouldSendSms}
                    onChange={(e) => setShouldSendSms(e.target.checked)}
                    disabled={!selectedCustomer}
                    className="size-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold group-hover:text-primary transition-colors">Send Bill via SMS</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Instant Notification</span>
                  </div>
                </label>
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
              {isPending ? "Processing..." : (
                <>
                  <Send className={cn("size-4", shouldSendSms && "animate-pulse")} />
                  Confirm & {shouldSendSms ? "Send Bill via SMS" : "Save Reading"}
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

              <div className="mt-6 flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-xs border border-emerald-100">
                <Send className="h-4 w-4" />
                <span>Customer will be notified of this total via SMS instantly.</span>
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
                              totalDue: item.totalDue
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
