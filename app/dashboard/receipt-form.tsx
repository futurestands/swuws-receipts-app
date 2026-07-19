"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createReceipt, type CreateReceiptInput } from "@/app/actions/receipts"
import { quickSearchCustomers } from "@/app/actions/customers"
import { getOpenBillsForCustomer } from "@/app/actions/billing"
import type { EditableFields, Branch, PaymentMethod, Customer } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { formatUGX } from "@/lib/format"
import { AlertCircle } from "lucide-react"

const emptyFormBase = {
  billingRecordId: "",
  billingPeriodId: "",
  schemeId: "",
  customerName: "",
  customerAccount: "",
  customerPhone: "",
  customerAddress: "",
  amount: "",
  outstandingBalance: "",
  paymentMethod: "",
  paymentReference: "",
  notes: "",
  branchId: "",
}

// Stability fix: paymentDate must be computed fresh each time this is
// called, not baked into a module-level constant. A module-level constant
// is evaluated exactly once per server process, and Next.js server
// processes (especially serverless "warm" instances) stay alive across
// many requests — a frozen default would silently show yesterday's date
// for as long as the process stays warm past midnight.
function getEmptyForm() {
  return { ...emptyFormBase, paymentDate: new Date().toISOString().slice(0, 10) }
}

export function ReceiptForm({
  editableFields,
  branches,
  paymentMethods,
  billingPeriods = [],
  schemes = [],
  activePeriodId,
}: {
  editableFields: EditableFields
  branches: Branch[]
  paymentMethods: PaymentMethod[]
  billingPeriods?: any[]
  schemes?: any[]
  activePeriodId?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(() => {
    const base = getEmptyForm()
    // Pre-select scheme if only one is available (e.g. for Plumbers/COs)
    const initialScheme = schemes.length === 1 ? schemes[0].id : ""
    return { ...base, billingPeriodId: activePeriodId || "", schemeId: initialScheme }
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Module 1 (Customer Management): optional link to an existing profile.
  // Leaving this untouched (selectedCustomer === null) reproduces the
  // exact original manual-entry behavior.
  const [customerQuery, setCustomerQuery] = useState("")
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [bills, setBills] = useState<any[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stability fix: without this, a slower earlier request that resolves
  // after a faster later one could overwrite fresher results with stale
  // ones. Each debounced search gets a ticket; only the most recent
  // ticket's response is applied.
  const searchRequestId = useRef(0)

  useEffect(() => {
    if (selectedCustomer) {
      getOpenBillsForCustomer(selectedCustomer.id).then(setBills)
    } else {
      setBills([])
      set("billingRecordId", "")
    }
  }, [selectedCustomer])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!customerQuery.trim() || selectedCustomer) {
      setCustomerResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      const requestId = ++searchRequestId.current
      const results = await quickSearchCustomers(customerQuery)
      if (requestId === searchRequestId.current) {
        setCustomerResults(results)
      }
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [customerQuery, selectedCustomer])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      setError("Enter a valid amount greater than zero")
      return
    }
    if (!form.billingRecordId && !form.billingPeriodId) {
      setError("You must select a billing period or an active bill")
      return
    }
    if (!form.paymentMethod) {
      setError("Select a payment method")
      return
    }
    if (!selectedCustomer && !form.customerName) {
      setError("Enter a customer name, or select an existing customer profile")
      return
    }

    startTransition(async () => {
      const payload: CreateReceiptInput = {
        billingRecordId: form.billingRecordId || undefined,
        billingPeriodId: form.billingPeriodId || undefined,
        schemeId: form.schemeId || undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name || form.customerName,
        customerAccount: selectedCustomer ? undefined : form.customerAccount || undefined,
        customerPhone: selectedCustomer ? undefined : form.customerPhone || undefined,
        customerAddress: selectedCustomer ? undefined : form.customerAddress || undefined,
        amount,
        outstandingBalance: form.outstandingBalance ? Number(form.outstandingBalance) : undefined,
        paymentMethod: form.paymentMethod,
        paymentReference: form.paymentReference || undefined,
        notes: form.notes || undefined,
        branchId: form.branchId || undefined,
        paymentDate: form.paymentDate || undefined,
      }
      const result = await createReceipt(payload)

      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }

      toast.success(`Receipt ${result.receipt.receiptNumber} created`)
      setForm(getEmptyForm())
      setSelectedCustomer(null)
      setCustomerQuery("")
      router.push(`/dashboard/receipts/${result.receipt.id}`)
    })
  }

  if (!activePeriodId) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" /> No Active Billing Period
          </CardTitle>
          <CardDescription>
            Receipts cannot be issued until an administrator activates a billing period.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New receipt</CardTitle>
        <CardDescription>Record a payment and issue a receipt immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customerSearch">Customer</Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{selectedCustomer.name}</p>
                  {selectedCustomer.customerAccount && (
                    <p className="text-muted-foreground text-xs">
                      Acct: {selectedCustomer.customerAccount}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setCustomerQuery("")
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="customerSearch"
                  placeholder="Search existing customers, or type a new name below"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                />
                {customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {customerResults.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedCustomer(c)
                          setCustomerResults([])
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.customerAccount && (
                          <span className="text-muted-foreground"> · {c.customerAccount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="space-y-2">
              <Label>Active bill</Label>
              <Select
                value={form.billingRecordId}
                onValueChange={(v) => {
                  set("billingRecordId", v ?? "")
                  const bill = bills.find((b) => b.id === v)
                  if (bill) {
                    // Auto-populate (Certification Finding 10.2.2)
                    set("amount", String(bill.totalDue))
                    set("outstandingBalance", "0")
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={bills.length > 0 ? "Select a bill" : "No open bills found"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.periodName} - {formatUGX(b.totalDue)} (Due:{" "}
                      {new Date(b.dueDate).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bills.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  This customer has no open bills. You can still record a general payment by
                  selecting a billing period below.
                </p>
              )}
            </div>
          )}

          {!form.billingRecordId && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Billing Period *</Label>
                <Select
                  value={form.billingPeriodId}
                  onValueChange={(v) => set("billingPeriodId", v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {billingPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.periodName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Scheme</Label>
                <Select
                  value={form.schemeId}
                  onValueChange={(v) => set("schemeId", v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!selectedCustomer && editableFields.customerName && (
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name *</Label>
              <Input
                id="customerName"
                required
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
              />
            </div>
          )}

          {!selectedCustomer && editableFields.customerAccount && (
            <div className="space-y-2">
              <Label htmlFor="customerAccount">Account number</Label>
              <Input
                id="customerAccount"
                value={form.customerAccount}
                onChange={(e) => set("customerAccount", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!selectedCustomer && editableFields.customerPhone && (
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={form.customerPhone}
                  onChange={(e) => set("customerPhone", e.target.value)}
                />
              </div>
            )}
            {!selectedCustomer && editableFields.customerAddress && (
              <div className="space-y-2">
                <Label htmlFor="customerAddress">Address</Label>
                <Input
                  id="customerAddress"
                  value={form.customerAddress}
                  onChange={(e) => set("customerAddress", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {editableFields.amount && (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount paid (UGX) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="outstandingBalance">Outstanding balance</Label>
              <Input
                id="outstandingBalance"
                type="number"
                min="0"
                step="1"
                value={form.outstandingBalance}
                onChange={(e) => set("outstandingBalance", e.target.value)}
              />
            </div>
          </div>

          {editableFields.paymentMethod && (
            <div className="space-y-2">
              <Label>Payment method *</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.code}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={form.branchId} onValueChange={(v) => set("branchId", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {editableFields.paymentReference && (
            <div className="space-y-2">
              <Label htmlFor="paymentReference">Payment reference</Label>
              <Input
                id="paymentReference"
                placeholder="Auto-generated if left blank"
                value={form.paymentReference}
                onChange={(e) => set("paymentReference", e.target.value)}
              />
            </div>
          )}

          {editableFields.paymentDate && (
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Collection date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={form.paymentDate}
                onChange={(e) => set("paymentDate", e.target.value)}
              />
            </div>
          )}

          {editableFields.notes && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving…" : "Issue receipt"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
