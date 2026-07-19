import Link from "next/link"
import { searchCustomers } from "@/app/actions/customers"
import { CustomerSearchBar } from "@/app/dashboard/customers/customer-search-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"
import { getCurrentUser } from "@/lib/session"
import { canUploadCustomers } from "@/lib/permissions"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const current = await getCurrentUser()
  const canImport = current ? canUploadCustomers(current) : false

  // Sync
  const { q, page } = await searchParams
  const pageNum = Number(page) || 1
  const { customers, total, totalPages } = await searchCustomers({ query: q, page: pageNum })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{total} customer profile(s)</p>
        </div>
      </div>

      <CustomerSearchBar initialQuery={q ?? ""} canImport={canImport} />

      <Card>
        <CardHeader>
          <CardTitle>All customers</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No customers found{q ? ` for "${q}"` : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.customerAccount || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(c.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" asChild disabled={pageNum <= 1}>
                <Link
                  href={`/dashboard/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNum - 1) })}`}
                >
                  Previous
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pageNum} of {totalPages}
              </span>
              <Button variant="outline" size="sm" asChild disabled={pageNum >= totalPages}>
                <Link
                  href={`/dashboard/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNum + 1) })}`}
                >
                  Next
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
