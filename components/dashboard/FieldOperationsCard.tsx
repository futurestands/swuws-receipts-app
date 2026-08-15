"use client"

import { isNative } from "@/lib/mobile-hardware"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { WifiOff, Calculator, Banknote, Search, ArrowRight } from "lucide-react"
import Link from "next/link"

export function FieldOperationsCard() {
  if (!isNative()) return null

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <WifiOff className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-black text-primary uppercase tracking-tight leading-none">Field Mode Active</h3>
              <p className="text-xs text-muted-foreground font-medium mt-1 uppercase tracking-tighter">
                 Zero Internet Required · Automatic Sync
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
             <Button variant="outline" size="sm" asChild className="h-10 font-bold bg-white text-[10px] uppercase">
                <Link href="/dashboard/offline">
                   <Search className="h-3.5 w-3.5 mr-2" /> Find Customer
                </Link>
             </Button>
             <Button variant="default" size="sm" asChild className="h-10 font-bold text-[10px] uppercase shadow-md">
                <Link href="/dashboard/offline">
                   Start Work <ArrowRight className="h-3.5 w-3.5 ml-2" />
                </Link>
             </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
