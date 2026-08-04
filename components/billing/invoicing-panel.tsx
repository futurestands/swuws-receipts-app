"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { formatUGX, formatDate } from "@/lib/format"
import { FileText, Printer, Search, User, XCircle, Loader2 } from "lucide-react"
import { searchCustomersForReading, getCustomerInvoiceData } from "@/app/actions/billing-engine"
import type { Customer } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

export function InvoicingPanel() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [invoiceData, setInvoiceData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
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

  // Fetch invoice data when customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      setIsLoading(true)
      getCustomerInvoiceData(selectedCustomer.id).then(data => {
        setInvoiceData(data)
        setIsLoading(false)
      }).catch(err => {
        toast.error("Failed to load invoice data")
        setIsLoading(false)
      })
    } else {
      setInvoiceData(null)
    }
  }, [selectedCustomer])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      <Card className="no-print shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Re-issue Invoice
          </CardTitle>
          <CardDescription>Search for a customer to view and print their latest bill (Demand Note).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
                    <XCircle className="h-4 w-4 mr-2" /> Clear
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

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!isLoading && selectedCustomer && invoiceData && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                       <div className="space-y-1">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Customer Account</p>
                          <p className="text-xl font-black">{invoiceData.customer.customerAccount}</p>
                       </div>
                       <div className="text-right space-y-1">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Live Arrears</p>
                          <p className={cn("text-xl font-black", invoiceData.customer.accountBalance > 0 ? "text-destructive" : "text-primary")}>
                            {formatUGX(invoiceData.customer.accountBalance)}
                          </p>
                       </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-center">
                   <Button onClick={handlePrint} className="h-14 px-8 text-lg font-black gap-3 shadow-xl">
                      <Printer className="h-6 w-6" /> PRINT INVOICE / DEMAND NOTE
                   </Button>
                </div>
              </div>
            )}

            {!selectedCustomer && !isLoading && (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl opacity-50">
                 <Search className="h-12 w-12 mb-2" />
                 <p className="text-sm italic">Search for a customer to generate an invoice.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PRINT-ONLY AREA */}
      {selectedCustomer && invoiceData && (
        <div className="hidden print:block print-area">
          <div style={{ fontFamily: 'serif', maxWidth: '400px', margin: 'auto', padding: '20px', border: '1px solid #000' }}>
            <div className="text-center border-b-2 border-black pb-4 mb-4">
              <h2 className="text-xl italic font-black uppercase">SOUTHWESTERN UMBRELLA</h2>
              <h3 className="text-sm">OF WATER AND SANITATION</h3>
              <p className="text-xs font-bold uppercase tracking-widest mt-1">WATER DEMAND NOTE (DUPLICATE)</p>
            </div>

            <table className="w-full text-sm">
              <tbody>
                <tr><td className="font-bold py-1">Customer:</td><td className="text-right">{invoiceData.customer.name}</td></tr>
                <tr><td className="font-bold py-1">Account:</td><td className="text-right font-mono">{invoiceData.customer.customerAccount}</td></tr>
                <tr><td className="font-bold py-1">Scheme:</td><td className="text-right">{invoiceData.schemeName}</td></tr>
                <tr><td className="font-bold py-1">Period:</td><td className="text-right">{invoiceData.reading?.periodName || invoiceData.importBill?.periodName || "Current"}</td></tr>

                <tr className="border-t border-dashed mt-4"><td colSpan={2} className="py-2"></td></tr>

                {invoiceData.reading ? (
                  <>
                    <tr><td className="py-1">Prev Reading:</td><td className="text-right font-mono">{invoiceData.reading.previousReading}</td></tr>
                    <tr><td className="py-1">Curr Reading:</td><td className="text-right font-mono font-bold">{invoiceData.reading.currentReading}</td></tr>
                    <tr className="border-b border-black"><td className="py-1">Consumption:</td><td className="text-right font-black">{invoiceData.reading.consumption} m³</td></tr>
                  </>
                ) : invoiceData.importBill ? (
                  <>
                    <tr><td className="py-1">Consumption:</td><td className="text-right font-black">As Per Import</td></tr>
                  </>
                ) : null}

                <tr><td className="py-1 pt-4 font-bold">Monthly Bill:</td><td className="text-right pt-4">{formatUGX(invoiceData.reading?.billedAmount || invoiceData.importBill?.currentCharges || 0)}</td></tr>
                <tr><td className="py-1 font-bold">Past Arrears:</td><td className="text-right">{formatUGX(invoiceData.reading?.previousBalanceSnapshot || invoiceData.importBill?.arrears || 0)}</td></tr>

                <tr className="border-t-2 border-black font-black text-xl">
                  <td className="py-2 uppercase">GRAND TOTAL:</td>
                  <td className="text-right py-2">{formatUGX(invoiceData.customer.accountBalance)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-8 text-center text-[10px] italic space-y-1">
              <p>This is an official duplicate copy for your records.</p>
              <p>Please pay via authorized channels (Bank, Mobile Money, COs).</p>
              <p suppressHydrationWarning>Printed: {new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
