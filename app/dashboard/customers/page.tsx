import Link from "next/link"
import { searchCustomers } from "@/app/actions/customers"
import { listBranches, listWaterSchemes } from "@/app/actions/settings"
import { CustomerSearchBar } from "@/app/dashboard/customers/customer-search-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatDate, formatUGX } from "@/lib/format"
import { getCurrentUser } from "@/lib/session"
import { canUploadCustomers } from "@/lib/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { Users } from "lucide-react"

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branchId?: string; schemeId?: string; page?: string }>
}) {
  const current = await getCurrentUser()
  const canImport = current ? canUploadCustomers(current) : false

  const { q, branchId, schemeId, page } = await searchParams
  const pageNum = Number(page) || 1

  // Goal Alignment: Wrapped data fetching in resilience guards to prevent
  // entire page crashes if the database is busy or has data anomalies.
  const [{ customers, total, totalPages }, branches, schemes] = await Promise.all([
    searchCustomers({ query: q, branchId, waterSchemeId: schemeId, page: pageNum })
      .catch((err) => {
        console.error("Customer search failed:", err)
        return { customers: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
      }),
    listBranches().catch(() => []),
    listWaterSchemes().catch(() => []),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" description={`${total} customer profile(s)`} />

      <CustomerSearchBar
        initialQuery={q ?? ""}
        initialBranchId={branchId}
        initialSchemeId={schemeId}
        branches={branches}
        schemes={schemes}
        canImport={canImport}
      />

      <Card>
        <CardContent>
          {customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers found"
              description={q ? `Nothing matched "${q}". Try a different name, account number, or phone.` : "No customer profiles have been created yet."}
            />
          ) : (
            <ScrollableTableContainer className="border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead className="text-right">Arrears</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c: any) => (
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
                      <TableCell className="text-muted-foreground">
                        {c.branchName || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.schemeName || "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-bold ${c.accountBalance > 0 ? 'text-destructive' : 'text-primary'}`}>
                        {formatUGX(c.accountBalance)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(c.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" asChild disabled={pageNum <= 1} className="h-11">
                <Link
                  href={`/dashboard/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNum - 1) })}`}
                >
                  Previous
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pageNum} of {totalPages}
              </span>
              <Button variant="outline" size="sm" asChild disabled={pageNum >= totalPages} className="h-11">
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
