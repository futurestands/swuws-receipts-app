"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ComplaintDetailsSheet } from "./complaint-details-sheet"
import type { CrmComplaint } from "@/lib/db/schema"

interface ComplaintRowActionsProps {
  complaint: CrmComplaint & {
    categoryName?: string;
    assignedToName?: string;
    customerAccount?: string;
    areaName?: string;
  }
}

export function ComplaintRowActions({ complaint }: ComplaintRowActionsProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 px-4 text-[10px] font-black uppercase tracking-widest bg-white text-[#0369a1] border-slate-200 hover:bg-[#0369a1] hover:text-white transition-all shadow-sm"
      >
        Details
      </Button>

      <ComplaintDetailsSheet
        complaint={complaint}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
