import { LoadingState } from "@/components/ui/empty-state"

/**
 * The admin console had no loading state at all. Its page.tsx runs a
 * large Promise.all of many independent DB queries (agents, audit logs,
 * stats, collections, printing reports, clusters, branches, tariffs,
 * templates, IAM roles...) before rendering anything, so a visible gap
 * here is one of the most likely places in the app for someone to click
 * "Admin" and genuinely wonder if it registered.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-5 w-64 animate-pulse rounded-md bg-muted" />
      <LoadingState variant="cards" />
    </div>
  )
}
