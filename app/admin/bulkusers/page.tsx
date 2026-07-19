import Link from "next/link"
import { BulkImportClient } from "./bulk-import-client"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export default function BulkImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Bulk User Import</h1>
          <p className="text-sm text-muted-foreground">
            Onboard multiple users via CSV or Excel spreadsheet.
          </p>
        </div>
      </div>

      <BulkImportClient />
    </div>
  )
}
