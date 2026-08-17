"use client"

import { useState, useTransition } from "react"
import { updateCustomer, setCustomerActive } from "@/app/actions/customers"
import type { Customer } from "@/lib/db/schema"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { UserMinus, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export function EditCustomerForm({
  customer,
  schemes,
  canEdit = false
}: {
  customer: Customer
  schemes: { id: string; name: string }[]
  canEdit?: boolean
}) {
  const [name, setName] = useState(customer.name)
  const [account, setAccount] = useState(customer.customerAccount ?? "")
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [address, setAddress] = useState(customer.address ?? "")
  const [waterSchemeId, setWaterSchemeId] = useState(customer.waterSchemeId ?? "")
  const [lastReading, setLastReading] = useState(String(customer.lastReading))
  const [notes, setNotes] = useState(customer.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [deactivating, startDeactivateTransition] = useTransition()

  function handleToggleActive() {
    startDeactivateTransition(async () => {
      try {
        const result = await setCustomerActive(customer.id, !customer.active)
        if (result.ok) {
          toast.success(`Customer ${!customer.active ? 'activated' : 'deactivated'} successfully`)
        } else {
          toast.error("Failed to update customer status")
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An error occurred"
        toast.error(message)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateCustomer(customer.id, {
        name,
        customerAccount: account || undefined,
        phone: phone || undefined,
        address: address || undefined,
        waterSchemeId: waterSchemeId || undefined,
        notes: notes || undefined,
        lastReading: Number(lastReading) || 0,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Customer profile updated")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{customer.name}</CardTitle>
        <CardDescription>Customer profile — editable, unlike issued receipts.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account">Account number</Label>
              <Input id="account" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastReading">Baseline Meter Reading</Label>
              <Input
                id="lastReading"
                type="number"
                value={lastReading}
                onChange={(e) => setLastReading(e.target.value)}
                placeholder="0"
              />
              <p className="text-[10px] text-muted-foreground italic">
                The starting meter value. Consumption will be calculated as (Current - Baseline).
              </p>
            </div>
            {schemes.length > 0 && (
              <div className="space-y-2">
                <Label>Water scheme</Label>
                <Select value={waterSchemeId} onValueChange={(v) => setWaterSchemeId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
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
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </fieldset>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {canEdit && (
            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={pending || deactivating} className="w-full">
                {pending ? "Saving…" : "Save changes"}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full gap-2",
                      customer.active ? "text-destructive hover:bg-destructive/5" : "text-primary hover:bg-primary/5"
                    )}
                    disabled={deactivating || pending}
                  >
                    {customer.active ? (
                      <><UserMinus className="size-4" /> Deactivate Customer</>
                    ) : (
                      <><UserCheck className="size-4" /> Reactivate Customer</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {customer.active ? "Deactivate Customer?" : "Reactivate Customer?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {customer.active ? (
                        "Deactivating this customer will hide them from the operational dashboard and customer pickers. All financial history will be preserved."
                      ) : (
                        "This will restore the customer to the operational dashboard and allow agents to record new readings and payments."
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleToggleActive}
                      className={customer.active ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"}
                    >
                      {customer.active ? "Confirm Deactivation" : "Confirm Reactivation"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {!canEdit && (
             <p className="text-[10px] text-muted-foreground text-center italic py-2">
                You do not have permission to edit customer profiles.
             </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
