import Link from "next/link"
import { HierarchyImportClient } from "./hierarchy-import-client"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export default function BulkImportHierarchyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center justify-center rounded-lg h-8 w-8 hover:bg-muted transition-colors text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Bulk Hierarchy Import</h1>
          <p className="text-sm text-muted-foreground">
            Onboard Clusters, Branches, and Water Schemes via spreadsheet.
          </p>
        </div>
      </div>

      <HierarchyImportClient />
    </div>
  )
}
