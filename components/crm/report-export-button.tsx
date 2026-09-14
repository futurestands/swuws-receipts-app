"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { toast } from "sonner"
import * as XLSX from "xlsx"

export interface ComplaintExportRow {
  complaintNumber: string
  createdAt: Date | string
  complainantName: string
  complainantPhone: string
  customerAccount?: string | null
  categoryName?: string | null
  areaName?: string | null
  departmentName?: string | null
  assignedToName?: string | null
  priority: string
  status: string
  language?: string | null
  details: string
  resolutionNotes?: string | null
  resolvedAt?: Date | string | null
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 19).replace("T", " ")
}

/**
 * Exports the currently filtered report rows. The old Export to Excel button
 * had no click handler at all. Follows the same xlsx approach as the report
 * catalog generator.
 */
export function ReportExportButton({ rows }: { rows: ComplaintExportRow[] }) {
  function exportToExcel() {
    if (rows.length === 0) {
      toast.error("Nothing to export for the current filters")
      return
    }

    const sheet = XLSX.utils.json_to_sheet(
      rows.map((row) => ({
        "Ticket No": row.complaintNumber,
        "Logged At": asDate(row.createdAt),
        Customer: row.complainantName,
        Phone: row.complainantPhone,
        "A/C No": row.customerAccount || "",
        Category: row.categoryName || "",
        Area: row.areaName || "",
        Department: row.departmentName || "",
        "Assigned To": row.assignedToName || "Unassigned",
        Priority: row.priority,
        Status: row.status,
        Language: row.language || "",
        Details: row.details,
        "Resolution Notes": row.resolutionNotes || "",
        "Resolved At": asDate(row.resolvedAt),
      })),
    )

    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Complaints")
    XLSX.writeFile(book, `SWUWS_CRM_Complaints_${new Date().toISOString().split("T")[0]}.xlsx`)
    toast.success(`Exported ${rows.length} ticket(s)`)
  }

  return (
    <Button
      className="h-9 bg-[#0f766e] hover:bg-[#0d9488] text-white font-bold"
      onClick={exportToExcel}
    >
      <Download className="h-4 w-4 mr-2" /> Export to Excel
    </Button>
  )
}
