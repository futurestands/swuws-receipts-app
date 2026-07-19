"use client"

import { useState, useTransition } from "react"
import { updateCustomer } from "@/app/actions/customers"
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
import { toast } from "sonner"

export function EditCustomerForm({
  customer,
  schemes,
}: {
  customer: Customer
  schemes: { id: string; name: string }[]
}) {
  const [name, setName] = useState(customer.name)
  const [account, setAccount] = useState(customer.customerAccount ?? "")
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [address, setAddress] = useState(customer.address ?? "")
  const [waterSchemeId, setWaterSchemeId] = useState(customer.waterSchemeId ?? "")
  const [notes, setNotes] = useState(customer.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
