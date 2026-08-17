"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { formatUGX, formatDateTime } from "@/lib/format"
import { DeleteRunButton } from "./delete-run-button"
import { ScrollableTableContainer } from "@/components/ui/responsive-table"
import { Trash2, Loader2, AlertTriangle } from "lucide-react"
import { bulkDeleteBillingRuns } from "@/app/actions/billing"
import { toast } from "sonner"
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

interface RecentImportsTableProps {
  uploads: any[]
  canDelete?: boolean
}

export function RecentImportsTable({ uploads, canDelete = false }: RecentImportsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const toggleAll = () => {
    if (selectedIds.length === uploads.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(uploads.map((u) => u.id))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  async function handleBulkDelete() {
    setIsDeleting(true)
    try {
      const res = await bulkDeleteBillingRuns(selectedIds)
      if (res.ok) {
        toast.success(`${selectedIds.length} billing runs deleted and balances restored.`)
        setSelectedIds([])
        setIsConfirmOpen(false)
      } else {
        toast.error(res.error || "Failed to delete billing runs")
      }
    } catch (err) {
      toast.error("A connection error occurred")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded-lg animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{selectedIds.length} schemes selected for rollback</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          </div>
          <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bulk Rollback Imports?</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to delete <strong>{selectedIds.length}</strong> billing imports.
                  This will restore balances for ALL customers in these schemes to their pre-import values.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault()
                    handleBulkDelete()
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Bulk Rollback
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <ScrollableTableContainer className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className="w-[80px] px-0">
                  <div className="flex flex-col items-center justify-center gap-1 min-w-[80px]">
                    <Checkbox
                      checked={selectedIds.length === uploads.length && uploads.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">All</span>
                  </div>
                </TableHead>
              )}
              <TableHead>Scheme</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customers</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Status</TableHead>
              {canDelete && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.map((run) => (
              <TableRow key={run.id} className={selectedIds.includes(run.id) ? "bg-muted/50" : ""}>
                {canDelete && (
                  <TableCell className="w-[80px] px-0">
                    <div className="flex items-center justify-center min-w-[80px]">
                      <Checkbox
                        checked={selectedIds.includes(run.id)}
                        onCheckedChange={() => toggleOne(run.id)}
                        aria-label={`Select ${run.schemeName}`}
                      />
                    </div>
                  </TableCell>
                )}
                <TableCell className="font-medium">{run.schemeName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(run.uploadedAt)}
                </TableCell>
                <TableCell>{run.totalCustomers}</TableCell>
                <TableCell>{formatUGX(run.totalAmount)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {run.status}
                  </Badge>
                </TableCell>
                {canDelete && (
                  <TableCell className="text-right">
                    <DeleteRunButton runId={run.id} schemeName={run.schemeName} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollableTableContainer>
    </div>
  )
}
