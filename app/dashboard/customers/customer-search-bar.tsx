"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createCustomer } from "@/app/actions/customers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { FileUp, Search } from "lucide-react"
import Link from "next/link"

export function CustomerSearchBar({ initialQuery, canImport }: { initialQuery: string; canImport: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [account, setAccount] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    router.push(`/dashboard/customers?${params.toString()}`)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createCustomer({
        name,
        customerAccount: account || undefined,
        phone: phone || undefined,
        address: address || undefined,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Customer created")
      setOpen(false)
      setName("")
      setAccount("")
      setPhone("")
      setAddress("")
      router.push(`/dashboard/customers/${result.customer.id}`)
    })
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <form onSubmit={handleSearch} className="w-full sm:flex-1 flex gap-2">
        <Input
          placeholder="Search by name, account number, or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        {canImport && (
          <Button variant="outline" asChild className="flex-1 sm:flex-initial">
            <Link href="/dashboard/customers/bulkimport">
              <FileUp className="h-4 w-4 mr-2" /> Bulk Import
            </Link>
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="flex-1 sm:flex-initial">New customer</Button>
          </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer profile</DialogTitle>
            <DialogDescription>
              Creates a reusable profile you can link receipts to later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-account">Account number</Label>
              <Input id="c-account" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-address">Address</Label>
              <Input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
