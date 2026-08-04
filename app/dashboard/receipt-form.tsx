"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createReceipt } from "@/app/actions/receipts"
import { type CreateReceiptInput } from "@/lib/finance-schemas"
import { quickSearchCustomers } from "@/app/actions/customers"
import { getOpenBillsForCustomer } from "@/app/actions/billing"
import type { EditableFields, Branch, PaymentMethod, Customer, BillingPeriod, WaterScheme } from "@/lib/db/schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { cn } from "@/lib/utils"
import { ResponsiveFormLayout, FormField, FormActions } from "@/components/ui/form-layout"
import Link from "next/link"
import { AlertCircle, Search, UserPlus } from "lucide-react"

type Bill = {
  id: string
  totalDue: number
  status: string
  periodName: string
  dueDate: Date
}

const emptyFormBase = {
  billingRecordId: "",
  billingPeriodId: "",
  schemeId: "",
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
  billingPeriods?: BillingPeriod[]
  schemes?: WaterScheme[]
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
  const [bills, setBills] = useState<Bill[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stability fix: without this, a slower earlier request that resolves
  // after a faster later one could overwrite fresher results with stale
  // ones. Each debounced search gets a ticket; only the most recent
  // ticket's response is applied.
  const searchRequestId = useRef(0)

  const set = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  useEffect(() => {
    let active = true
    if (selectedCustomer) {
      getOpenBillsForCustomer(selectedCustomer.id).then((data) => {
        if (active) setBills(data)
      })
    }
    return () => {
      active = false
    }
  }, [selectedCustomer])

  useEffect(() => {
    if (!customerQuery.trim() || selectedCustomer) {
      return
    }

    const timer = setTimeout(async () => {
      const requestId = ++searchRequestId.current
      const results = await quickSearchCustomers(customerQuery)
      if (requestId === searchRequestId.current) {
        setCustomerResults(results)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [customerQuery, selectedCustomer])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Guards against a fast double-click/double-tap firing a second
    // submit before the disabled state on the button has visually
    // committed. The disabled attribute below is the primary defense for
    // normal use; this closes the race window. Real protection against a
    // genuine duplicate receipt still lives server-side in createReceipt.
    if (pending) return

    setError(null)

    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      setError("Enter a valid amount greater than zero")
      return
    }
    if (Math.round(amount) <= 0) {
      setError("Amount is too small to record as a receipt")
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
    if (!selectedCustomer) {
      setError("You must select a customer profile to issue a receipt")
      return
    }

    startTransition(async () => {
      const payload: CreateReceiptInput = {
        billingRecordId: form.billingRecordId || undefined,
        billingPeriodId: form.billingPeriodId || undefined,
        schemeId: form.schemeId || undefined,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerAccount: undefined,
        customerPhone: undefined,
        customerAddress: undefined,
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

      toast.success(
        result.duplicate
          ? `Receipt ${result.receipt.receiptNumber} was already recorded a moment ago — showing that one, no duplicate was created.`
          : `Receipt ${result.receipt.receiptNumber} created`
      )
      setForm(getEmptyForm())
      setSelectedCustomer(null)
      setCustomerQuery("")
      router.push(`/dashboard/receipts/${result.receipt.id}`)
    })
  }

  function handleCancel() {
    setForm(getEmptyForm())
    setSelectedCustomer(null)
    setCustomerQuery("")
    setCustomerResults([])
    setBills([])
    setError(null)
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
          <FormField label="Search for Customer" htmlFor="customerSearch">
            <div className="relative">
              <div className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none">
                <Search className="h-4 w-4" />
              </div>
              <Input
                id="customerSearch"
                placeholder="Type name or account number to find customer..."
                value={selectedCustomer ? selectedCustomer.name : customerQuery}
                onChange={(e) => {
                  const val = e.target.value
                  if (selectedCustomer) {
                    setSelectedCustomer(null)
                    setBills([])
                    setCustomerResults([])
                    setForm(prev => ({
                      ...prev,
                      customerAccount: "",
                      customerPhone: "",
                      customerAddress: "",
                      billingRecordId: "",
                      outstandingBalance: "",
                    }))
                  }
                  if (!val.trim()) {
                    setCustomerResults([])
                  }
                  setCustomerQuery(val)
                }}
                className={cn("h-11 pl-9", selectedCustomer && "bg-primary/5 font-bold text-primary border-primary/20")}
              />
              {selectedCustomer && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-9 px-3 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setCustomerQuery("")
                    setBills([])
                    setCustomerResults([])
                    setForm(prev => ({
                      ...prev,
                      customerAccount: "",
                      customerPhone: "",
                      customerAddress: "",
                      billingRecordId: "",
                      outstandingBalance: "",
                    }))
                  }}
                >
                  Change
                </Button>
              )}
              {customerResults.length === 0 && customerQuery.trim() !== "" && !selectedCustomer && (
                <div className="absolute z-10 mt-1 p-4 w-full rounded-lg border bg-popover shadow-md ring-1 ring-black/5 text-center">
                   <p className="text-sm text-muted-foreground mb-2">No customer found for &quot;{customerQuery}&quot;</p>
                   <Button asChild variant="outline" size="sm" className="gap-2">
                      <Link href="/dashboard/customers">
                        <UserPlus className="h-4 w-4" /> Create New Profile
                      </Link>
                   </Button>
                </div>
              )}
              {customerResults.length > 0 && !selectedCustomer && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-md ring-1 ring-black/5">
                  {customerResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="w-full min-h-11 text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-0 transition-colors"
                      onClick={() => {
                        setSelectedCustomer(c)
                        setCustomerResults([])
                        const currentBalance = Number(c.accountBalance || 0)
                        const amountPaid = Number(form.amount || 0)
                        setForm(prev => ({
                          ...prev,
                          customerAccount: c.customerAccount || "",
                          customerPhone: c.phone || "",
                          customerAddress: c.address || "",
                          schemeId: c.waterSchemeId || prev.schemeId,
                          branchId: (schemes.find(s => s.id === c.waterSchemeId)?.branchId) || prev.branchId,
                          outstandingBalance: String(currentBalance - amountPaid)
                        }))
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold">{c.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {c.customerAccount || 'No Account'} · {c.phone || 'No Phone'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormField>

          {/* Selected Customer Card */}
          {selectedCustomer && (
            <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg animate-in fade-in zoom-in-95 duration-300">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Linked Profile</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setSelectedCustomer(null)
                      setCustomerQuery("")
                      setBills([])
                      setCustomerResults([])
                      setForm(prev => ({
                        ...prev,
                        customerName: "",
                        customerAccount: "",
                        customerPhone: "",
                        customerAddress: "",
                        billingRecordId: "",
                        outstandingBalance: "",
                      }))
                    }}
                  >
                    Disconnect
                  </Button>
               </div>

               {/* Live Balance Tracker */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Current Arrears</p>
                    <p className="text-lg font-black">{formatUGX(selectedCustomer.accountBalance)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Resulting Balance</p>
                    <p className={cn(
                      "text-xl font-black",
                      (Number(selectedCustomer.accountBalance) - Number(form.amount || 0)) <= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {formatUGX(Math.abs(Number(selectedCustomer.accountBalance) - Number(form.amount || 0)))}
                      {(Number(selectedCustomer.accountBalance) - Number(form.amount || 0)) < 0 && " (CR)"}
                    </p>
                  </div>
               </div>

               {(Number(selectedCustomer.accountBalance) - Number(form.amount || 0)) < 0 && (
                 <p className="text-[10px] text-primary mt-2 italic">
                   Note: This payment results in a credit balance of {formatUGX(Math.abs(Number(selectedCustomer.accountBalance) - Number(form.amount || 0)))}
                 </p>
               )}
            </div>
          )}

          <FormField label="Active bill" htmlFor="activeBillTrigger">
            <Select
              value={form.billingRecordId}
              onValueChange={(v) => {
                set("billingRecordId", v ?? "")
                const bill = bills.find((b) => b.id === v)
                if (bill) {
                  // Auto-populate (Certification Finding 10.2.2)
                  set("amount", String(bill.totalDue))
                }
              }}
              disabled={!selectedCustomer}
            >
              <SelectTrigger id="activeBillTrigger" className="w-full h-11">
                <SelectValue
                  placeholder={selectedCustomer ? (bills.length > 0 ? "Select a bill" : "No open bills found") : "Search for a customer first"}
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
            {selectedCustomer && bills.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This customer has no open bills. You can still record a general payment.
              </p>
            )}
          </FormField>

          <ResponsiveFormLayout columns={2}>
            <FormField label="Billing Period" htmlFor="billingPeriodTrigger" required>
              <Select
                value={form.billingPeriodId}
                onValueChange={(v) => set("billingPeriodId", v ?? "")}
                disabled={!!form.billingRecordId}
              >
                <SelectTrigger id="billingPeriodTrigger" className="w-full h-11">
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
            </FormField>
            <FormField label="Scheme" htmlFor="schemeTrigger">
              <Select
                value={form.schemeId}
                onValueChange={(v) => set("schemeId", v ?? "")}
                disabled={!!form.billingRecordId}
              >
                <SelectTrigger id="schemeTrigger" className="w-full h-11">
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
            </FormField>
          </ResponsiveFormLayout>

          <FormField label="Account number" htmlFor="customerAccount">
            <Input
              id="customerAccount"
              value={form.customerAccount}
              onChange={(e) => set("customerAccount", e.target.value)}
              className="h-11"
              readOnly={!!selectedCustomer}
            />
          </FormField>

          <ResponsiveFormLayout columns={2}>
            <FormField label="Phone" htmlFor="customerPhone">
              <Input
                id="customerPhone"
                value={form.customerPhone}
                onChange={(e) => set("customerPhone", e.target.value)}
                className="h-11"
                readOnly={!!selectedCustomer}
              />
            </FormField>
            <FormField label="Address" htmlFor="customerAddress">
              <Input
                id="customerAddress"
                value={form.customerAddress}
                onChange={(e) => set("customerAddress", e.target.value)}
                className="h-11"
                readOnly={!!selectedCustomer}
              />
            </FormField>
          </ResponsiveFormLayout>

          <ResponsiveFormLayout columns={2}>
            {editableFields.amount && (
              <FormField label="Amount paid (UGX)" htmlFor="amount" required>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={form.amount}
                  onChange={(e) => {
                    const val = e.target.value
                    set("amount", val)
                    if (selectedCustomer) {
                       const currentBalance = Number(selectedCustomer.accountBalance || 0)
                       const amountPaid = Number(val || 0)
                       set("outstandingBalance", String(currentBalance - amountPaid))
                    }
                  }}
                  className="h-11"
                />
              </FormField>
            )}
            <FormField label="Outstanding balance" htmlFor="outstandingBalance">
              <Input
                id="outstandingBalance"
                type="number"
                min="0"
                step="1"
                value={form.outstandingBalance}
                onChange={(e) => set("outstandingBalance", e.target.value)}
                className="h-11"
              />
            </FormField>
          </ResponsiveFormLayout>

          {editableFields.paymentMethod && (
            <FormField label="Payment method" htmlFor="paymentMethodTrigger" required>
              <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v ?? "")}>
                <SelectTrigger id="paymentMethodTrigger" className="w-full h-11">
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
            </FormField>
          )}

          {branches.length > 0 && (
            <FormField label="Branch" htmlFor="branchTrigger">
              <Select value={form.branchId} onValueChange={(v) => set("branchId", v ?? "")}>
                <SelectTrigger id="branchTrigger" className="w-full h-11">
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
            </FormField>
          )}

          {editableFields.paymentReference && (
            <FormField label="Payment reference" htmlFor="paymentReference">
              <Input
                id="paymentReference"
                placeholder="Auto-generated if left blank"
                value={form.paymentReference}
                onChange={(e) => set("paymentReference", e.target.value)}
                className="h-11"
              />
            </FormField>
          )}

          {editableFields.paymentDate && (
            <FormField label="Collection date" htmlFor="paymentDate">
              <Input
                id="paymentDate"
                type="date"
                value={form.paymentDate}
                onChange={(e) => set("paymentDate", e.target.value)}
                className="h-11"
              />
            </FormField>
          )}

          {editableFields.notes && (
            <FormField label="Notes" htmlFor="notes">
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </FormField>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <FormActions className="border-t-0 pt-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto h-11"
              onClick={handleCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto h-11" disabled={pending}>
              {pending ? "Saving…" : "Issue receipt"}
            </Button>
          </FormActions>
        </form>
      </CardContent>
    </Card>
  )
}
