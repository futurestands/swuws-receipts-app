import { LoadingState } from "@/components/ui/empty-state"

export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
      <LoadingState variant="table" rows={6} />
    </div>
  )
}
