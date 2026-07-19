import Link from "next/link"
import { HierarchyImportClient } from "./hierarchy-import-client"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export default function BulkImportHierarchyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
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
