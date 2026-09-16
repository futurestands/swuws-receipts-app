import Link from "next/link"
import { searchCustomers } from "@/app/actions/customers"
import { listBranches, listWaterSchemes } from "@/app/actions/settings"
import { CustomerSearchBar } from "@/app/dashboard/customers/customer-search-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDate, formatUGX } from "@/lib/format"
import { getCurrentUser } from "@/lib/session"
import { canUploadCustomers } from "@/lib/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { Users, ChevronLeft, ChevronRight } from "lucide-react"

function customersListHref(params: {
  q?: string
  branchId?: string
  schemeId?: string
  category?: string
  minBalance?: string
  maxBalance?: string
  page: number
}) {
  const sp = new URLSearchParams()
  if (params.q) sp.set("q", params.q)
  if (params.branchId) sp.set("branchId", params.branchId)
  if (params.schemeId) sp.set("schemeId", params.schemeId)
  if (params.category) sp.set("category", params.category)
  if (params.minBalance) sp.set("minBalance", params.minBalance)
  if (params.maxBalance) sp.set("maxBalance", params.maxBalance)
  if (params.page > 1) sp.set("page", String(params.page))
  const qs = sp.toString()
  return qs ? `/dashboard/customers?${qs}` : "/dashboard/customers"
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    branchId?: string;
    schemeId?: string;
    category?: string;
    page?: string;
    minBalance?: string;
    maxBalance?: string;
  }>
}) {
  const current = await getCurrentUser()
  const canImport = current ? canUploadCustomers(current) : false

  const { q, branchId, schemeId, category, page, minBalance, maxBalance } = await searchParams
  const pageNum = Number(page) || 1
  const minBalNum = minBalance ? Number(minBalance) : undefined
  const maxBalNum = maxBalance ? Number(maxBalance) : undefined

  // Goal Alignment: Wrapped data fetching in resilience guards to prevent
  // entire page crashes if the database is busy or has data anomalies.
  const [{ customers, total, totalPages }, branches, schemes] = await Promise.all([
    searchCustomers({
      query: q,
      branchId,
      waterSchemeId: schemeId,
      category,
      page: pageNum,
      minBalance: minBalNum,
      maxBalance: maxBalNum
    })
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
        initialCategory={category}
        initialMinBalance={minBalance}
        initialMaxBalance={maxBalance}
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
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden md:table-cell">Branch</TableHead>
                    <TableHead className="hidden md:table-cell">Scheme</TableHead>
                    <TableHead className="text-right">Arrears</TableHead>
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">Registered</TableHead>
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
                      <TableCell className="hidden sm:table-cell">
                         <Badge variant="outline" className="capitalize text-[10px] py-0">{c.category}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {c.branchName || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {c.schemeName || "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-bold whitespace-nowrap ${Number(c.accountBalance) > 0 ? 'text-destructive' : 'text-primary'}`}>
                        {formatUGX(Number(c.accountBalance))}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground font-medium text-xs">{c.phone || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {formatDate(c.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollableTableContainer>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
              <p className="w-full text-center text-sm text-muted-foreground sm:w-auto sm:order-2 sm:flex-1">
                Page {pageNum} of {totalPages}
              </p>
              {pageNum > 1 ? (
                <Button variant="outline" size="sm" asChild className="h-11 flex-1 sm:flex-none sm:order-1 min-w-[40%]">
                  <Link
                    href={customersListHref({
                      q, branchId, schemeId, category, minBalance, maxBalance,
                      page: pageNum - 1,
                    })}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="h-11 flex-1 sm:flex-none sm:order-1 min-w-[40%]">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
              )}
              {pageNum < totalPages ? (
                <Button variant="outline" size="sm" asChild className="h-11 flex-1 sm:flex-none sm:order-3 min-w-[40%]">
                  <Link
                    href={customersListHref({
                      q, branchId, schemeId, category, minBalance, maxBalance,
                      page: pageNum + 1,
                    })}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled className="h-11 flex-1 sm:flex-none sm:order-3 min-w-[40%]">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
