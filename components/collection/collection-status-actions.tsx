"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateCollectionPeriodStatus } from "@/app/actions/billing"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  PlayCircle,
  XCircle,
  Archive,
  Loader2,
  AlertTriangle
} from "lucide-react"
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

interface Props {
  periodId: string
  currentStatus: string
  canActivate: boolean
  canArchive: boolean
  endDate?: Date | string | null
}

export function CollectionStatusActions({ periodId, currentStatus, canActivate, canArchive }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  async function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      try {
        const result = await updateCollectionPeriodStatus(periodId, newStatus)
        if (result.ok) {
          toast.success(`Period status updated to ${newStatus}`)
          router.refresh()
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to update status"
        toast.error(message)
      }
    })
  }

  if (currentStatus === 'archived') return null

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus === 'draft' && (
        <Button size="sm" onClick={() => handleStatusChange('validated')} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Mark as Validated
        </Button>
      )}

      {currentStatus === 'validated' && (
        <>
          <Button size="sm" variant="outline" onClick={() => handleStatusChange('draft')} disabled={pending}>
            Back to Draft
          </Button>
          {canActivate && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={pending}>
                  <PlayCircle className="h-4 w-4 mr-2" /> Activate Collection
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Activate Billing Period?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will enable agents to issue receipts for this period.
                    Note: Only one period can be active at a time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleStatusChange('active')}>
                    Activate Now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      )}

      {currentStatus === 'active' && (
        <div className="flex flex-wrap items-center gap-2">
          {canActivate && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" disabled={pending}>
              <XCircle className="h-4 w-4 mr-2" /> Close Billing Period
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Close Billing Period early?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This stops receipts for this period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleStatusChange('closed')}>
                Close Period
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          )}
        </div>
      )}

      {currentStatus === 'closed' && canArchive && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={pending}>
              <Archive className="h-4 w-4 mr-2" /> Archive Period
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this period?</AlertDialogTitle>
              <AlertDialogDescription>
                This takes it off the live dashboard. Bills, receipts, and collections are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleStatusChange('archived')}>
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
