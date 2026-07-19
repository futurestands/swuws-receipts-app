"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatUGX } from "@/lib/format"
import { CollectionStatusBadge } from "@/components/collection/collection-status-badge"
import { AlertCircle, ArrowRight, TrendingUp } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CollectionSummaryProps {
  summary: {
    displayPeriod: {
      periodName: string
      status: string
      startDate: Date
      endDate: Date
    }
    isActive: boolean
    totalBilled: number
    totalCollected: number
    outstanding: number
    progress: number
    receiptsToday: number
    customersPaidToday: number
    daysRemaining: number
  } | null
}

export function CollectionSummaryCard({ summary }: CollectionSummaryProps) {
  if (!summary) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">No Active Billing Period</p>
              <p className="text-sm text-muted-foreground">Receipts cannot be issued until a period is activated.</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">
              Go to Billing Management <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { displayPeriod, totalBilled, totalCollected, outstanding, progress, daysRemaining } = summary

  /**
   * DASHBOARD METRIC DEFINITIONS (Alignment Phase 1)
   *
   * totalBilled: Total amount imported from the active Collection Period billing file.
   * totalCollected: Placeholder for the official collected amount.
   *                Future source: Daily Collection Import from the External Billing System.
   * outstanding: Current difference between Billed and Collected.
   *             Future phases will support over-collections.
   * receiptsToday: Operational receipt count displayed as "Receipts Printed".
   */

  // Health Calculation
  let health: { label: string, color: string } = { label: "Good", color: "text-green-600" }
  if (progress < 20 && daysRemaining < 15) health = { label: "Warning", color: "text-amber-600" }
  if (progress < 50 && daysRemaining < 7) health = { label: "Critical", color: "text-destructive" }
  if (progress > 80) health = { label: "Excellent", color: "text-blue-600" }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              Current Billing Period
              {summary.isActive && (
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", health.color.replace('text', 'bg').replace('600', '100'), health.color.replace('text', 'border'))}>
                  Health: {health.label}
                </span>
              )}
            </CardTitle>
            <p className="text-2xl font-bold">{displayPeriod.periodName}</p>
          </div>
          <div className="text-right space-y-2">
            <CollectionStatusBadge status={displayPeriod.status} />
            <p className="text-xs text-muted-foreground">
              {daysRemaining} days remaining
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {!summary.isActive && summary.displayPeriod.status !== 'closed' && (
           <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
             <AlertCircle className="h-4 w-4" />
             This period is not Active. Customers cannot pay yet.
           </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Collection Progress</span>
            <span className="font-bold">{progress.toFixed(1)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Billed</p>
            <p className="text-sm font-semibold">{formatUGX(totalBilled)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Collected</p>
            <p className="text-sm font-semibold text-primary">{formatUGX(totalCollected)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Outstanding</p>
            <p className="text-sm font-semibold text-destructive">{formatUGX(outstanding)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground text-right">Receipts Printed</p>
            <p className="text-sm font-semibold text-right">{summary.receiptsToday}</p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/5">
            <Link href="/dashboard/billing">
              Full Management Hub <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
