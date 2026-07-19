"use client"

import { useState, useTransition } from "react"
import { getDailyImportRecords } from "@/app/actions/daily-collections"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal } from "lucide-react"
import { formatUGX, formatDate } from "@/lib/format"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DailyRecordTableProps {
  batchId: string
  initialData: {
    records: any[]
    total: number
    page: number
    totalPages: number
  }
}

export function DailyRecordTable({ batchId, initialData }: DailyRecordTableProps) {
  const [data, setData] = useState(initialData)
  const [search, setSearch] = useState("")
  const [channel, setChannel] = useState("all")
  const [isPending, startTransition] = useTransition()

  async function loadPage(page: number, currentSearch = search, currentChannel = channel) {
    startTransition(async () => {
      const result = await getDailyImportRecords({
        batchId,
        page,
        limit: 25,
        search: currentSearch || undefined,
        channel: currentChannel || undefined
      })
      setData(result)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    loadPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Account, Name, or Reference..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <div className="flex items-center gap-2">
           <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
           <Select value={channel} onValueChange={(v) => {
             if (!v) return;
             setChannel(v);
             loadPage(1, search, v);
           }}>
              <SelectTrigger className="w-[150px]">
                 <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="all">All Channels</SelectItem>
                 <SelectItem value="Bank">Bank</SelectItem>
                 <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                 <SelectItem value="Cash Office">Cash Office</SelectItem>
                 <SelectItem value="Agent">Agent</SelectItem>
              </SelectContent>
           </Select>
        </div>
        <Button onClick={() => loadPage(1)} variant="outline">
          Apply Filters
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account No</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
                    <span>Searching repository...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No records found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-mono text-xs font-medium">{record.accountNumber}</TableCell>
                  <TableCell className="text-xs truncate max-w-[200px]">{record.customerName}</TableCell>
                  <TableCell className="text-right text-xs font-bold">{formatUGX(record.amount)}</TableCell>
                  <TableCell className="text-xs">{formatDate(record.paymentDate)}</TableCell>
                  <TableCell>
                     <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted border font-medium">
                        {record.paymentChannel}
                     </span>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono">{record.externalReference}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "capitalize text-[10px] px-1.5 py-0",
                      record.importStatus === 'matched' ? "text-green-600 bg-green-50 border-green-100" :
                      record.importStatus === 'imported' ? "text-blue-600 bg-blue-50 border-blue-100" : ""
                    )}>
                      {record.importStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-bold">{data.records.length}</span> of <span className="font-bold">{data.total.toLocaleString()}</span> records
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => loadPage(data.page - 1)}
            disabled={data.page === 1 || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium">Page {data.page} of {data.totalPages}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => loadPage(data.page + 1)}
            disabled={data.page === data.totalPages || isPending}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
